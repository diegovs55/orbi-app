import type { Metadata, Viewport } from "next";
import Image from "next/image";
import Link from "next/link";
import { Building2, PackagePlus, Route, UserRound, UsersRound } from "lucide-react";
import { SupabaseAuthListener } from "@/components/SupabaseAuthListener";
import "./globals.css";

export const metadata: Metadata = {
  title: "Orbi | Red logística local",
  description: "Red local para conectar necesidades, mover productos o personas y llegar para resolver.",
  applicationName: "Orbi",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32", type: "image/x-icon" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/orbi-icon.svg", type: "image/svg+xml" },
    ],
    apple: { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
  },
  appleWebApp: {
    capable: true,
    title: "Orbi",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#05070d",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1
};

const navItems = [
  { href: "/", label: "Inicio", icon: null },
  { href: "/pedir", label: "Pedir", icon: PackagePlus },
  { href: "/orbita", label: "Órbita", icon: Route },
  { href: "/negocios", label: "Negocios", icon: Building2 },
  { href: "/agentes", label: "Agentes", icon: UsersRound },
  { href: "/usuarios", label: "Mi cuenta", icon: UserRound }
];

const footerLinks = [
  { href: "/privacidad", label: "Privacidad" },
  { href: "/terminos", label: "Términos" },
  { href: "/confianza", label: "Confianza" },
  { href: "/admin", label: "· Admin" }
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        {/* Runs synchronously before React hydration. If Supabase redirected a
            password-recovery link to this page (because the redirectTo URL was not
            whitelisted), the hash will contain type=recovery. We catch it here and
            send the user to the reset page before any JS framework code runs. */}
        <script
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var h=window.location.hash;if(h&&h.indexOf('type=recovery')!==-1){window.location.replace('/usuarios/reset-password'+h);}}catch(e){}})();`,
          }}
        />
        <SupabaseAuthListener />
        <div className="relative min-h-screen overflow-hidden pb-24">
          <div className="orbit-grid pointer-events-none absolute inset-0 opacity-80" />
          <main className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-6 sm:px-8">
            {children}
            <footer className="mt-10 border-t border-white/10 pt-5">
              <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-semibold text-orbi-muted">
                {footerLinks.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="transition hover:text-orbi-cyan"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </footer>
          </main>
          <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-orbi-black/88 px-2 py-2 backdrop-blur-xl">
            <div className="mx-auto grid max-w-2xl grid-cols-6 gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-md text-[10px] font-medium text-orbi-muted transition hover:bg-white/7 hover:text-orbi-text sm:text-[11px]"
                  >
                    {Icon ? (
                      <Icon aria-hidden="true" className="h-5 w-5" />
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
