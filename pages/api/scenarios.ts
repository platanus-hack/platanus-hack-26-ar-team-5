import type { NextApiRequest, NextApiResponse } from "next";
import { listScenarios } from "../../src/pacta";
import { withApiAuthPagesRouter } from "../../lib/auth/api-auth";

function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({ scenarios: listScenarios() });
}

export default withApiAuthPagesRouter(handler, { allowSession: true });
