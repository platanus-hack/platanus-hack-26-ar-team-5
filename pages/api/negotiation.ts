import type { NextApiRequest, NextApiResponse } from "next";
import { runPacta, listScenarios } from "../../src/pacta";
import { withApiAuthPagesRouter } from "../../lib/auth/api-auth";

export const config = { maxDuration: 60 };

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const body = (req.body ?? {}) as { mock?: boolean; scenario?: string };

  const mockParam = url.searchParams.get("mock");
  const useMock =
    mockParam === "1" ||
    mockParam === "true" ||
    body.mock === true ||
    !process.env.ANTHROPIC_API_KEY;

  const scenarioParam = url.searchParams.get("scenario") ?? body.scenario;
  const known = new Set(listScenarios().map((s) => s.id));
  if (scenarioParam && !known.has(scenarioParam)) {
    res.status(400).json({
      error: `Unknown scenario '${scenarioParam}'`,
      available: listScenarios(),
    });
    return;
  }

  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("X-Pacta-Mode", useMock ? "mock" : "live");
  res.setHeader("X-Pacta-Scenario", scenarioParam ?? "ai-overrun");
  // @ts-expect-error: NextApiResponse extends ServerResponse but flushHeaders is not in the type
  res.flushHeaders?.();

  const write = (obj: unknown) => {
    res.write(JSON.stringify(obj) + "\n");
  };

  try {
    for await (const ev of runPacta({ mock: useMock, scenario: scenarioParam })) {
      write(ev);
    }
    res.end();
  } catch (err) {
    write({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    res.end();
  }
}

export default withApiAuthPagesRouter(handler, { allowSession: true });
