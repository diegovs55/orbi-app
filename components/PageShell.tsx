import { BrandMark } from "@/components/BrandMark";

type PageShellProps = {
  eyebrow?: string;
  title: string;
  description: string;
  children: React.ReactNode;
};

export function PageShell({ eyebrow, title, description, children }: PageShellProps) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mb-8 flex items-center justify-between">
        <BrandMark />
        <span className="rounded-full border border-orbi-cyan/25 px-3 py-1 text-xs font-semibold text-orbi-cyan">
          Red Orbi
        </span>
      </header>
      <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center">
        {eyebrow ? (
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.28em] text-orbi-cyan">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="max-w-2xl text-4xl font-black leading-tight tracking-normal text-orbi-text sm:text-6xl">
          {title}
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-orbi-muted sm:text-lg">
          {description}
        </p>
        <div className="mt-8">{children}</div>
      </section>
    </div>
  );
}
