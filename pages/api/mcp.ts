/**
 * Pacta MCP server endpoint, exposed via Next.js Pages Router so Turbopack
 * bundles it the same way as the rest of the app (extensionless imports
 * resolve to the .ts source). The previous `api/mcp.ts` Vercel-native
 * function ran as raw Node ESM at runtime, which broke after the codebase
 * dropped explicit `.js` suffixes on relative imports.
 *
 * Pages Router gives us Node-style IncomingMessage / ServerResponse, which
 * is what `StreamableHTTPServerTransport` expects — so the existing MCP
 * server adapter wires up unchanged.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildPactaMcpServer } from "../../src/mcp_server";
import { withApiAuthPagesRouter } from "../../lib/auth/api-auth";

export const config = {
  api: {
    bodyParser: { sizeLimit: "4mb" },
  },
  maxDuration: 60,
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS for browser-based MCP clients.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Pacta-Key, Mcp-Session-Id, Mcp-Protocol-Version",
  );
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id, Mcp-Protocol-Version");

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

export default withApiAuthPagesRouter(handler);
