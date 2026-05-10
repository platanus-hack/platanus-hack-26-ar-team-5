import Link from "next/link";
import { ArrowRight, ArrowUpRight, Github } from "lucide-react";

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
  ["Amend", "Refine an accepted state in place. Positive-sum."],
  ["Escalate", "Hand the deadlock to the tribunal."],
  ["Withdraw", "Exit the dispute. Binding once both sides have engaged."],
];

const tiers = [
  ["S", "Crypto self-verifying", "On-chain tx, counterparty signatures."],
  ["A", "Trusted third-party attestation", "Oracles, signed commits, audited papers."],
  ["B", "Self-emitted, signed", "Internal logs, transcripts."],
  ["C", "Pure argumentation", "Modulates only. Never decides alone."],
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#0c0c0c] text-white">
      <Nav />
      <Hero />
      <Explainer />
      <StackSection />
      <FlowsSection />
      <Primitives />
      <Tiers />
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

function Explainer() {
  const steps: Array<{ title: string; body: string }> = [
    {
      title: "They open a dispute",
      body: "Two AI agents take opposite sides of a free-form claim. Each one gets a signing key and a turn to act.",
    },
    {
      title: "They exchange signed offers",
      body: "Propose, Counter, Critique, Reveal. Every move is Ed25519-signed and cites the prior moves and evidence it leans on.",
    },
    {
      title: "They converge or escalate",
      body: "If both sides Accept the same target the deal is done. If they deadlock, a 3-LLM tribunal arbitrates. Either way the output is a content-addressed bundle anyone can re-verify offline.",
    },
  ];
  return (
    <section className="mx-auto max-w-5xl px-6 pb-24">
      <SectionHeader
        eyebrow="How it works"
        title="Negotiation, evidence, and a verdict. All signed end to end."
      />
      <ol className="mt-12 grid gap-px overflow-hidden rounded-md border border-white/[0.08] bg-white/[0.06] md:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.title} className="flex flex-col gap-3 bg-[#0c0c0c] p-6">
            <span className="t-body font-mono uppercase tracking-[0.18em] text-white/35">
              {String(i + 1).padStart(2, "0")}
            </span>
            <p className="t-label text-white">{s.title}</p>
            <p className="t-body leading-[20px] text-white/55">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function FlowsSection() {
  return (
    <section className="mx-auto max-w-5xl border-t border-white/[0.06] px-6 py-20">
      <SectionHeader
        eyebrow="Two paths to a signed bundle"
        title="Either they agree, or the tribunal decides. Both produce the same artifact."
      />
      <div className="mt-12 grid gap-4 lg:grid-cols-2">
        <FlowCard
          eyebrow="Convergence"
          title="They iterate until both sign the same target."
          subtitle="No tribunal needed. Cheapest path."
          svg={<ConvergedDag />}
        />
        <FlowCard
          eyebrow="Tribunal"
          title="They deadlock, the tribunal rules."
          subtitle="3 heterogeneous LLMs vote. The aggregate is binding."
          svg={<TribunalDag />}
        />
      </div>
      <p className="t-body mt-6 text-white/40">
        Each circle is an Ed25519-signed primitive. Lines are{" "}
        <span className="font-mono text-white/65">parent_refs</span>. Every
        node cites the prior moves it depends on. A third party re-verifies the
        whole graph offline with{" "}
        <span className="font-mono text-white/65">pnpm verify</span>.
      </p>
    </section>
  );
}

function FlowCard({
  eyebrow,
  title,
  subtitle,
  svg,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  svg: React.ReactNode;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0a0c10]">
      <div className="border-b border-white/[0.06] px-5 py-4">
        <p className="t-body uppercase tracking-[0.18em] text-white/35">
          {eyebrow}
        </p>
        <p className="mt-1 t-label text-white">{title}</p>
        <p className="mt-1 t-body text-white/45">{subtitle}</p>
      </div>
      <div className="overflow-x-auto px-3 py-5">{svg}</div>
    </div>
  );
}

function ConvergedDag() {
  return (
    <svg
      viewBox="0 0 580 200"
      className="block h-auto w-full min-w-[480px]"
      role="img"
      aria-label="Convergence flow: Aria proposes, Atlas counters, both Aria and Atlas Accept the same target, single root hash."
    >
      {[30, 100, 170].map((y) => (
        <line
          key={y}
          x1={110}
          x2={580}
          y1={y}
          y2={y}
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="1"
        />
      ))}

      <FlowLane y={65} eyebrow="Claimant" name="Aria" color="rgba(231,197,154,0.85)" />
      <FlowLane y={135} eyebrow="Respondent" name="Atlas" color="rgba(122,162,247,0.85)" />

      <DagEdge d="M 155 65 C 195 65, 195 135, 215 135" />
      <DagEdge d="M 255 135 C 295 135, 295 65, 335 65" />
      <DagEdge d="M 255 135 L 335 135" />
      <DagEdge d="M 375 65 C 415 65, 415 100, 455 100" tone="root" />
      <DagEdge d="M 375 135 C 415 135, 415 100, 455 100" tone="root" />

      <DagNode cx={135} cy={65} fill="#A4F4FD" icon="·" label="Propose" />
      <DagNode cx={235} cy={135} fill="#7AA2F7" icon="↺" label="Counter" />
      <DagNode cx={355} cy={65} fill="#E7C59A" icon="✓" label="Accept" ringed />
      <DagNode cx={355} cy={135} fill="#E7C59A" icon="✓" label="Accept" ringed />
      <DagNode
        cx={475}
        cy={100}
        fill="transparent"
        outline="#ffffff"
        icon="⚿"
        label="Root"
      />
    </svg>
  );
}

function TribunalDag() {
  return (
    <svg
      viewBox="0 0 640 240"
      className="block h-auto w-full min-w-[520px]"
      role="img"
      aria-label="Tribunal flow: parties deadlock, three LLM jurors vote, ruling, root hash."
    >
      {[30, 85, 150, 215].map((y) => (
        <line
          key={y}
          x1={110}
          x2={640}
          y1={y}
          y2={y}
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="1"
        />
      ))}

      <FlowLane y={60} eyebrow="Claimant" name="Aria" color="rgba(231,197,154,0.85)" />
      <FlowLane y={125} eyebrow="Respondent" name="Atlas" color="rgba(122,162,247,0.85)" />
      <FlowLane y={190} eyebrow="Arbiter" name="Tribunal" color="rgba(192,132,252,0.85)" />

      <DagEdge d="M 155 60 C 195 60, 195 125, 220 125" />
      <DagEdge d="M 250 125 C 290 125, 290 60, 320 60" />
      <DagEdge d="M 335 75 C 335 130, 250 130, 250 175" tone="tribunal" />
      <DagEdge d="M 335 75 L 350 175" tone="tribunal" />
      <DagEdge d="M 335 75 C 335 130, 450 130, 450 175" tone="tribunal" />
      <DagEdge d="M 265 190 L 535 190" tone="tribunal" />
      <DagEdge d="M 365 190 L 535 190" tone="tribunal" />
      <DagEdge d="M 465 190 L 535 190" tone="tribunal" />
      <DagEdge d="M 565 190 L 600 190" tone="root" />

      <DagNode cx={135} cy={60} fill="#A4F4FD" icon="·" label="Propose" />
      <DagNode cx={235} cy={125} fill="#7AA2F7" icon="↺" label="Counter" />
      <DagNode cx={335} cy={60} fill="#FF7A59" icon="↗" label="Escalate" />
      <DagNode cx={250} cy={190} fill="#C084FC" icon="⚖" label="Aequitas" />
      <DagNode cx={350} cy={190} fill="#C084FC" icon="⚖" label="Utilis" />
      <DagNode cx={450} cy={190} fill="#C084FC" icon="⚖" label="Velox" />
      <DagNode cx={550} cy={190} fill="#C084FC" icon="§" label="Ruling" ringed />
      <DagNode
        cx={615}
        cy={190}
        fill="transparent"
        outline="#ffffff"
        icon="⚿"
        label="Root"
      />
    </svg>
  );
}

function FlowLane({
  y,
  eyebrow,
  name,
  color,
}: {
  y: number;
  eyebrow: string;
  name: string;
  color: string;
}) {
  return (
    <g>
      <text
        x={20}
        y={y - 8}
        fontSize="9"
        fontWeight="500"
        letterSpacing="0.18em"
        fill={color}
      >
        {eyebrow.toUpperCase()}
      </text>
      <text
        x={20}
        y={y + 8}
        fontSize="12"
        fontWeight="500"
        fill="rgba(255,255,255,0.9)"
      >
        {name}
      </text>
    </g>
  );
}

function DagEdge({
  d,
  tone = "default",
}: {
  d: string;
  tone?: "default" | "tribunal" | "root";
}) {
  const stroke =
    tone === "default"
      ? "rgba(255,255,255,0.18)"
      : tone === "tribunal"
        ? "rgba(192,132,252,0.35)"
        : "rgba(231,197,154,0.5)";
  const dash = tone === "root" ? "3 3" : undefined;
  return (
    <path
      d={d}
      fill="none"
      stroke={stroke}
      strokeWidth="1.5"
      strokeDasharray={dash}
    />
  );
}

function DagNode({
  cx,
  cy,
  fill,
  outline,
  icon,
  label,
  caption,
  ringed,
}: {
  cx: number;
  cy: number;
  fill: string;
  outline?: string;
  icon: string;
  label: string;
  caption?: string;
  ringed?: boolean;
}) {
  const isOpen = fill === "transparent";
  return (
    <g>
      {ringed && (
        <circle
          cx={cx}
          cy={cy}
          r={22}
          fill="none"
          stroke={fill}
          strokeOpacity="0.35"
        />
      )}
      <circle
        cx={cx}
        cy={cy}
        r={15}
        fill={fill}
        stroke={outline ?? fill}
        strokeWidth={isOpen ? 1.5 : 0}
      />
      <text
        x={cx}
        y={cy + 4}
        textAnchor="middle"
        fontSize="12"
        fontWeight="600"
        fill={isOpen ? outline : "#0c0c0c"}
      >
        {icon}
      </text>
      <text
        x={cx}
        y={cy + 32}
        textAnchor="middle"
        fontSize="11"
        fill="rgba(255,255,255,0.78)"
      >
        {label}
      </text>
      {caption && (
        <text
          x={cx}
          y={cy + 46}
          textAnchor="middle"
          fontSize="10"
          fill="rgba(255,255,255,0.4)"
        >
          {caption}
        </text>
      )}
    </g>
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

function Primitives() {
  return (
    <section
      id="primitives"
      className="mx-auto max-w-5xl border-t border-white/[0.06] px-6 py-20"
    >
      <SectionHeader
        eyebrow="The protocol"
        title="Eight primitives. Nothing more."
      />

      <ul className="mt-12 grid gap-px overflow-hidden rounded-md border border-white/[0.08] bg-white/[0.06] sm:grid-cols-2 md:grid-cols-4">
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
