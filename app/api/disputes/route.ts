import {
  listDisputeSummaries,
  openDemoDispute,
  getDispute,
} from "../../../src/dispute_store";
import { advanceClaudeTurns } from "../../../src/dispute_engine";
import { listScenarios } from "../../../src/scenarios/index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const encoder = new TextEncoder();

export async function GET() {
  const summaries = await listDisputeSummaries();
  const scenarios = listScenarios();
  return Response.json({ disputes: summaries, scenarios });
}

/** POST /api/disputes — seed a demo dispute (both sides Claude-driven) and
 *  stream the engine events as NDJSON. The first line is always
 *  `{"kind":"dispute.created", dispute_id, scenario, created_at}` so the
 *  client can navigate to the new dispute immediately. The function stays
 *  alive until the negotiation terminates (convergence, ruling, or deadline)
 *  — state is persisted between every Claude turn, so observers polling
 *  GET /api/disputes/:id see progress in real time even if the stream
 *  consumer disconnects. */
export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      {
        error:
          "ANTHROPIC_API_KEY is not configured. The dashboard runs live MCP " +
          "disputes and needs the key to drive both Claude agents.",
      },
      { status: 400 },
    );
  }

  let body: { scenario_id?: string; max_rounds?: number } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  const scenario_id = body.scenario_id ?? "ai-overrun";
  const max_rounds = body.max_rounds ?? 5;

  const known = new Set(listScenarios().map((s) => s.id));
  if (!known.has(scenario_id)) {
    return Response.json(
      { error: `Unknown scenario '${scenario_id}'`, available: [...known] },
      { status: 400 },
    );
  }

  const { dispute_id, scenario, created_at } = await openDemoDispute({
    scenario_id,
    max_rounds,
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (obj: unknown) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      };
      try {
        write({
          kind: "dispute.created",
          dispute_id,
          scenario: { id: scenario.id, name: scenario.name },
          created_at,
        });
        const live = await getDispute(dispute_id);
        const events = await advanceClaudeTurns(live);
        for (const ev of events) write(ev);
        write({ kind: "stream.end" });
      } catch (err) {
        write({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Pacta-Dispute-Id": dispute_id,
    },
  });
}
