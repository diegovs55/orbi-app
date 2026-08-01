import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { BottomNav } from "@/components/BottomNav";
import { SupabaseAuthListener } from "@/components/SupabaseAuthListener";
import { SplashScreen } from "@/components/SplashScreen";
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
        <SplashScreen />
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
          <BottomNav />
        </div>
      </body>
    </html>
  );
}
