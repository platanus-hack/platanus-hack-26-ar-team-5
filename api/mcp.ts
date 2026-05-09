import type { VercelRequest, VercelResponse } from "@vercel/node";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildPactaMcpServer } from "../src/mcp_server.js";

export const config = { maxDuration: 60 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS for browser-based MCP clients.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Mcp-Session-Id, Mcp-Protocol-Version",
  );
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id, Mcp-Protocol-Version");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  // Stateless transport — fresh per request. Matches Vercel serverless lifecycle.
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const server = buildPactaMcpServer();
  await server.connect(transport);
  try {
    await transport.handleRequest(req, res, req.body);
  } finally {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  }
}
