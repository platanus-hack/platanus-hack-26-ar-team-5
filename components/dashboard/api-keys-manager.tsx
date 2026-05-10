"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

type ApiKeyPublic = {
  id: string;
  user_id: string;
  name: string;
  prefix: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
  plaintext?: string;
};

type Props = {
  allowed: boolean;
};

export function ApiKeysManager({ allowed }: Props) {
  const [keys, setKeys] = useState<ApiKeyPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<{
    id: string;
    name: string;
    plaintext: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch("/api/keys", { cache: "no-store" });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      const j = (await r.json()) as { keys: ApiKeyPublic[] };
      setKeys(j.keys ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!allowed) return;
    const name = newName.trim();
    if (!name) {
      setError("Give the key a name (e.g. cli-laptop).");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const r = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      const j = (await r.json()) as {
        key: ApiKeyPublic & { plaintext: string };
      };
      setNewName("");
      setRevealed({
        id: j.key.id,
        name: j.key.name,
        plaintext: j.key.plaintext,
      });
      setCopied(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    setError(null);
    try {
      const r = await fetch(`/api/keys/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function copyPlaintext() {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed.plaintext);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const active = keys.filter((k) => !k.revoked_at);
  const revoked = keys.filter((k) => k.revoked_at);

  return (
    <section className="flex flex-col gap-8">
      <AnimatePresence>
        {error && (
          <motion.p
            key="error"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="rounded-md border border-warn-red/30 bg-warn-red/[0.06] px-4 py-2.5 text-caption text-warn-red"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {revealed && (
          <motion.div
            key="reveal"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="rounded-lg border border-line/70 bg-graphite/40 p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-body text-polar-white">
                  New key — shown once
                </p>
                <button
                  type="button"
                  onClick={() => setRevealed(null)}
                  className="text-caption text-ash-gray transition-colors hover:text-bone"
                >
                  Dismiss
                </button>
              </div>
              <p className="mt-1.5 text-caption text-ash-gray">
                Save this token now. Pacta hashes it on the server and will
                never display it again.
              </p>
              <div className="mt-3 flex items-stretch gap-2">
                <code className="flex-1 overflow-x-auto rounded-md border border-line/70 bg-deep-space px-3 py-2 font-mono text-caption text-polar-white">
                  {revealed.plaintext}
                </code>
                <button
                  type="button"
                  onClick={copyPlaintext}
                  className="shrink-0 rounded-md border border-line/70 bg-graphite px-3 text-caption text-bone transition-colors hover:bg-iron"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <form
        onSubmit={handleCreate}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <label htmlFor="key-name" className="flex flex-1 flex-col gap-1.5">
          <span className="text-caption text-ash-gray">Name</span>
          <input
            id="key-name"
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="cli-laptop"
            maxLength={80}
            disabled={!allowed || creating}
            className="rounded-md border border-line bg-graphite/60 px-3 py-2 text-body text-polar-white placeholder:text-dim focus:border-amber-glow/60 focus:bg-graphite focus:outline-none disabled:opacity-50"
          />
        </label>
        <button
          type="submit"
          disabled={!allowed || creating || newName.trim().length === 0}
          className="rounded-md bg-polar-white px-4 py-2 text-body font-medium text-deep-space transition-colors hover:bg-bone disabled:cursor-not-allowed disabled:opacity-40"
        >
          {creating ? "Creating…" : "Create key"}
        </button>
      </form>

      {!allowed && (
        <p className="-mt-4 text-caption text-ash-gray">
          Key creation is disabled until your account is allowlisted.
        </p>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-body text-polar-white">Active keys</h2>
        <div className="overflow-hidden rounded-lg border border-line/70">
          {loading ? (
            <p className="px-4 py-4 text-caption text-ash-gray">Loading…</p>
          ) : active.length === 0 ? (
            <p className="px-4 py-4 text-caption text-ash-gray">
              No active keys.
            </p>
          ) : (
            <table className="w-full text-caption">
              <thead>
                <tr className="text-left text-caption text-ash-gray">
                  <Th>Key</Th>
                  <Th>Name</Th>
                  <Th>Created</Th>
                  <Th>Last used</Th>
                  <th className="px-4 py-2.5" aria-label="Actions" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line/40">
                {active.map((k) => (
                  <tr key={k.id} className="text-bone">
                    <Td>
                      <span className="font-mono text-polar-white">
                        {k.prefix}
                        <span className="text-dim">…</span>
                      </span>
                    </Td>
                    <Td>{k.name}</Td>
                    <Td className="text-ash-gray tabular">
                      {formatDate(k.created_at)}
                    </Td>
                    <Td className="text-ash-gray tabular">
                      {k.last_used_at ? formatDate(k.last_used_at) : "—"}
                    </Td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => handleRevoke(k.id)}
                        className="text-caption text-warn-red/80 transition-colors hover:text-warn-red"
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {revoked.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-body text-ash-gray">Revoked</h2>
          <div className="overflow-hidden rounded-lg border border-line/70">
            <table className="w-full text-caption text-ash-gray">
              <thead>
                <tr className="text-left text-caption text-dim">
                  <Th>Key</Th>
                  <Th>Name</Th>
                  <Th>Created</Th>
                  <Th>Revoked</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/30">
                {revoked.map((k) => (
                  <tr key={k.id}>
                    <Td>
                      <span className="font-mono">
                        {k.prefix}
                        <span className="text-dim">…</span>
                      </span>
                    </Td>
                    <Td>{k.name}</Td>
                    <Td className="tabular">{formatDate(k.created_at)}</Td>
                    <Td className="tabular">
                      {k.revoked_at ? formatDate(k.revoked_at) : "—"}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`px-4 py-2.5 font-normal ${className ?? ""}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-4 py-2.5 ${className ?? ""}`}>{children}</td>;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
