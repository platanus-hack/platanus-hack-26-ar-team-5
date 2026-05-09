#!/usr/bin/env tsx
/**
 * Local Pacta MCP server. Single Node process, in-memory dispute state lives
 * for the lifetime of the process — guaranteed shared across MCP requests.
 * Use this for two-agent live demos where Vercel cold-start would split state.
 *
 *   pnpm pacta:serve            # listens on http://localhost:3000/api/mcp
 *   pnpm agent --role aria  --open creative-brief --mcp-url http://localhost:3000/api/mcp
 *   pnpm agent --role atlas --dispute-id <id>      --mcp-url http://localhost:3000/api/mcp
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildPactaMcpServer } from "../src/mcp_server";
import { listScenarios, runPacta } from "../src/pacta";
import { loadEnv } from "../src/env";

loadEnv();

const port = Number(process.env.PORT ?? "3000");

function setCors(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Mcp-Session-Id, Mcp-Protocol-Version",
  );
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id, Mcp-Protocol-Version");
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  if (chunks.length === 0) return undefined;
  const text = Buffer.concat(chunks).toString("utf-8");
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${port}`);
  setCors(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (url.pathname === "/api/health") {
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        ok: true,
        name: "pacta-local",
        version: "0.1.0",
        has_anthropic_key: !!process.env.ANTHROPIC_API_KEY,
        timestamp: new Date().toISOString(),
      }),
    );
    return;
  }

  if (url.pathname === "/api/scenarios") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ scenarios: listScenarios() }));
    return;
  }

  if (url.pathname === "/api/negotiation" && req.method === "POST") {
    const body = (await readJson(req)) as { mock?: boolean; scenario?: string } | undefined;
    const mockParam = url.searchParams.get("mock");
    const useMock =
      mockParam === "1" ||
      mockParam === "true" ||
      body?.mock === true ||
      !process.env.ANTHROPIC_API_KEY;
    const scenarioParam = url.searchParams.get("scenario") ?? body?.scenario;
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Pacta-Mode", useMock ? "mock" : "live");
    try {
      for await (const ev of runPacta({ mock: useMock, scenario: scenarioParam })) {
        res.write(JSON.stringify(ev) + "\n");
      }
      res.end();
    } catch (err) {
      res.write(
        JSON.stringify({ kind: "error", message: (err as Error).message }) + "\n",
      );
      res.end();
    }
    return;
  }

  if (url.pathname === "/api/mcp") {
    // Stateless transport; PactaMcpServer's underlying state lives on
    // globalThis and is shared across requests within this process.
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const mcp = buildPactaMcpServer();
    await mcp.connect(transport);
    const body = await readJson(req);
    // Node-style transport reads from req/res. We pass already-parsed body.
    // Don't close eagerly — let the response complete first.
    res.on("close", () => {
      transport.close().catch(() => {});
      mcp.close().catch(() => {});
    });
    try {
      await transport.handleRequest(req, res, body);
    } catch (err) {
      console.error("MCP handler error:", err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end((err as Error).message);
      }
    }
    return;
  }

  res.statusCode = 404;
  res.end("not found: " + url.pathname);
});

server.listen(port, () => {
  console.log(`⚖  Pacta local MCP server`);
  console.log(`   MCP endpoint:    http://localhost:${port}/api/mcp`);
  console.log(`   Health:          http://localhost:${port}/api/health`);
  console.log(`   Scenarios:       http://localhost:${port}/api/scenarios`);
  console.log(`   Negotiation:     http://localhost:${port}/api/negotiation`);
  console.log(``);
  console.log(`Try the two-agent demo:`);
  console.log(
    `   pnpm agent --role aria  --open creative-brief --mcp-url http://localhost:${port}/api/mcp`,
  );
  console.log(
    `   pnpm agent --role atlas --dispute-id <id>      --mcp-url http://localhost:${port}/api/mcp`,
  );
  console.log(``);
});
