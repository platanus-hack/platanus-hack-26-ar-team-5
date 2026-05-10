import {
  dumpDispute,
  deleteDispute,
  getDispute,
} from "../../../../src/dispute_store";
import { withApiAuthAppRouter } from "../../../../lib/auth/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiAuthAppRouter<{ id: string }>(async (_req, ctx) => {
  const { id } = await ctx.params;
  try {
    const dump = await dumpDispute(id);
    return Response.json(dump, {
      headers: { "Cache-Control": "no-store", "X-Pacta-Dispute-Id": id },
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 404 },
    );
  }
}, { allowSession: true });

/** DELETE /api/disputes/:id — restricted to demo disputes only.
 *
 *  Demo dispute = both controllers are 'claude' (no real BYO party owns the
 *  audit trail). Real BYO disputes (any external controller) cannot be
 *  deleted via this HTTP endpoint — the bundle is the artifact, and a
 *  third party with the dispute_id should not be able to wipe it. If you
 *  need to clear a real dispute from storage, do it server-side / out-of-band.
 *
 *  Auth: gated by `withApiAuthAppRouter` so a session or API key is required;
 *  the demo-only check below is an additional rail on top of auth so even
 *  authenticated callers can't delete real signed audit trails. */
export const DELETE = withApiAuthAppRouter<{ id: string }>(async (_req, ctx) => {
  const { id } = await ctx.params;
  let state: Awaited<ReturnType<typeof getDispute>>;
  try {
    state = await getDispute(id);
  } catch {
    // Already gone (or never existed). Idempotent success.
    return Response.json({ ok: true });
  }
  const isDemoDispute =
    state.controllers.aria === "claude" && state.controllers.atlas === "claude";
  if (!isDemoDispute) {
    return Response.json(
      {
        error:
          "DELETE is only allowed for demo disputes (both controllers Claude). " +
          "Real BYO disputes hold a permanent signed audit trail and cannot be " +
          "deleted via the public HTTP endpoint.",
      },
      { status: 403 },
    );
  }
  await deleteDispute(id);
  return Response.json({ ok: true }, {
    headers: { "X-Pacta-Dispute-Id": id },
  });
}, { allowSession: true });
