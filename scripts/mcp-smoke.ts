#!/usr/bin/env tsx
/**
 * In-process smoke test for the Pacta MCP server. Spins up the server, wires
 * an in-memory client/server transport pair, and exercises:
 *   - tools/list
 *   - pacta_list_scenarios
 *   - pacta_run_scenario (mock=true to avoid live LLM calls)
 *   - pacta_verify_bundle on the resulting bundle
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildPactaMcpServer } from "../src/mcp_server";

async function main() {
  const server = buildPactaMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "pacta-smoke", version: "0.1.0" });

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  console.log("\n[1/4] tools/list");
  const tools = await client.listTools();
  for (const t of tools.tools) console.log(`  - ${t.name}: ${t.description?.slice(0, 80)}…`);

  console.log("\n[2/4] pacta_list_scenarios");
  const ls = await client.callTool({ name: "list_scenarios", arguments: {} });
  const lsText = ((ls.content as Array<{ type: string; text?: string }> | undefined)?.[0]?.text) ?? "";
  console.log("  " + lsText.replace(/\n/g, "\n  ").slice(0, 400) + "…");

  console.log("\n[3/4] pacta_run_scenario(scenario_id=ai-overrun, mock=true)");
  const run = await client.callTool({
    name: "run_scenario",
    arguments: { scenario_id: "ai-overrun", mock: true },
  });
  const runText = ((run.content as Array<{ type: string; text?: string }> | undefined)?.[0]?.text) ?? "";
  // Show just the summary header
  console.log("  " + runText.split("\n").slice(0, 6).join("\n  "));
  // Extract the bundle JSON from the response
  const bundleMatch = runText.match(/--- BUNDLE ---\n(\{[\s\S]*?\})\n\n--- EVENT/);
  if (!bundleMatch) {
    throw new Error("could not extract bundle from run_scenario response");
  }
  const bundle = JSON.parse(bundleMatch[1]!);

  console.log("\n[4/4] pacta_verify_bundle on the run result");
  const verify = await client.callTool({
    name: "verify_bundle",
    arguments: { bundle },
  });
  const verifyText = ((verify.content as Array<{ type: string; text?: string }> | undefined)?.[0]?.text) ?? "";
  console.log("  " + verifyText.replace(/\n/g, "\n  "));
  if (verify.isError) throw new Error("verify_bundle reported failures");

  console.log("\n✓ MCP smoke test passed");
  await client.close();
  await server.close();
}

main().catch((err) => {
  console.error("✗ MCP smoke test FAILED:", err);
  process.exit(1);
});
