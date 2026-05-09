import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runPacta } from "../src/pacta.js";

export const config = { maxDuration: 60 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const mockParam = url.searchParams.get("mock");
  const mockBody = (req.body as { mock?: boolean } | undefined)?.mock === true;
  const useMock =
    mockParam === "1" ||
    mockParam === "true" ||
    mockBody ||
    !process.env.ANTHROPIC_API_KEY;

  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("X-Pacta-Mode", useMock ? "mock" : "live");
  res.flushHeaders?.();

  const write = (obj: unknown) => {
    res.write(JSON.stringify(obj) + "\n");
  };

  try {
    for await (const ev of runPacta({ mock: useMock })) {
      write(ev);
    }
    res.end();
  } catch (err) {
    write({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    res.end();
  }
}
