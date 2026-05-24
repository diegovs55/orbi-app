import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Activity, Building2, Home, PackagePlus, Route } from "lucide-react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Orbi | Red logística local",
  description: "Red local para conectar necesidades, mover productos o personas y llegar para resolver.",
  applicationName: "Orbi",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Orbi",
    statusBarStyle: "black-translucent"
  }
};

export const viewport: Viewport = {
  themeColor: "#05070d",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1
};

const navItems = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/pedir", label: "Pedir", icon: PackagePlus },
  { href: "/orbita", label: "Órbita", icon: Route },
  { href: "/negocios", label: "Negocios", icon: Building2 },
  { href: "/admin", label: "Admin", icon: Activity }
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <div className="relative min-h-screen overflow-hidden pb-24">
          <div className="orbit-grid pointer-events-none absolute inset-0 opacity-80" />
          <main className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-6 sm:px-8">
            {children}
          </main>
          <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-orbi-black/88 px-2 py-2 backdrop-blur-xl">
            <div className="mx-auto grid max-w-2xl grid-cols-5 gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-md text-[11px] font-medium text-orbi-muted transition hover:bg-white/7 hover:text-orbi-text"
                  >
                    <Icon aria-hidden="true" className="h-5 w-5" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>
      </body>
    </html>
  );
}
