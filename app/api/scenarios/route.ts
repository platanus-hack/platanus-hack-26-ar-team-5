import { listScenarios } from "../../../src/pacta";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({ scenarios: listScenarios() });
}
