import test from "node:test";
import assert from "node:assert/strict";
import {
  requestSchema,
  textLengthOf,
  toSafeHistory,
  type AdminAssistantUiMessage,
} from "../../lib/admin-assistant/request.ts";
import {
  findCustomerInputSchema,
  listOrdersInputSchema,
  orderNumberSchema,
  searchQuerySchema,
} from "../../lib/admin-assistant/schemas.ts";

const userMessage = {
  role: "user" as const,
  parts: [{ type: "text" as const, text: "Where is order SLN-ABC-123?" }],
};

test("assistant request: the AI SDK transport envelope is accepted, unknown keys rejected", () => {
  const parsed = requestSchema.safeParse({
    messages: [userMessage],
    id: "chat-1",
    trigger: "submit-message",
    messageId: "msg-2",
    context: { path: "/admin/orders", entity: { type: "order", ref: "SLN-ABC-123" } },
    locale: "vi",
  });

  assert.equal(parsed.success, true);

  assert.equal(
    requestSchema.safeParse({ messages: [userMessage], unexpected: true }).success,
    false
  );
  assert.equal(requestSchema.safeParse({ messages: [] }).success, false);
});

test("assistant request: the context entity reference is bounded and URL-safe", () => {
  assert.equal(
    requestSchema.safeParse({
      messages: [userMessage],
      context: { path: "/admin/orders", entity: { type: "order", ref: "../../etc/passwd" } },
    }).success,
    false
  );
  assert.equal(
    requestSchema.safeParse({
      messages: [userMessage],
      context: { path: "/admin/orders", entity: { type: "customer", ref: "abc-123" } },
    }).success,
    true
  );
  assert.equal(
    requestSchema.safeParse({
      messages: [userMessage],
      context: { path: "/admin/orders", entity: { type: "invoice", ref: "abc" } },
    }).success,
    false
  );
});

test("textLengthOf counts only text parts and ignores tool payloads", () => {
  const message: AdminAssistantUiMessage = {
    role: "assistant",
    parts: [
      { type: "text", text: "hello" },
      { type: "text", text: "world" },
    ] as AdminAssistantUiMessage["parts"],
  };

  assert.equal(textLengthOf(message), 10);
});

test("toSafeHistory keeps completed tool calls and drops interrupted ones", () => {
  const messages: AdminAssistantUiMessage[] = [
    {
      role: "user",
      parts: [{ type: "text", text: "hello" }],
    },
    {
      role: "assistant",
      parts: [
        { type: "tool-getOrderDetail", state: "output-available" },
        { type: "tool-findOrder", state: "input-streaming" },
        { type: "text", text: "Checking." },
      ] as AdminAssistantUiMessage["parts"],
    },
    {
      role: "assistant",
      parts: [{ type: "tool-listOrders", state: "input-streaming" }] as AdminAssistantUiMessage["parts"],
    },
  ];

  const safe = toSafeHistory(messages);

  assert.equal(safe.length, 2);
  assert.deepEqual(
    safe[1].parts.map((part) => part.type),
    ["tool-getOrderDetail", "text"]
  );
});

test("tool schemas: search text rejects filter syntax but keeps % and _ literal", () => {
  for (const hostile of ["a,b", "a(b)", "a\"b", "a'b", "a:b", "a\\b"]) {
    assert.equal(searchQuerySchema.safeParse(hostile).success, false, hostile);
  }

  assert.equal(searchQuerySchema.safeParse("50%_off").success, true);
  assert.equal(searchQuerySchema.safeParse("Nguyễn Văn A").success, true);
});

test("tool schemas: limits are capped and order numbers are bounded", () => {
  assert.deepEqual(listOrdersInputSchema.parse({}), { limit: 5 });
  assert.equal(listOrdersInputSchema.safeParse({ limit: 11 }).success, false);
  assert.equal(listOrdersInputSchema.safeParse({ limit: 0 }).success, false);
  assert.equal(listOrdersInputSchema.safeParse({ status: "refunded" }).success, false);

  assert.equal(orderNumberSchema.safeParse("SLN-ABC-123").success, true);
  assert.equal(orderNumberSchema.safeParse("SLN ABC 123").success, false);
  assert.equal(orderNumberSchema.safeParse("x").success, false);

  assert.equal(findCustomerInputSchema.safeParse({ query: "" }).success, false);
});
