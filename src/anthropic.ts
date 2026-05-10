import Anthropic from "@anthropic-ai/sdk";
import { loadEnv } from "./env";

let _client: Anthropic | null = null;

export function getClient(): Anthropic {
  if (!_client) {
    loadEnv();
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

export const MODELS = {
  negotiator: "claude-sonnet-4-5",
  juror_fast: "claude-haiku-4-5",
  juror_balanced: "claude-sonnet-4-5",
  juror_deep: "claude-opus-4-5",
} as const;
