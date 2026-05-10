/**
 * Render the tribunal ruling rationale as structured prose.
 *
 * The engine (src/jury.ts) joins the three jurors' rationales as
 *   `Aequitas: <body>\n\nUtilis: <body>\n\nVelox: <body>`
 * and each <body> is LLM-written narrative that often includes inline
 * numbered points (1. 2. 3.), inline bullets (- ), and sha256 references.
 *
 * We split into per-juror blocks and apply light formatting:
 *   - inline `1.` / `2.` numbered markers → ordered list items
 *   - inline `- ` markers → bullet items
 *   - long `sha256:<hex>` references → shortened monospace chip
 */

const SHA_RE = /sha256:[a-f0-9]{8,}/g;

type Block = { juror: string | null; body: string };

function splitByJuror(text: string): Block[] {
  const parts = text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return [{ juror: null, body: text.trim() }];
  return parts.map((part) => {
    const m = part.match(/^([A-Z][A-Za-z]+):\s*([\s\S]+)$/);
    if (m) return { juror: m[1]!, body: m[2]!.trim() };
    return { juror: null, body: part };
  });
}

type Segment =
  | { kind: "paragraph"; text: string }
  | { kind: "ordered"; items: string[] }
  | { kind: "bullets"; items: string[] };

function parseBody(body: string): Segment[] {
  // First pass: insert paragraph breaks before inline list markers.
  // Match a numbered marker that comes after sentence-ending punctuation OR a
  // colon — never mid-prose like "(2.4 spec)".
  const withBreaks = body
    .replace(/(?<=[.:;!?]\s)(?=\d{1,2}\.\s+\S)/g, "\n")
    .replace(/\s-\s+(?=\S)/g, "\n- ");

  const segments: Segment[] = [];
  let buf: string[] = [];
  let mode: "paragraph" | "ordered" | "bullets" = "paragraph";

  const flush = () => {
    if (buf.length === 0) return;
    if (mode === "paragraph") {
      segments.push({ kind: "paragraph", text: buf.join(" ").trim() });
    } else if (mode === "ordered") {
      segments.push({ kind: "ordered", items: [...buf] });
    } else {
      segments.push({ kind: "bullets", items: [...buf] });
    }
    buf = [];
  };

  for (const rawLine of withBreaks.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      flush();
      mode = "paragraph";
      continue;
    }
    const numbered = line.match(/^(\d{1,2})\.\s+(.*)$/);
    const bullet = line.match(/^-\s+(.*)$/);
    if (numbered) {
      if (mode !== "ordered") flush();
      mode = "ordered";
      buf.push(numbered[2]!);
    } else if (bullet) {
      if (mode !== "bullets") flush();
      mode = "bullets";
      buf.push(bullet[1]!);
    } else {
      if (mode !== "paragraph") flush();
      mode = "paragraph";
      buf.push(line);
    }
  }
  flush();
  return segments;
}

function withInlineHashes(text: string): React.ReactNode {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(SHA_RE)) {
    if (m.index === undefined) continue;
    if (m.index > last) out.push(text.slice(last, m.index));
    const full = m[0];
    const short = `${full.slice(0, 14)}…`;
    out.push(
      <code
        key={`${m.index}`}
        title={full}
        className="rounded bg-iron/60 px-1.5 py-px font-mono text-[0.92em] text-bone"
      >
        {short}
      </code>,
    );
    last = m.index + full.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Rationale({ text }: { text: string }) {
  if (!text.trim()) return null;
  const blocks = splitByJuror(text);
  const single = blocks.length === 1 && !blocks[0]!.juror;

  return (
    <div className="flex flex-col gap-5">
      {blocks.map((b, i) => (
        <div
          key={i}
          className={
            single
              ? ""
              : "border-l-2 border-line/60 pl-4"
          }
        >
          {b.juror && (
            <p className="mb-2 text-caption font-medium text-polar-white">
              {b.juror}
            </p>
          )}
          <BodySegments body={b.body} />
        </div>
      ))}
    </div>
  );
}

function BodySegments({ body }: { body: string }) {
  const segments = parseBody(body);
  return (
    <div className="flex flex-col gap-2.5 text-caption leading-relaxed text-bone">
      {segments.map((seg, i) => {
        if (seg.kind === "paragraph") {
          return <p key={i}>{withInlineHashes(seg.text)}</p>;
        }
        if (seg.kind === "ordered") {
          return (
            <ol key={i} className="ml-4 list-decimal space-y-1.5 marker:text-ash-gray">
              {seg.items.map((it, j) => (
                <li key={j}>{withInlineHashes(it)}</li>
              ))}
            </ol>
          );
        }
        return (
          <ul key={i} className="ml-4 list-disc space-y-1.5 marker:text-ash-gray">
            {seg.items.map((it, j) => (
              <li key={j}>{withInlineHashes(it)}</li>
            ))}
          </ul>
        );
      })}
    </div>
  );
}
