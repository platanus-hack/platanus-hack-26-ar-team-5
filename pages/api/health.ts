import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({
    ok: true,
    name: "pacta",
    version: "0.1.0",
    has_anthropic_key: !!process.env.ANTHROPIC_API_KEY,
    timestamp: new Date().toISOString(),
  });
}
