import { CheckCircle2, LucideIcon } from "lucide-react";
import { PageShell } from "@/components/PageShell";

type TrustPageSection = {
  title: string;
  body: string;
};

type TrustPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  sections: TrustPageSection[];
};

export function TrustPage({ eyebrow, title, description, icon: Icon, sections }: TrustPageProps) {
  return (
    <PageShell eyebrow={eyebrow} title={title} description={description}>
      <div className="grid gap-4">
        <div className="rounded-md border border-orbi-cyan/15 bg-gradient-to-br from-orbi-panel/88 via-orbi-panel/70 to-orbi-black/82 p-5 shadow-[0_18px_55px_rgba(0,0,0,0.28),0_0_28px_rgba(31,139,255,0.1)] backdrop-blur sm:p-6">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-md border border-orbi-cyan/20 bg-orbi-blue/15 text-orbi-cyan shadow-[0_0_24px_rgba(31,139,255,0.14)]">
            <Icon aria-hidden="true" className="h-6 w-6" />
          </div>
          <div className="grid gap-3">
            {sections.map((section) => (
              <article
                key={section.title}
                className="rounded-md border border-white/10 bg-white/[0.04] p-4"
              >
                <div className="flex gap-3">
                  <CheckCircle2
                    aria-hidden="true"
                    className="mt-0.5 h-5 w-5 shrink-0 text-orbi-cyan"
                  />
                  <div>
                    <h2 className="font-black text-orbi-text">{section.title}</h2>
                    <p className="mt-1 text-sm leading-6 text-orbi-muted">{section.body}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
