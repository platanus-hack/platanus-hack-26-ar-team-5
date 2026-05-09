import type { VercelRequest, VercelResponse } from "@vercel/node";
import { listScenarios } from "../src/pacta.js";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ scenarios: listScenarios() });
}
