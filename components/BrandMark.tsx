import Link from "next/link";

export function BrandMark() {
  return (
    <Link href="/" className="inline-flex items-center gap-3" aria-label="Orbi inicio">
      <span className="relative flex h-10 w-10 items-center justify-center rounded-full border border-orbi-cyan/35 bg-orbi-blue/15 shadow-glow">
        <span className="h-3.5 w-3.5 rounded-full bg-orbi-cyan shadow-[0_0_18px_rgba(54,215,255,0.95)]" />
        <span className="absolute h-7 w-12 rotate-[-22deg] rounded-full border border-orbi-cyan/55" />
      </span>
      <span className="text-2xl font-black tracking-normal text-orbi-text">orbi</span>
    </Link>
  );
}
