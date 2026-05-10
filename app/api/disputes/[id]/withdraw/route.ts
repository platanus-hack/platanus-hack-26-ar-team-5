import { getDispute } from "../../../../../src/dispute_store";
import { withdrawFromDispute } from "../../../../../src/dispute_engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/disputes/:id/withdraw — operator-side unilateral exit.
 *
 *  Body: { role: "aria" | "atlas", reason?: string }
 *
 *  This is for dashboard-seeded demo disputes where both controllers are Claude
 *  and the dashboard acts as the operator. We look up the role's stored token
 *  server-side rather than requiring the caller to supply it.
 *
 *  For real BYO disputes (parties holding their own tokens), Withdraw is
 *  exposed over MCP via `withdraw_dispute` instead. */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  let body: { role?: "aria" | "atlas"; reason?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }
  const role = body.role;
  if (role !== "aria" && role !== "atlas") {
    return Response.json(
      { error: "role must be 'aria' or 'atlas'" },
      { status: 400 },
    );
  }
  try {
    const state = await getDispute(id);
    if (state.finalized) {
      return Response.json(
        { error: "dispute is already finalized" },
        { status: 409 },
      );
    }
    const role_token = state.role_tokens[role];
    const result = await withdrawFromDispute({
      dispute_id: id,
      role_token,
      reason: body.reason,
    });
    return Response.json(
      {
        ok: true,
        events: result.events.length,
        finalized: result.state.finalized,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
