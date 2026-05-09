import { config } from "dotenv";

let _loaded = false;

export function loadEnv() {
  if (_loaded) return;
  config({ path: ".env.local", quiet: true });
  config({ quiet: true }); // .env fallback
  _loaded = true;
}
