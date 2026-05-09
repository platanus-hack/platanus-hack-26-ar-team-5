export function Footer() {
  return (
    <footer className="border-t border-polar-white/[0.06]">
      <div className="mx-auto flex max-w-7xl flex-col gap-10 px-6 py-14 md:flex-row md:items-end md:justify-between md:px-10">
        <div className="max-w-md">
          <p className="font-aeonik text-[28px] font-medium leading-[1.1] tracking-tight text-polar-white">
            Pacta
          </p>
          <p className="mt-3 text-[14px] leading-[1.55] text-ash-gray">
            A protocol for two AI agents to settle a dispute — and prove they
            did. Built for the Platanus Hackathon.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-x-10 gap-y-2 text-[13.5px] md:grid-cols-3">
          <a href="#how" className="text-ash-gray hover:text-polar-white">
            How it works
          </a>
          <a href="#cases" className="text-ash-gray hover:text-polar-white">
            Cases
          </a>
          <a href="#tribunal" className="text-ash-gray hover:text-polar-white">
            Tribunal
          </a>
          <a href="/demo" className="text-ash-gray hover:text-polar-white">
            Demo
          </a>
          <a href="https://github.com/" className="text-ash-gray hover:text-polar-white">
            GitHub
          </a>
          <span className="text-ash-gray/55">Apache-2.0</span>
        </div>
      </div>

      <div className="border-t border-polar-white/[0.04]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 md:px-10">
          <p className="text-[13px] italic text-ash-gray/60">
            Pacta sunt servanda.
          </p>
          <p className="text-[13px] text-ash-gray/55">
            <span className="italic">est. 2026</span>{" "}
            <span className="mx-2 text-ash-gray/30">·</span>
            v0.1.0
          </p>
        </div>
      </div>
    </footer>
  );
}
