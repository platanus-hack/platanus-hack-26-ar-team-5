import { listScenarios, runPacta } from "../../../src/pacta";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}

async function handle(req: Request) {
  const url = new URL(req.url);

  let body: { mock?: boolean; scenario?: string } = {};
  if (req.method === "POST") {
    try {
      body = (await req.json()) as typeof body;
    } catch {
      body = {};
    }
  }

  const mockParam = url.searchParams.get("mock");
  const useMock =
    mockParam === "1" ||
    mockParam === "true" ||
    body.mock === true ||
    !process.env.ANTHROPIC_API_KEY;

  const scenarioParam = url.searchParams.get("scenario") ?? body.scenario ?? undefined;
  const known = new Set(listScenarios().map((s) => s.id));
  if (scenarioParam && !known.has(scenarioParam)) {
    return Response.json(
      {
        error: `Unknown scenario '${scenarioParam}'`,
        available: listScenarios(),
      },
      { status: 400 },
    );
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (obj: unknown) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      };
      try {
        for await (const ev of runPacta({ mock: useMock, scenario: scenarioParam })) {
          write(ev);
        }
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
      "Access-Control-Allow-Origin": "*",
      "X-Pacta-Mode": useMock ? "mock" : "live",
      "X-Pacta-Scenario": scenarioParam ?? "ai-overrun",
    },
  });
}
