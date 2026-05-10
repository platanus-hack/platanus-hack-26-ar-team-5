import { dumpDispute, deleteDispute } from "../../../../src/dispute_store";
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

export const DELETE = withApiAuthAppRouter<{ id: string }>(async (_req, ctx) => {
  const { id } = await ctx.params;
  await deleteDispute(id);
  return Response.json({ ok: true }, {
    headers: { "X-Pacta-Dispute-Id": id },
  });
}, { allowSession: true });
