"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, PackagePlus, Route, UserRound, UsersRound } from "lucide-react";

const navItems = [
  { href: "/", label: "Inicio", icon: null },
  { href: "/pedir", label: "Pedir", icon: PackagePlus },
  { href: "/orbita", label: "Órbita", icon: Route },
  { href: "/negocios", label: "Negocios", icon: Building2 },
  { href: "/agentes", label: "Agentes", icon: UsersRound },
  { href: "/usuarios", label: "Mi cuenta", icon: UserRound },
];

function isActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-orbi-black/88 px-2 py-2 backdrop-blur-xl">
      <div className="mx-auto grid max-w-2xl grid-cols-6 gap-1">
        {navItems.map((item) => {
          const active = isActive(item.href, pathname);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex min-h-14 flex-col items-center justify-center gap-0.5"
            >
              <span
                className={`flex flex-col items-center gap-0.5 rounded-2xl px-3 py-1.5 transition-colors ${
                  active
                    ? "bg-white/10 text-orbi-cyan"
                    : "text-orbi-muted hover:text-orbi-text"
                }`}
              >
                {Icon ? (
                  <Icon
                    aria-hidden="true"
                    className={`h-5 w-5 transition-all ${active ? "stroke-[2.5]" : "stroke-[1.75]"}`}
                  />
                ) : (
                  <span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-sm border border-orbi-cyan/20 bg-orbi-black shadow-[0_0_14px_rgba(31,139,255,0.22)]">
                    <Image
                      src="/orbi-logo.png"
                      alt=""
                      width={24}
                      height={24}
                      aria-hidden="true"
                      className="h-full w-full object-cover"
                    />
                  </span>
                )}
                <span
                  className={`text-[10px] sm:text-[11px] ${active ? "font-bold" : "font-medium"}`}
                >
                  {item.label}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
