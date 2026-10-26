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
} from "./schemas";
import {
  assistantDashboardMetrics,
  assistantFindCustomer,
  assistantFindOrders,
  assistantListOrders,
  assistantLowStock,
  assistantOrderDetail,
  assistantOrderSummary,
  assistantProductStock,
} from "./reads";
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
  rowCount: (result: TResult) => number
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
      args,
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
 * Build the tool set for one request. Returns only the tools this actor may
 * use; an actor with no readable domain (not reachable through /admin) gets an
 * empty set.
 */
export function createAdminAssistantTools(actor: ActorContext): ToolSet {
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
