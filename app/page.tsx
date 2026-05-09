import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Github } from "lucide-react";
import { codeToHtml } from "shiki";

import { CodeTabs, type CodeSample } from "@/components/code-tabs";

const repoUrl = "https://github.com/platanus-hack/platanus-hack-26-ar-team-5";

const stack = [
  { name: "A2A", role: "talk" },
  { name: "MCP", role: "use tools" },
  { name: "x402", role: "pay" },
  { name: "ERC-8004", role: "reputation" },
];

const primitives = [
  ["Propose", "Offer a candidate state."],
  ["Critique", "Challenge a state with cited evidence."],
  ["CounterPropose", "Reject the current state and offer another."],
  ["Reveal", "Disclose private info. Binding."],
  ["Accept", "Sign the current state."],
  ["Escalate", "Hand the deadlock to the mediator clause."],
];

const tiers = [
  ["S", "Crypto self-verifying", "On-chain tx, counterparty signatures."],
  ["A", "Trusted third-party attestation", "Oracles, signed commits, audited papers."],
  ["B", "Self-emitted, signed", "Internal logs, transcripts."],
  ["C", "Pure argumentation", "Modulates only. Never decides alone."],
];

const composes = [
  ["Transport", "A2A extension"],
  ["Tools", "MCP server"],
  ["Settlement", "x402 / AP2 / Stripe"],
  ["Reputation", "ERC-8004"],
];

const codeSamples: Array<{
  key: string;
  label: string;
  filename: string;
  lang: string;
  code: string;
}> = [
  {
    key: "python",
    label: "Python",
    filename: "dispute.py",
    lang: "python",
    code: `from pacta import Agent, MediationClause, negotiate

buyer  = Agent.from_url("https://acme.io/.well-known/agent-card.json")
seller = Agent.from_url("https://supplier.com/.well-known/agent-card.json")

deal = negotiate(
    parties=[buyer, seller],
    terms_schema={"price": (800, 1200), "delivery_days": (1, 14)},
    mediation=MediationClause(preset="balanced", binding=True),
)

# deal.state       → {price: 980, delivery_days: 3}
# deal.audit_trail → signed DAG, every move parent-linked
# deal.signatures  → Ed25519 from each party DID`,
  },
  {
    key: "typescript",
    label: "TypeScript",
    filename: "dispute.ts",
    lang: "typescript",
    code: `import { runPacta } from "pacta";

// Two agents disagree. One generator yields the whole lifecycle.
// Every protocol message signed, every node parent-linked.
for await (const event of runPacta({ scenario: "ai-overrun" })) {
  if (event.kind === "message.accepted") {
    const m = event.signed;
    console.log(\`\${event.role}  \${m.type}  \${event.hash}\`);
  }

  if (event.kind === "jury.ruling") {
    const { outcome, confidence } = event.ruling;
    console.log(\`ruling: \${outcome}  conf=\${confidence}\`);
  }

  if (event.kind === "bundle") {
    // Merkle root over messages + evidence + outcome.
    // Verifiable from any other system that holds the public DIDs.
    console.log(\`bundle.root_hash = \${event.bundle.root_hash}\`);
  }
}`,
  },
];

async function buildSamples(): Promise<CodeSample[]> {
  return Promise.all(
    codeSamples.map(async (s) => ({
      key: s.key,
      label: s.label,
      filename: s.filename,
      code: s.code,
      html: await codeToHtml(s.code, {
        lang: s.lang,
        theme: "github-dark-default",
      }),
    })),
  );
}

export default async function LandingPage() {
  const samples = await buildSamples();

  return (
    <main className="min-h-screen bg-[#0c0c0c] text-white">
      <Nav />
      <Hero />
      <DashboardPreview />
      <StackSection />
      <CodeSection samples={samples} />
      <Primitives />
      <Tiers />
      <Composes />
      <Footer />
    </main>
  );
}

function Nav() {
  return (
    <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
      <Link href="/" className="flex items-center gap-2">
        <LogoMark className="h-5 w-5 text-white" />
        <span className="t-label">Pacta</span>
      </Link>
      <div className="hidden items-center gap-7 md:flex">
        <NavLink href="#stack">Protocol</NavLink>
        <NavLink href="#primitives">Primitives</NavLink>
        <NavLink href="#evidence">Evidence</NavLink>
        <NavLink href={repoUrl} external>
          GitHub
        </NavLink>
      </div>
      <Link
        href="/dashboard"
        className="t-label inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-black transition hover:bg-white/90"
      >
        Open workbench
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </nav>
  );
}

function NavLink({
  href,
  external,
  children,
}: {
  href: string;
  external?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className="t-label text-white/55 transition hover:text-white"
    >
      {children}
    </Link>
  );
}

function Hero() {
  return (
    <section className="mx-auto max-w-5xl px-6 pb-24 pt-20 md:pt-32">
      <p className="hero-fade hero-d-0 t-body uppercase tracking-[0.2em] text-white/35">
        Open protocol · Apache 2.0
      </p>

      <h1 className="hero-fade hero-d-1 t-display mt-8 max-w-3xl text-white">
        Two agents disagree.
        <br />
        <span className="text-white/50">
          Pacta gives them a signed way out.
        </span>
      </h1>

      <p className="hero-fade hero-d-2 t-label mt-10 max-w-md text-white/65">
        A2A made agents talk. MCP gave them tools. x402 let them pay. Pacta is
        how they agree, even when they don&apos;t.
      </p>

      <div className="hero-fade hero-d-3 mt-10 flex items-center gap-4">
        <Link
          href="/dashboard"
          className="t-label inline-flex items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-black transition hover:bg-white/90"
        >
          Open workbench
          <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          href={repoUrl}
          target="_blank"
          rel="noreferrer"
          className="t-label inline-flex items-center gap-1.5 text-white/65 transition hover:text-white"
        >
          Read the spec
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}

function DashboardPreview() {
  return (
    <section className="mx-auto max-w-5xl px-6 pb-24">
      <Link
        href="/dashboard"
        className="group relative block overflow-hidden rounded-lg border border-white/10 bg-[#0a0c10]"
      >
        <Image
          src="/dashboard-preview.png"
          alt="Pacta workbench. Signed audit DAG of a negotiation"
          width={1280}
          height={720}
          priority
          className="block h-auto w-full"
        />
        <span className="absolute inset-0 flex items-end justify-end p-4 opacity-0 transition group-hover:opacity-100">
          <span className="t-label rounded-full bg-white px-3.5 py-1.5 text-black">
            Open workbench →
          </span>
        </span>
      </Link>
      <p className="t-body mt-3 text-white/40">
        Every primitive is a signed node. Evidence attaches with a tier label.
        The root hash is the proof other systems verify.
      </p>
    </section>
  );
}

function StackSection() {
  return (
    <section
      id="stack"
      className="mx-auto max-w-5xl border-t border-white/[0.06] px-6 py-20"
    >
      <SectionHeader
        eyebrow="The missing layer"
        title="The agent stack already exists. One layer is still missing."
      />

      <div className="mt-12 grid gap-px overflow-hidden rounded-md border border-white/[0.08] bg-white/[0.06] md:grid-cols-4">
        {stack.map((layer) => (
          <div key={layer.name} className="bg-[#0c0c0c] p-5">
            <p className="t-body uppercase tracking-[0.18em] text-white/35">
              {layer.role}
            </p>
            <p className="t-label mt-3 font-mono text-white">{layer.name}</p>
          </div>
        ))}
      </div>

      <div className="mt-px overflow-hidden rounded-md border border-white/15 bg-[#0c0c0c] p-6">
        <div className="flex items-center gap-3">
          <LogoMark className="h-4 w-4 text-white" />
          <p className="t-label font-mono text-white">Pacta</p>
          <span className="t-body text-white/35">agents agree</span>
        </div>
        <p className="t-label mt-3 max-w-2xl text-white/60">
          A wire format and state machine for two AI agents to negotiate, cite
          evidence, and produce a signed outcome. No human in the loop.
        </p>
      </div>
    </section>
  );
}

function CodeSection({ samples }: { samples: CodeSample[] }) {
  return (
    <section className="mx-auto max-w-5xl px-6 py-20">
      <SectionHeader eyebrow="The SDK" title="Three verbs. Any domain." />

      <div className="mt-12 grid gap-10 md:grid-cols-[0.8fr_1.2fr] md:items-start">
        <p className="t-label max-w-sm text-white/60">
          <span className="font-mono text-white">negotiate</span>,{" "}
          <span className="font-mono text-white">dispute</span>,{" "}
          <span className="font-mono text-white">settle</span>. State machine,
          signatures, evidence tiers and the audit DAG run underneath. You bring
          the schema and the utility. Pacta brings the agreement.
        </p>

        <CodeTabs samples={samples} />
      </div>
    </section>
  );
}

function Primitives() {
  return (
    <section
      id="primitives"
      className="mx-auto max-w-5xl border-t border-white/[0.06] px-6 py-20"
    >
      <SectionHeader
        eyebrow="The protocol"
        title="Six primitives. Nothing more."
      />

      <ul className="mt-12 grid gap-px overflow-hidden rounded-md border border-white/[0.08] bg-white/[0.06] md:grid-cols-3">
        {primitives.map(([name, desc], i) => (
          <li key={name} className="flex flex-col gap-3 bg-[#0c0c0c] p-5">
            <div className="flex items-center justify-between">
              <span className="t-label font-mono text-white">{name}</span>
              <span className="t-body font-mono text-white/30">
                {String(i + 1).padStart(2, "0")}
              </span>
            </div>
            <p className="t-body text-white/55">{desc}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Tiers() {
  return (
    <section
      id="evidence"
      className="mx-auto max-w-5xl border-t border-white/[0.06] px-6 py-20"
    >
      <SectionHeader
        eyebrow="Why the rulings hold up"
        title="Evidence is tiered by how verifiable it actually is."
      />

      <div className="mt-12 overflow-hidden rounded-md border border-white/[0.08]">
        {tiers.map(([tier, label, examples], i) => (
          <div
            key={tier}
            className={`grid grid-cols-[48px_1fr] gap-5 p-5 md:grid-cols-[48px_1fr_1.4fr] ${
              i < tiers.length - 1 ? "border-b border-white/[0.06]" : ""
            }`}
          >
            <span className="t-label font-mono text-white">{tier}</span>
            <span className="t-label text-white">{label}</span>
            <span className="t-body hidden text-white/45 md:block">
              {examples}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Composes() {
  return (
    <section className="mx-auto max-w-5xl border-t border-white/[0.06] px-6 py-20">
      <SectionHeader
        eyebrow="Plays well with the stack"
        title="Pacta composes. It doesn't replace."
      />

      <div className="mt-12 grid gap-px overflow-hidden rounded-md border border-white/[0.08] bg-white/[0.06] md:grid-cols-2">
        {composes.map(([surface, protocol]) => (
          <div
            key={surface}
            className="flex items-center justify-between bg-[#0c0c0c] p-5"
          >
            <span className="t-body uppercase tracking-[0.18em] text-white/35">
              {surface}
            </span>
            <span className="t-label font-mono text-white">{protocol}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="mx-auto max-w-5xl border-t border-white/[0.06] px-6 py-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <LogoMark className="h-3.5 w-3.5 text-white/55" />
          <span className="t-body text-white/45">
            Pacta · Open agreement protocol
          </span>
        </div>
        <div className="flex items-center gap-5">
          <Link href="/dashboard" className="t-body text-white/45 hover:text-white">
            Workbench
          </Link>
          <Link
            href={repoUrl}
            target="_blank"
            rel="noreferrer"
            className="t-body inline-flex items-center gap-1 text-white/45 hover:text-white"
          >
            <Github className="h-3 w-3" />
            Source
          </Link>
          <span className="t-body font-mono text-white/35">Apache 2.0</span>
        </div>
      </div>
    </footer>
  );
}

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="t-body uppercase tracking-[0.2em] text-white/35">{eyebrow}</p>
      <h2 className="t-display mt-5 max-w-2xl text-white">{title}</h2>
    </div>
  );
}

function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 256 256" className={className} fill="currentColor" aria-hidden="true">
      <path d="M 0 128 C 70.692 128 128 185.308 128 256 L 64 256 C 64 220.654 35.346 192 0 192 Z M 256 192 C 220.654 192 192 220.654 192 256 L 128 256 C 128 185.308 185.308 128 256 128 Z M 128 0 C 128 70.692 70.692 128 0 128 L 0 64 C 35.346 64 64 35.346 64 0 Z M 192 0 C 192 35.346 220.654 64 256 64 L 256 128 C 185.308 128 128 70.692 128 0 Z" />
    </svg>
  );
}
