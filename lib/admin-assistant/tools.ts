import { tool, type ToolSet } from "ai";
import type { ActorContext } from "@/types";
import { AuthError } from "@/lib/authz";
import {
  canUseTool,
  TOOL_CATALOGUE,
  type AdminAssistantToolName,
} from "./access";
import {
  findCustomerInputSchema,
  findOrderInputSchema,
  getDashboardMetricsInputSchema,
  getOrderDetailInputSchema,
  getOrderSummaryInputSchema,
  getProductStockInputSchema,
  listLowStockInputSchema,
  listOrdersInputSchema,
  draftCustomerEmailInputSchema,
  proposeCancelOrderInputSchema,
  proposeFulfillmentTransitionInputSchema,
  proposeInventoryAdjustmentInputSchema,
} from "./schemas";
import {
  assistantDashboardMetrics,
  assistantFindCustomer,
  assistantFindOrders,
  assistantListOrders,
  assistantLowStock,
  assistantOrderDetail,
  assistantOrderProposalState,
  assistantOrderSummary,
  assistantProductStock,
  assistantVariantProposalState,
} from "./reads";
import {
  buildCancelProposal,
  buildFulfillmentProposal,
  buildInventoryProposal,
  type AssistantProposal,
  type ProposalLocale,
} from "./proposals";
import { recordAssistantToolUse } from "./audit";

// ---------------------------------------------------------------------------
// Solenne admin assistant — read-only tool registry.
//
// A tool is only BUILT when the actor holds its permission, so the model never
// sees a capability the operator lacks. `runTool()` re-checks the same rule
// before every execution — the filtered list is never the authorization
// boundary. Both checks read the permission set resolved from the database by
// lib/authz.ts, not a role name or a client-supplied value.
//
// No tool accepts free-form SQL, a column name, a sort expression or an id it
// can use to widen access. Inputs are closed enums, bounded integers and
// bounded search text; every query is built by the existing read helpers.
// ---------------------------------------------------------------------------

function errorCodeOf(error: unknown): string {
  if (error instanceof AuthError) return error.code;
  if (error instanceof Error) {
    if (error.message === "ASSISTANT_TOOL_FORBIDDEN") {
      return "ASSISTANT_TOOL_FORBIDDEN";
    }
    return "TOOL_FAILED";
  }
  return "TOOL_FAILED";
}

async function runTool<TResult>(
  name: AdminAssistantToolName,
  actor: ActorContext,
  args: Record<string, unknown>,
  execute: () => Promise<TResult>,
  rowCount: (result: TResult) => number,
  /**
   * Optional replacement for the audited arguments. Proposal tools use it to
   * record the resolved target, outcome and blocker codes instead of echoing
   * the model's raw input a second time. It never changes authorization.
   */
  auditArgs?: (result: TResult) => Record<string, unknown>
): Promise<TResult> {
  // Defence in depth: the tool list was filtered, but execute() is the real
  // gate. A model that invents a tool name cannot reach a denied helper.
  if (!canUseTool(name, actor.permissions)) {
    await recordAssistantToolUse({
      actor,
      tool: name,
      args,
      rowCount: 0,
      ok: false,
      errorCode: "ASSISTANT_TOOL_FORBIDDEN",
    });
    throw new Error("ASSISTANT_TOOL_FORBIDDEN");
  }

  try {
    const result = await execute();

    await recordAssistantToolUse({
      actor,
      tool: name,
      args: auditArgs ? auditArgs(result) : args,
      rowCount: rowCount(result),
      ok: true,
    });

    return result;
  } catch (error) {
    await recordAssistantToolUse({
      actor,
      tool: name,
      args,
      rowCount: 0,
      ok: false,
      errorCode: errorCodeOf(error),
    });
    throw error;
  }
}

/**
 * Audit arguments for a proposal: which action, which target, whether it was
 * ready or blocked, and the blocker codes. Never the free-text reason, which is
 * bounded by sanitizeArguments() but still operator prose.
 */
function proposalAuditArgs(proposal: AssistantProposal): Record<string, unknown> {
  return {
    proposalType: proposal.type,
    targetRef: proposal.targetRef,
    targetId: proposal.targetId,
    status: proposal.status,
    blockerCodes: proposal.blockerCodes,
  };
}

/**
 * Build the tool set for one request. Returns only the tools this actor may
 * use; an actor with no readable domain (not reachable through /admin) gets an
 * empty set.
 */
export function createAdminAssistantTools(
  actor: ActorContext,
  locale: ProposalLocale = "en"
): ToolSet {
  const permissions = actor.permissions;
  const tools: ToolSet = {};

  if (canUseTool("getOrderSummary", permissions)) {
    tools.getOrderSummary = tool({
      description: `${TOOL_CATALOGUE.getOrderSummary.description} Use range "today" unless the operator asks for a wider window. Counts only: no admin screen shows a revenue total, so never total, average or estimate money.`,
      inputSchema: getOrderSummaryInputSchema,
      execute: async (input) =>
        runTool(
          "getOrderSummary",
          actor,
          input,
          () => assistantOrderSummary(input.range),
          () => 1
        ),
    });
  }

  if (canUseTool("listOrders", permissions)) {
    tools.listOrders = tool({
      description: `${TOOL_CATALOGUE.listOrders.description} Set olderThanDays to find stale orders (for example 2 with status "pending" for unpaid orders older than two days). limit defaults to 5 and never exceeds 10.`,
      inputSchema: listOrdersInputSchema,
      execute: async (input) =>
        runTool(
          "listOrders",
          actor,
          input,
          () =>
            assistantListOrders({
              status: input.status,
              olderThanDays: input.olderThanDays,
              limit: input.limit,
            }),
          (result) => result.returnedCount
        ),
    });
  }

  if (canUseTool("findOrder", permissions)) {
    tools.findOrder = tool({
      description: `${TOOL_CATALOGUE.findOrder.description} The query may be an order number, a uuid, an email or part of a customer name.`,
      inputSchema: findOrderInputSchema,
      execute: async (input) =>
        runTool(
          "findOrder",
          actor,
          input,
          () => assistantFindOrders(input.query, TOOL_CATALOGUE.findOrder.rowCap),
          (result) => result.returnedCount
        ),
    });
  }

  if (canUseTool("getOrderDetail", permissions)) {
    tools.getOrderDetail = tool({
      description: `${TOOL_CATALOGUE.getOrderDetail.description} Returns found:false when the order number does not exist.`,
      inputSchema: getOrderDetailInputSchema,
      execute: async (input) =>
        runTool(
          "getOrderDetail",
          actor,
          input,
          async () => {
            const order = await assistantOrderDetail(input.orderNumber);
            return order
              ? { found: true as const, order }
              : { found: false as const, orderNumber: input.orderNumber };
          },
          (result) => (result.found ? result.order.items.length : 0)
        ),
    });
  }

  if (canUseTool("listLowStock", permissions)) {
    tools.listLowStock = tool({
      description: `${TOOL_CATALOGUE.listLowStock.description} limit defaults to 10 and never exceeds 15.`,
      inputSchema: listLowStockInputSchema,
      execute: async (input) =>
        runTool(
          "listLowStock",
          actor,
          input,
          () => assistantLowStock(input.limit),
          (result) => result.returnedCount
        ),
    });
  }

  if (canUseTool("getProductStock", permissions)) {
    tools.getProductStock = tool({
      description: `${TOOL_CATALOGUE.getProductStock.description} Use the product name or slug; partial names are accepted.`,
      inputSchema: getProductStockInputSchema,
      execute: async (input) =>
        runTool(
          "getProductStock",
          actor,
          input,
          () =>
            assistantProductStock(
              input.nameOrSlug,
              TOOL_CATALOGUE.getProductStock.rowCap
            ),
          (result) => result.returnedCount
        ),
    });
  }

  if (canUseTool("findCustomer", permissions)) {
    tools.findCustomer = tool({
      description: `${TOOL_CATALOGUE.findCustomer.description} Never ask for or repeat a full address; only the summary fields are available. Order count and lifetime spend are included only when the operator can read orders.`,
      inputSchema: findCustomerInputSchema,
      execute: async (input) =>
        runTool(
          "findCustomer",
          actor,
          input,
          () =>
            assistantFindCustomer(
              input.query,
              TOOL_CATALOGUE.findCustomer.rowCap,
              { includeOrderMetrics: permissions.includes("order.read") }
            ),
          (result) => result.returnedCount
        ),
    });
  }

  if (canUseTool("getDashboardMetrics", permissions)) {
    tools.getDashboardMetrics = tool({
      description: TOOL_CATALOGUE.getDashboardMetrics.description,
      inputSchema: getDashboardMetricsInputSchema,
      execute: async (input) =>
        runTool(
          "getDashboardMetrics",
          actor,
          input,
          () => assistantDashboardMetrics(permissions),
          () => 1
        ),
    });
  }

  // Phase 2 — drafting. UI-only and side-effect free: execute() echoes the
  // validated text so the drawer can render it. No database call, no mail
  // client, no storage. The audit row written by runTool records the tool name,
  // the language and the (truncated) subject — not the whole body.
  if (canUseTool("draftCustomerEmail", permissions)) {
    tools.draftCustomerEmail = tool({
      description: `${TOOL_CATALOGUE.draftCustomerEmail.description} Write in the operator's requested language; when they do not say, use Vietnamese if the shipping country is Vietnam, otherwise English. Keep the voice gentle, refined and concise: 3 to 6 sentences, no exclamation marks, no emoji, no marketing hyperbole, no medical or safety claims, and sign as "Solenne".`,
      inputSchema: draftCustomerEmailInputSchema,
      execute: async (input) =>
        runTool(
          "draftCustomerEmail",
          actor,
          // The audit trail records that a draft was produced and in which
          // language — never the prose, which may quote customer data.
          {
            language: input.language,
            subject: input.subject,
            bodyLength: input.body.length,
          },
          async () => ({ ...input }),
          () => 0
        ),
    });
  }

  // Phase 3 — action proposals. Each one reads the target's current state,
  // runs the SAME precondition rules as the real action, and returns a card.
  // Nothing here writes: the drawer's confirmation calls the existing server
  // action, which re-validates and invokes the atomic RPC.
  if (canUseTool("proposeCancelOrder", permissions)) {
    tools.proposeCancelOrder = tool({
      description: `${TOOL_CATALOGUE.proposeCancelOrder.description} Use the exact order number. A reason is optional; pass the operator's own words when they give one.`,
      inputSchema: proposeCancelOrderInputSchema,
      execute: async (input) =>
        runTool(
          "proposeCancelOrder",
          actor,
          input,
          async () => {
            const state = await assistantOrderProposalState(input.orderNumber);
            return buildCancelProposal({
              state,
              orderNumber: input.orderNumber,
              reason: input.reason,
              permissions,
              locale,
            });
          },
          () => 0,
          proposalAuditArgs
        ),
    });
  }

  if (canUseTool("proposeFulfillmentTransition", permissions)) {
    tools.proposeFulfillmentTransition = tool({
      description: `${TOOL_CATALOGUE.proposeFulfillmentTransition.description} Use the exact order number and one of the three targets: processing, shipped or delivered. Never propose "paid" or "cancelled".`,
      inputSchema: proposeFulfillmentTransitionInputSchema,
      execute: async (input) =>
        runTool(
          "proposeFulfillmentTransition",
          actor,
          input,
          async () => {
            const state = await assistantOrderProposalState(input.orderNumber);
            return buildFulfillmentProposal({
              state,
              orderNumber: input.orderNumber,
              toStatus: input.toStatus,
              permissions,
              locale,
            });
          },
          () => 0,
          proposalAuditArgs
        ),
    });
  }

  if (canUseTool("proposeInventoryAdjustment", permissions)) {
    tools.proposeInventoryAdjustment = tool({
      description: `${TOOL_CATALOGUE.proposeInventoryAdjustment.description} Use the exact SKU or the variant name. The delta is a non-zero integer (positive receives stock, negative removes it) and the reason is 3–255 characters.`,
      inputSchema: proposeInventoryAdjustmentInputSchema,
      execute: async (input) =>
        runTool(
          "proposeInventoryAdjustment",
          actor,
          input,
          async () => {
            const { match, matches } = await assistantVariantProposalState(
              input.variantRef
            );
            return buildInventoryProposal({
              variant: match,
              candidates: matches,
              variantRef: input.variantRef,
              delta: input.delta,
              reason: input.reason,
              permissions,
              locale,
            });
          },
          () => 0,
          proposalAuditArgs
        ),
    });
  }

  return tools;
}

/** Catalogue entries for the prompt, filtered to the built tool set. */
export function promptToolSummaries(tools: ToolSet) {
  return Object.keys(tools).map((name) => ({
    name,
    description:
      TOOL_CATALOGUE[name as AdminAssistantToolName]?.description ?? name,
  }));
}
