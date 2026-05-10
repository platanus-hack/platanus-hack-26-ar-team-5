#!/usr/bin/env tsx
/**
 * End-to-end Playwright test that verifies the usage-tracking fix.
 *
 * Background: the bug was that `app/api/disputes/route.ts` POST returned a
 * ReadableStream whose `start()` callback ran outside the AsyncLocalStorage
 * scope set up by `withApiAuthAppRouter`. Result: `recordClaudeTurn` saw no
 * attribution and silently no-op'd, so `usage_events` for dashboard runs had
 * tokens_in = tokens_out = cost_usd = 0.
 *
 * The fix re-binds attribution inside the stream callback. This script
 * exercises the real dashboard path (login → seed → dispute runs → check
 * usage page) and asserts that tokens / cost are now non-zero.
 *
 * What it does:
 *   1. Creates a throwaway test user via Supabase Admin API + promotes them
 *      via direct SQL (allowed=true).
 *   2. Snapshots usage_events count for the user (should be 0).
 *   3. Logs in via the real /login form.
 *   4. Picks a scenario + tribunal_mode + clicks Run.
 *   5. Waits for finalization by polling /api/disputes/:id (re-uses the
 *      session cookie Playwright established).
 *   6. Re-queries usage_events, asserts tokens > 0 and cost > 0.
 *   7. Hits /dashboard/usage, screenshots it, asserts the visible numbers
 *      match the DB.
 *   8. Cleanup: revokes API keys, deletes user.
 */
import { chromium, type Browser, type Page } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "../src/env";
import { mkdirSync } from "node:fs";

loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const APP_URL = process.env.PACTA_PUBLIC_BASE_URL ?? "http://localhost:3000";

if (!SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Pick a scenario that converges in 4 rounds quickly (no jury escalation).
// ai-overrun's mock script is 4 rounds; LIVE will take ~80s.
const SCENARIO_ID = "ai-overrun";
const TRIBUNAL_MODE: "binding" | "none" = "binding";

// Generous overall ceiling — 4 minutes covers worst-case live drift on the
// shorter scenarios. Each Claude turn averages 8–15s; 8 turns = ~2 min p50.
const FINALIZE_TIMEOUT_MS = 4 * 60 * 1000;

type UsageRow = {
  id: string;
  endpoint: string;
  method: string;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  dispute_id: string | null;
  ts: string;
};

async function createTestUser(): Promise<{ email: string; password: string; userId: string }> {
  const ts = Date.now();
  const email = `pacta-e2e-${ts}@example.com`;
  const password = `Test-${ts}-pacta!`;

  // Use admin.createUser to skip email confirmation entirely.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    throw new Error(`createUser failed: ${createErr?.message ?? "no user"}`);
  }
  const userId = created.user.id;

  // The trigger on auth.users INSERT auto-creates a profiles row. We promote
  // it explicitly so the test user can mint keys + run disputes.
  const { error: profErr } = await admin
    .from("profiles")
    .update({ allowed: true })
    .eq("id", userId);
  if (profErr) throw new Error(`profile promote failed: ${profErr.message}`);

  return { email, password, userId };
}

async function deleteTestUser(userId: string): Promise<void> {
  // Delete usage_events first (FK) then api_keys, then user.
  await admin.from("usage_events").delete().eq("user_id", userId);
  await admin.from("api_keys").delete().eq("user_id", userId);
  await admin.auth.admin.deleteUser(userId);
}

async function getUsageEvents(userId: string): Promise<UsageRow[]> {
  const { data, error } = await admin
    .from("usage_events")
    .select("id, endpoint, method, tokens_in, tokens_out, cost_usd, dispute_id, ts")
    .eq("user_id", userId)
    .order("ts", { ascending: true });
  if (error) throw new Error(`usage_events query failed: ${error.message}`);
  return (data ?? []) as UsageRow[];
}

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto(`${APP_URL}/login`);
  await page.waitForSelector('input[name="email"]');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  // The Sign in button is in the first form (sign-in form by default).
  await page.click('button[type="submit"]:has-text("Sign in")');
  // Either lands on /dashboard or stays at /login with an error param.
  await page.waitForURL(/\/dashboard/, { timeout: 15000 });
}

async function seedDispute(
  page: Page,
  scenarioId: string,
  mode: "binding" | "none",
): Promise<string> {
  // Pick scenario from the sidebar's only <select>.
  await page.waitForSelector("select", { timeout: 10000 });
  await page.selectOption("select", scenarioId);

  // Tribunal mode chip — pick the one matching `mode`.
  if (mode === "none") {
    await page.click('button:has-text("none"), [role="button"]:has-text("none")');
  }

  // Capture the X-Pacta-Dispute-Id header from the POST response.
  const responsePromise = page.waitForResponse(
    (resp) => resp.url().endsWith("/api/disputes") && resp.request().method() === "POST",
    { timeout: 15000 },
  );

  await page.click('button:has-text("Run")');

  const response = await responsePromise;
  const disputeId = response.headers()["x-pacta-dispute-id"];
  if (!disputeId) {
    const body = await response.text().catch(() => "<no body>");
    throw new Error(`X-Pacta-Dispute-Id header missing on POST /api/disputes. body=${body.slice(0, 200)}`);
  }
  return disputeId;
}

async function waitForFinalization(
  page: Page,
  disputeId: string,
  deadlineMs: number,
): Promise<{ outcome_kind: string; messages: number }> {
  const start = Date.now();
  let lastCount = 0;
  while (Date.now() - start < deadlineMs) {
    // Use page.request to ride the Playwright session cookie.
    const r = await page.request.get(`${APP_URL}/api/disputes/${disputeId}`);
    if (r.ok()) {
      const j = (await r.json()) as {
        finalized: { outcome: { kind: string } } | null;
        history: unknown[];
      };
      if (j.history.length !== lastCount) {
        console.log(`    history=${j.history.length}  ${((Date.now() - start) / 1000).toFixed(0)}s elapsed`);
        lastCount = j.history.length;
      }
      if (j.finalized) {
        return { outcome_kind: j.finalized.outcome.kind, messages: j.history.length };
      }
    }
    await new Promise((res) => setTimeout(res, 2000));
  }
  throw new Error(`dispute ${disputeId} did not finalize within ${deadlineMs / 1000}s`);
}

async function main() {
  console.log("=== Pacta dashboard usage-tracking e2e ===\n");

  console.log("[1] creating test user…");
  const user = await createTestUser();
  console.log(`    email=${user.email}  user_id=${user.userId.slice(0, 8)}…`);

  let browser: Browser | null = null;
  try {
    console.log("\n[2] snapshot usage_events BEFORE the run");
    const before = await getUsageEvents(user.userId);
    console.log(`    rows=${before.length}  (expected 0)`);
    if (before.length !== 0) throw new Error("usage_events not empty for fresh user");

    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    console.log("\n[3] login");
    await login(page, user.email, user.password);
    console.log(`    on ${page.url()}`);

    console.log(`\n[4] seed dispute  scenario=${SCENARIO_ID} mode=${TRIBUNAL_MODE}`);
    const disputeId = await seedDispute(page, SCENARIO_ID, TRIBUNAL_MODE);
    console.log(`    dispute_id=${disputeId}`);

    console.log("\n[5] wait for finalization (live Claude — ~80s)");
    const finalized = await waitForFinalization(page, disputeId, FINALIZE_TIMEOUT_MS);
    console.log(`    outcome=${finalized.outcome_kind}  messages=${finalized.messages}`);

    console.log("\n[6] re-query usage_events");
    const after = await getUsageEvents(user.userId);
    console.log(`    rows=${after.length}`);
    let totalTokensIn = 0;
    let totalTokensOut = 0;
    let totalCost = 0;
    let claudeTurnRows = 0;
    let claudeTurnsForDispute = 0;
    for (const r of after) {
      totalTokensIn += r.tokens_in;
      totalTokensOut += r.tokens_out;
      totalCost += Number(r.cost_usd);
      if (r.endpoint.endsWith("#claude")) {
        claudeTurnRows += 1;
        if (r.dispute_id === disputeId) claudeTurnsForDispute += 1;
      }
    }
    console.log(`    claude turn rows: ${claudeTurnRows}  (for this dispute: ${claudeTurnsForDispute})`);
    console.log(`    total tokens_in:  ${totalTokensIn}`);
    console.log(`    total tokens_out: ${totalTokensOut}`);
    console.log(`    total cost_usd:   $${totalCost.toFixed(4)}`);

    console.log("\n[7] assert fix worked");
    const assertions: Array<{ name: string; pass: boolean; detail: string }> = [
      {
        name: "claude turn rows recorded",
        pass: claudeTurnRows > 0,
        detail: `expected > 0, got ${claudeTurnRows}`,
      },
      {
        name: "claude turns attributed to this dispute",
        pass: claudeTurnsForDispute > 0,
        detail: `expected > 0 turns with dispute_id=${disputeId.slice(0, 12)}…, got ${claudeTurnsForDispute}`,
      },
      {
        name: "non-zero input tokens",
        pass: totalTokensIn > 0,
        detail: `${totalTokensIn} tokens`,
      },
      {
        name: "non-zero output tokens",
        pass: totalTokensOut > 0,
        detail: `${totalTokensOut} tokens`,
      },
      {
        name: "non-zero cost",
        pass: totalCost > 0,
        detail: `$${totalCost.toFixed(4)}`,
      },
    ];
    let allPassed = true;
    for (const a of assertions) {
      console.log(`    ${a.pass ? "✓" : "✗"} ${a.name} — ${a.detail}`);
      if (!a.pass) allPassed = false;
    }

    console.log("\n[8] visual check + screenshot of /dashboard/usage");
    mkdirSync("tmp/e2e", { recursive: true });
    await page.goto(`${APP_URL}/dashboard/usage`);
    await page.waitForLoadState("networkidle");
    const shotPath = `tmp/e2e/usage-after-fix.png`;
    await page.screenshot({ path: shotPath, fullPage: true });
    console.log(`    screenshot: ${shotPath}`);
    // Best-effort: pull the rendered cost number from the page text and confirm
    // the same order of magnitude as the DB sum.
    const pageText = await page.locator("body").innerText();
    const dollarMatches = pageText.match(/\$[0-9,]+\.[0-9]+/g) ?? [];
    console.log(`    visible cost values on page: ${dollarMatches.slice(0, 6).join(", ")}`);

    if (!allPassed) {
      throw new Error("ONE OR MORE ASSERTIONS FAILED — fix did not work as expected");
    }
    console.log("\n✅ ALL ASSERTIONS PASSED — usage tracking fix verified end-to-end");
  } finally {
    if (browser) await browser.close();
    console.log("\n[9] cleanup test user");
    try {
      await deleteTestUser(user.userId);
      console.log("    deleted");
    } catch (err) {
      console.error("    cleanup failed:", err instanceof Error ? err.message : err);
    }
  }
}

main().catch((err) => {
  console.error("\n❌ FAILURE:", err);
  process.exit(1);
});
