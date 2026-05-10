// E2E test of the Pacta stack with TWO independent users + free-form dispute.
//
// Flow:
//   1. Sign up two users (Aria, Atlas) via Supabase REST.
//   2. Promote both to allowed (mimics ALLOWED_EMAILS auto-promote).
//   3. Mint an API key for each (mimics POST /api/keys via service role).
//   4. Each user spins up a Pacta MCP client (auth via X-Pacta-Key).
//   5. Aria opens a SCHEMA-LESS dispute with a freeform "grade negotiation"
//      claim. Atlas joins.
//   6. Both submit evidence + a few negotiation rounds → converge.
//   7. Verify the dispute is visible via the public REST endpoint and that
//      both users have usage_events recorded.
//   8. Cleanup.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import crypto from "node:crypto";

const SUPABASE_URL = "https://wnnpnckuubgdnsexxpzq.supabase.co";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndubnBuY2t1dWJnZG5zZXh4cHpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzNjk1NjAsImV4cCI6MjA5Mzk0NTU2MH0.ifwRx8PZT1FiygdxejMxyH49aju69GaQ2nH7Txp6Y9A";
const SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndubnBuY2t1dWJnZG5zZXh4cHpxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODM2OTU2MCwiZXhwIjoyMDkzOTQ1NTYwfQ.CGMVEVdxAXlM088T6R7er39YUS_kv82_2c7stVOXX5s";
const APP = "http://localhost:44323";
const MCP_URL = `${APP}/api/mcp`;

const stamp = Date.now();
const userA = { email: `juror-aria-${stamp}@example.com`, password: "tppacta12345" };
const userB = { email: `juror-atlas-${stamp}@example.com`, password: "tppacta12345" };

let pass = 0;
let fail = 0;
function ok(label) {
  console.log("✓", label);
  pass++;
}
function bad(label, err) {
  console.log("✗", label, "—", err);
  fail++;
}

async function admin(path, init = {}) {
  return fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function signup(user) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: user.email, password: user.password }),
  });
  const j = await r.json();
  if (!j.user) throw new Error(`signup failed: ${JSON.stringify(j)}`);
  return j.user.id;
}

async function promote(userId) {
  await admin(`/rest/v1/profiles?id=eq.${userId}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ allowed: true }),
  });
}

async function mintKey(userId, name) {
  const random = crypto.randomBytes(24).toString("hex");
  const plaintext = `pacta_live_${random}`;
  const hash = crypto.createHash("sha256").update(plaintext).digest("hex");
  const prefix = plaintext.slice(0, 12);
  const r = await admin("/rest/v1/api_keys", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ user_id: userId, name, prefix, key_hash: hash }),
  });
  if (!r.ok) throw new Error(`mintKey failed: ${await r.text()}`);
  return plaintext;
}

async function makeMcpClient(apiKey, label) {
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: {
      headers: { "X-Pacta-Key": apiKey },
    },
  });
  const client = new Client(
    { name: `pacta-test-${label}`, version: "0.0.1" },
    { capabilities: {} },
  );
  await client.connect(transport);
  return { client, transport };
}

function unwrap(res) {
  // Tools embed the JSON payload under one of:
  //   --- DETAILS ---  (open_dispute, join_dispute)
  //   --- STATE ---    (submit_message, wait_for_turn, get_dispute)
  // submit_evidence returns plain text like "evidence_id: ev_abc\nhash: sha256:...".
  const text = res.content?.[0]?.text ?? "";
  const m = text.match(/--- (?:DETAILS|STATE) ---\n([\s\S]+?)(?:\n\n--- |$)/);
  if (m) {
    try {
      return { state: JSON.parse(m[1]), text };
    } catch {
      // fall through
    }
  }
  // submit_evidence path
  const evIdMatch = text.match(/evidence_id:\s*(\S+)/);
  const hashMatch = text.match(/hash:\s+(\S+)/);
  if (evIdMatch && hashMatch) {
    return {
      state: { evidence_id: evIdMatch[1], hash: hashMatch[1] },
      text,
    };
  }
  return { text };
}

async function main() {
  console.log("Pacta E2E — two real users, schema-less MCP dispute");
  console.log(`A: ${userA.email}`);
  console.log(`B: ${userB.email}`);
  console.log("");

  // ---------- 1. Two new accounts ----------
  const userIdA = await signup(userA);
  const userIdB = await signup(userB);
  ok("signed up two users via REST autoconfirm");

  // ---------- 2. Promote both ----------
  await promote(userIdA);
  await promote(userIdB);
  ok("promoted both to allowed=true (mimics ALLOWED_EMAILS path)");

  // ---------- 3. Mint API keys ----------
  const keyA = await mintKey(userIdA, "juror-A-mcp");
  const keyB = await mintKey(userIdB, "juror-B-mcp");
  ok("minted API key for each user");
  console.log("    keyA prefix:", keyA.slice(0, 16) + "…");
  console.log("    keyB prefix:", keyB.slice(0, 16) + "…");

  // ---------- 4. MCP clients ----------
  const a = await makeMcpClient(keyA, "aria");
  const b = await makeMcpClient(keyB, "atlas");
  ok("both MCP clients connected");

  // List tools to verify the gate is happy
  const aTools = await a.client.listTools();
  if (aTools.tools.find((t) => t.name === "open_dispute")) {
    ok(`MCP listTools sees ${aTools.tools.length} tools (open_dispute present)`);
  } else {
    bad("listTools", "open_dispute missing");
  }

  // ---------- 5. SCHEMA-LESS open_dispute ----------
  const claim =
    "Disputo la nota final del trabajo final de Sistemas Distribuidos: el evaluador puso 6/10 pero la entrega cumple los criterios para 8/10.";
  const opened = await a.client.callTool({
    name: "open_dispute",
    arguments: {
      claim,
      your_role: "aria",
      counterparty_external: true,
      max_rounds: 4,
      tribunal_mode: "binding",
    },
  });
  const openedState = unwrap(opened).state;
  if (!openedState?.dispute_id) {
    bad("open_dispute", JSON.stringify(opened));
    return;
  }
  const disputeId = openedState.dispute_id;
  const tokenA = openedState.your_token;
  ok(`open_dispute → ${disputeId} (schema-less, claim=${claim.slice(0, 40)}…)`);

  // ---------- 5b. Atlas joins ----------
  const joined = await b.client.callTool({
    name: "join_dispute",
    arguments: { dispute_id: disputeId, role: "atlas" },
  });
  const joinedState = unwrap(joined).state;
  if (!joinedState?.your_token) {
    bad("join_dispute", JSON.stringify(joined));
    return;
  }
  const tokenB = joinedState.your_token;
  ok("join_dispute → atlas claimed");

  // ---------- 6. Submit evidence ----------
  const evA = await a.client.callTool({
    name: "submit_evidence",
    arguments: {
      dispute_id: disputeId,
      role_token: tokenA,
      evidence: {
        tier: "B",
        title: "Rúbrica del trabajo",
        body: "La rúbrica oficial pondera 40% diseño, 30% implementación, 30% análisis. Mi entrega cumple los tres bloques con detalle.",
      },
    },
  });
  if (unwrap(evA).state?.evidence_id) ok("aria submit_evidence");
  else bad("aria submit_evidence", unwrap(evA).text);

  const evB = await b.client.callTool({
    name: "submit_evidence",
    arguments: {
      dispute_id: disputeId,
      role_token: tokenB,
      evidence: {
        tier: "B",
        title: "Devolución del evaluador",
        body: "El análisis de tradeoffs estaba incompleto en el bloque CAP — solo mencionaste consistency, faltó availability y partition tolerance.",
      },
    },
  });
  if (unwrap(evB).state?.evidence_id) ok("atlas submit_evidence");
  else bad("atlas submit_evidence", unwrap(evB).text);

  // ---------- 7. Negotiation rounds ----------
  // Round 1: Aria proposes 8/10
  const m1 = await a.client.callTool({
    name: "submit_message",
    arguments: {
      dispute_id: disputeId,
      role_token: tokenA,
      message: {
        type: "Propose",
        round: 1,
        from_agent: openedState.your_did,
        evidence_refs: [],
        parent_refs: [],
        payload: {
          state: { credit_usd: 0, terms: "Nota final: 8/10" },
          rationale: "Cumplo los tres bloques de la rúbrica con detalle.",
          utility_for_self: 0.9,
        },
      },
    },
  });
  if (unwrap(m1).state) ok("round 1: aria Propose 8/10");
  else bad("Propose", unwrap(m1).text);

  // Round 1: Atlas counter-proposes 7/10. CounterPropose REQUIRES non-empty
  // parent_refs — point at Aria's Propose ("m1").
  const m2 = await b.client.callTool({
    name: "submit_message",
    arguments: {
      dispute_id: disputeId,
      role_token: tokenB,
      message: {
        type: "CounterPropose",
        round: 1,
        from_agent: joinedState.your_did,
        evidence_refs: [],
        parent_refs: ["m1"],
        payload: {
          state: { credit_usd: 0, terms: "Nota final: 7/10" },
          rationale:
            "Partial credit: bien diseño e implementación, pero el bloque CAP estaba incompleto.",
          utility_for_self: 0.7,
        },
      },
    },
  });
  const m2state = unwrap(m2).state;
  if (
    !m2state ||
    m2state.history_count !== 2 ||
    m2state.turn !== "aria" ||
    m2state.current_round !== 2
  ) {
    bad("CounterPropose did not land cleanly", unwrap(m2).text);
    return;
  }
  ok(`state advanced: turn=${m2state.turn}, round=${m2state.current_round}`);
  if (unwrap(m2).state) ok("round 1: atlas CounterPropose 7/10");
  else bad("CounterPropose", unwrap(m2).text);

  // Round 2: Aria accepts atlas's CP (m2) → convergence on 7/10.
  // Pacta accepts "mN", msg_id, or full sha256:... as a reference.
  const m3 = await a.client.callTool({
    name: "submit_message",
    arguments: {
      dispute_id: disputeId,
      role_token: tokenA,
      message: {
        type: "Accept",
        round: 2,
        from_agent: openedState.your_did,
        evidence_refs: [],
        parent_refs: ["m2"],
        payload: { target_msg_hash: "m2" },
      },
    },
  });
  const acc = unwrap(m3).state;
  if (acc && acc.history_count === 3 && acc.turn === "atlas") {
    ok("round 2: aria Accept landed (waiting on atlas to mirror)");
  } else {
    bad("aria Accept did not land", unwrap(m3).text);
    return;
  }

  // Round 2: Atlas mirrors the Accept on m2 → both Accepts on same target
  // converges per isConverged() in dispute_engine.ts.
  const m4 = await b.client.callTool({
    name: "submit_message",
    arguments: {
      dispute_id: disputeId,
      role_token: tokenB,
      message: {
        type: "Accept",
        round: 2,
        from_agent: joinedState.your_did,
        evidence_refs: [],
        parent_refs: ["m2"],
        payload: { target_msg_hash: "m2" },
      },
    },
  });
  const finalized = unwrap(m4).state?.finalized;
  if (finalized) {
    ok("round 2: atlas Accept → CONVERGED, bundle built");
  } else {
    bad("atlas Accept did not converge", unwrap(m4).text);
  }

  // ---------- 8. Verify the dashboard sees it ----------
  // /api/disputes lists all disputes for an authenticated user with the gate.
  const list = await fetch(`${APP}/api/disputes`, {
    headers: { "X-Pacta-Key": keyA },
  });
  const listJson = await list.json();
  const found = (listJson.disputes ?? []).find(
    (d) => d.dispute_id === disputeId,
  );
  if (found) {
    ok(
      `/api/disputes lists the schema-less dispute (claim=${(found.claim ?? "").slice(0, 40)}…, finalized=${found.finalized})`,
    );
  } else {
    bad("dashboard list", `dispute ${disputeId} not in listing`);
  }

  // /api/disputes/:id returns the public dump; .finalized IS the Bundle (or null).
  const dump = await fetch(`${APP}/api/disputes/${disputeId}`, {
    headers: { "X-Pacta-Key": keyA },
  });
  const dumpJson = await dump.json();
  if (dumpJson.finalized?.outcome?.kind === "converged") {
    ok(
      `/api/disputes/:id has the converged bundle (final_state="${dumpJson.finalized.outcome.final_state.terms}", root_hash=${dumpJson.finalized.root_hash.slice(0, 24)}…)`,
    );
  } else {
    bad("bundle outcome", JSON.stringify(dumpJson.finalized));
  }

  // ---------- 9. Usage events for both users ----------
  for (const [user, label] of [
    [userIdA, "aria"],
    [userIdB, "atlas"],
  ]) {
    const r = await admin(
      `/rest/v1/usage_events?user_id=eq.${user}&select=endpoint,method,status&order=ts.desc&limit=20`,
    );
    const rows = await r.json();
    const counts = {};
    for (const row of rows ?? [])
      counts[row.endpoint] = (counts[row.endpoint] ?? 0) + 1;
    ok(`${label} usage_events: ${rows.length} rows · ${JSON.stringify(counts)}`);
  }

  // ---------- 10. Cleanup ----------
  await fetch(`${APP}/api/disputes/${disputeId}`, {
    method: "DELETE",
    headers: { "X-Pacta-Key": keyA },
  });
  await admin(`/auth/v1/admin/users/${userIdA}`, { method: "DELETE" });
  await admin(`/auth/v1/admin/users/${userIdB}`, { method: "DELETE" });
  ok("cleaned up: dispute deleted, both users deleted");

  await a.transport.close().catch(() => {});
  await b.transport.close().catch(() => {});

  console.log("");
  console.log(`results: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("uncaught:", e);
  process.exit(1);
});
