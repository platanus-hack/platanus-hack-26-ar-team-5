import { generateKeypair, type Keypair } from "./crypto";
import { deriveDid } from "./did";

export type AgentRole = "aria" | "atlas" | "tribunal";

export type AgentIdentity = {
  role: AgentRole;
  name: string;
  did: string;
  keypair: Keypair;
};

export type AgentBook = Record<AgentRole, AgentIdentity>;

const FRIENDLY_NAMES: Record<AgentRole, string> = {
  aria: "Aria",
  atlas: "Atlas",
  tribunal: "Tribunal",
};

export function bootAgents(): AgentBook {
  const roles: AgentRole[] = ["aria", "atlas", "tribunal"];
  const out = {} as AgentBook;
  for (const role of roles) {
    const keypair = generateKeypair();
    const did = deriveDid(keypair.publicKey);
    out[role] = { role, name: FRIENDLY_NAMES[role], did, keypair };
  }
  return out;
}
