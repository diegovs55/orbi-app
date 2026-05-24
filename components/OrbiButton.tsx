import Link from "next/link";
import type { LucideIcon } from "lucide-react";

type BaseProps = {
  children: React.ReactNode;
  icon?: LucideIcon;
  variant?: "primary" | "secondary";
  className?: string;
};

type LinkButtonProps = BaseProps & {
  href: string;
  type?: never;
};

type NativeButtonProps = BaseProps & {
  href?: never;
  type?: "button" | "submit";
};

export function OrbiButton(props: LinkButtonProps | NativeButtonProps) {
  const Icon = props.icon;
  const classes = [
    "inline-flex min-h-13 items-center justify-center gap-2 rounded-md px-5 py-3 text-sm font-bold transition",
    "focus:outline-none focus:ring-2 focus:ring-orbi-cyan/70 focus:ring-offset-2 focus:ring-offset-orbi-black",
    props.variant === "secondary"
      ? "border border-white/12 bg-white/5 text-orbi-text hover:border-orbi-cyan/45 hover:bg-white/10"
      : "bg-orbi-blue text-white shadow-glow hover:bg-[#0f7af0]",
    props.className ?? ""
  ].join(" ");

  const content = (
    <>
      {Icon ? <Icon aria-hidden="true" className="h-5 w-5 shrink-0" /> : null}
      <span>{props.children}</span>
    </>
  );

  if ("href" in props && props.href) {
    return (
      <Link href={props.href} className={classes}>
        {content}
      </Link>
    );
  }

  return (
    <button type={props.type ?? "button"} className={classes}>
      {content}
    </button>
  );
}
