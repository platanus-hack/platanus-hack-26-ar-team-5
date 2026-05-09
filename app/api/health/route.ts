export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    ok: true,
    name: "pacta",
    version: "0.1.0",
    has_anthropic_key: !!process.env.ANTHROPIC_API_KEY,
    timestamp: new Date().toISOString(),
  });
}
