"use client";

import { useCallback, useEffect, useState } from "react";

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
      setError("Give the key a name (e.g. 'cli-laptop').");
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
      // clipboard unavailable — leave a hint
      setCopied(false);
    }
  }

  const active = keys.filter((k) => !k.revoked_at);
  const revoked = keys.filter((k) => k.revoked_at);

  return (
    <section className="flex flex-col gap-4">
      {error && (
        <p className="rounded-md border border-warn-red/40 bg-warn-red/10 px-4 py-2.5 text-caption text-warn-red">
          {error}
        </p>
      )}

      <form
        onSubmit={handleCreate}
        className="flex flex-col gap-3 rounded-lg border border-line/70 bg-graphite/40 p-4 sm:flex-row sm:items-center"
      >
        <label htmlFor="key-name" className="sr-only">
          Key name
        </label>
        <input
          id="key-name"
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="cli-laptop"
          maxLength={80}
          disabled={!allowed || creating}
          className="flex-1 rounded-md border border-line/70 bg-deep-space px-3 py-2 font-mono text-caption text-polar-white placeholder:text-dim focus:border-amber-glow/60 focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!allowed || creating || newName.trim().length === 0}
          className="rounded-md border border-amber-glow/40 bg-amber-glow/10 px-4 py-2 text-caption text-amber-glow transition-colors hover:bg-amber-glow/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {creating ? "Creating…" : "Create key"}
        </button>
      </form>

      {!allowed && (
        <p className="text-caption text-ash-gray">
          Key creation is disabled until your account is allowlisted.
        </p>
      )}

      {revealed && (
        <div className="rounded-lg border border-amber-glow/40 bg-amber-glow/5 p-4">
          <p className="text-micro uppercase tracking-[0.18em] text-amber-glow">
            New key — shown once
          </p>
          <p className="mt-2 text-caption text-bone">
            Save this token now. Pacta hashes it on the server and will never
            display it again.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="flex-1 overflow-x-auto rounded-md border border-line/70 bg-deep-space px-3 py-2 font-mono text-caption text-polar-white">
              {revealed.plaintext}
            </code>
            <button
              type="button"
              onClick={copyPlaintext}
              className="rounded-md border border-line/70 bg-graphite px-3 py-2 text-caption text-bone transition-colors hover:bg-iron"
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              onClick={() => setRevealed(null)}
              className="rounded-md border border-line/70 px-3 py-2 text-caption text-ash-gray transition-colors hover:text-bone"
            >
              I&apos;ve saved it
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-line/70 bg-graphite/40">
        <div className="border-b border-line/70 bg-iron/40 px-4 py-2 text-micro uppercase tracking-[0.18em] text-ash-gray">
          Active keys
        </div>
        {loading ? (
          <p className="px-4 py-4 text-caption text-ash-gray">Loading…</p>
        ) : active.length === 0 ? (
          <p className="px-4 py-4 text-caption text-ash-gray">
            No active keys. Create one above to authenticate against the MCP
            and REST endpoints.
          </p>
        ) : (
          <table className="w-full text-caption">
            <thead className="text-micro uppercase tracking-[0.14em] text-ash-gray">
              <tr>
                <Th>Prefix</Th>
                <Th>Name</Th>
                <Th>Created</Th>
                <Th>Last used</Th>
                <Th className="text-right pr-4">Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/50">
              {active.map((k) => (
                <tr key={k.id}>
                  <Td>
                    <span className="font-mono text-bone">
                      {k.prefix}
                      <span className="text-dim">…</span>
                    </span>
                  </Td>
                  <Td className="text-bone">{k.name}</Td>
                  <Td className="text-ash-gray">{formatDate(k.created_at)}</Td>
                  <Td className="text-ash-gray">
                    {k.last_used_at ? formatDate(k.last_used_at) : "—"}
                  </Td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => handleRevoke(k.id)}
                      className="rounded-md border border-warn-red/40 bg-warn-red/10 px-2.5 py-1 text-micro uppercase tracking-[0.14em] text-warn-red transition-colors hover:bg-warn-red/20"
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

      {revoked.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-line/70 bg-graphite/20">
          <div className="border-b border-line/70 bg-iron/20 px-4 py-2 text-micro uppercase tracking-[0.18em] text-ash-gray">
            Revoked
          </div>
          <table className="w-full text-caption text-ash-gray">
            <thead className="text-micro uppercase tracking-[0.14em] text-dim">
              <tr>
                <Th>Prefix</Th>
                <Th>Name</Th>
                <Th>Created</Th>
                <Th>Revoked</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/40">
              {revoked.map((k) => (
                <tr key={k.id}>
                  <Td>
                    <span className="font-mono">
                      {k.prefix}
                      <span className="text-dim">…</span>
                    </span>
                  </Td>
                  <Td>{k.name}</Td>
                  <Td>{formatDate(k.created_at)}</Td>
                  <Td>{k.revoked_at ? formatDate(k.revoked_at) : "—"}</Td>
                  <Td>
                    <span className="rounded-pill border border-line/70 bg-iron/40 px-2 py-0.5 text-micro uppercase tracking-[0.12em] text-dim">
                      Revoked
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
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
      className={`px-4 py-2 text-left font-normal ${className ?? ""}`}
      scope="col"
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
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
