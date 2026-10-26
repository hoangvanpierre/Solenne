"use server";

import { generateText } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { AuthError, requireAnyPermission } from "@/lib/authz";
import { ADMIN_ASSISTANT_MODEL_ID } from "@/lib/admin-assistant/model";
import {
  buildProductCopyPrompt,
  isCopyApplyable,
  parseDescriptionOutput,
  parseScentNotesOutput,
  productCopyRequestSchema,
  type ProductCopyNotes,
} from "@/lib/admin-assistant/product-copy";

// ---------------------------------------------------------------------------
// Solenne admin assistant — product copy drafting (Phase 2, part B).
//
// A server action rather than a public route: it is called from the product
// form only, after the operator already holds a product-editing permission.
//
// What it does: validate the form-derived input, ask Workers AI for one JSON
// object, validate that object against the form, and hand the text back.
//
// What it does NOT do: touch the database. No product, variant or stock row is
// read or written here, and the action never saves anything. "Apply" in the
// form only fills a field; the existing Save button performs the write with its
// own permission check and validation.
//
// `applyable` is false for Vietnamese output because `products` stores English
// only — see the migration proposal in the Phase 2 report.
// ---------------------------------------------------------------------------

export type ProductCopyErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "validation"
  | "unsupported"
  | "rate_limited"
  | "unparsed"
  | "shape"
  | "too_short"
  | "too_long"
  | "layer_mismatch"
  | "unknown_notes"
  | "unavailable";

export interface ProductCopyActionState {
  ok: boolean;
  code?: ProductCopyErrorCode;
  text?: string;
  notes?: ProductCopyNotes;
  warnings?: string[];
  applyable?: boolean;
}

const MAX_OUTPUT_TOKENS = 700;

export async function generateProductCopyAction(
  input: unknown
): Promise<ProductCopyActionState> {
  // 1. Permission. The layout does not protect server actions; this does.
  let actor;
  try {
    actor = await requireAnyPermission(["product.create", "product.update"]);
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        ok: false,
        code: error.status === 401 ? "unauthenticated" : "forbidden",
      };
    }

    console.error("[product-copy] authorization failed", error);
    return { ok: false, code: "unavailable" };
  }

  // 2. Input validation. The form is untrusted in exactly the same way a
  //    request body is.
  const parsed = productCopyRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "validation" };
  }

  const request = parsed.data;

  // 3. Mode-specific permission: creating copy needs product.create, editing an
  //    existing product needs product.update. Holding one does not imply the
  //    other.
  const required =
    request.mode === "create" ? "product.create" : "product.update";
  if (!actor.permissions.includes(required)) {
    return { ok: false, code: "forbidden" };
  }

  // 4. Generating scent notes from nothing would invent ingredients, so only
  //    polishing or translating the notes already in the form is allowed.
  if (request.target === "scentNotes" && request.task === "generate") {
    return { ok: false, code: "unsupported" };
  }

  try {
    const { env } = await getCloudflareContext({ async: true });

    // 5. Same per-user limiter as the drawer, under its own key so a copy
    //    request cannot starve a conversation (or the reverse).
    const limiter = env.ADMIN_ASSISTANT_LIMITER;
    if (limiter) {
      const { success } = await limiter.limit({
        key: `product-copy:${actor.userId}`,
      });
      if (!success) {
        return { ok: false, code: "rate_limited" };
      }
    }

    const { system, prompt } = buildProductCopyPrompt(request);
    const workersai = createWorkersAI({ binding: env.AI });

    const { text } = await generateText({
      model: workersai(ADMIN_ASSISTANT_MODEL_ID),
      system,
      prompt,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      temperature: 0.4,
    });

    if (request.target === "description") {
      const result = parseDescriptionOutput(text);
      if (!result.ok) return { ok: false, code: result.code };

      return {
        ok: true,
        text: result.text,
        warnings: result.warnings,
        applyable: isCopyApplyable(request.targetLanguage, result.warnings),
      };
    }

    const result = parseScentNotesOutput(text, request);
    if (!result.ok) return { ok: false, code: result.code };

    return {
      ok: true,
      notes: result.notes,
      warnings: result.warnings,
      applyable: isCopyApplyable(request.targetLanguage, result.warnings),
    };
  } catch (error) {
    console.error("[product-copy] generation failed", error);
    return { ok: false, code: "unavailable" };
  }
}
