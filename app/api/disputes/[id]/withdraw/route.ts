import { getDispute } from "../../../../../src/dispute_store";
import { withdrawFromDispute } from "../../../../../src/dispute_engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/disputes/:id/withdraw — operator-side unilateral exit, restricted
 *  to demo disputes only.
 *
 *  Body: { role: "aria" | "atlas", reason?: string }
 *
 *  This endpoint is for dashboard-seeded demos where BOTH controllers are
 *  Claude — there is no real BYO party to authorize the walk, so Pacta acts
 *  as operator for the demo lifecycle. The handler looks up the stored
 *  role_token server-side rather than requiring the caller to supply it.
 *
 *  Real BYO disputes (any external controller) MUST use MCP `withdraw_dispute`
 *  with the role_token returned by `open_dispute` / `join_dispute`. The HTTP
 *  endpoint refuses to act on them — otherwise any third party with the
 *  dispute_id could permanently terminate someone else's negotiation. */
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
    const isDemoDispute =
      state.controllers.aria === "claude" && state.controllers.atlas === "claude";
    if (!isDemoDispute) {
      return Response.json(
        {
          error:
            "this endpoint is for demo disputes only (both controllers Claude). " +
            "Real BYO disputes must use MCP withdraw_dispute with the role_token " +
            "returned by open_dispute / join_dispute.",
        },
        { status: 403 },
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
