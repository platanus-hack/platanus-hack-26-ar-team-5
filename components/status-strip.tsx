export function StatusStrip() {
  return (
    <div className="relative w-full">
      <div className="mx-auto flex max-w-7xl items-center justify-center gap-4 border-y border-polar-white/[0.04] px-6 py-5 md:px-10">
        <span className="h-px w-10 bg-polar-white/15" />
        <p className="text-[13px] italic text-ash-gray/70">
          Two parties, one ledger, one outcome.
        </p>
        <span className="h-px w-10 bg-polar-white/15" />
      </div>
    </div>
  );
}
