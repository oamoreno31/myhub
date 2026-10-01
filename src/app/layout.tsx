import "./globals.css";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { ThemeProvider } from "next-themes";
import { RegistrarSW } from "@/components/pwa/registrar-sw";
import { Toaster } from "@/components/ui/sonner";

// Fuentes propias (archivos de @fontsource) servidas con next/font: se precargan y usan un
// respaldo con métricas ajustadas, así el texto no salta al cargar (mejor LCP y CLS en móvil).
const manrope = localFont({
  src: "../../node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2",
  weight: "200 800",
  variable: "--fuente-sans",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});
const fraunces = localFont({
  src: "../../node_modules/@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2",
  weight: "100 900",
  variable: "--fuente-display",
  display: "swap",
  fallback: ["Georgia", "serif"],
});

export const metadata: Metadata = {
  title: { default: "Plata Clara", template: "%s · Plata Clara" },
  description: "Control personal de ingresos, gastos, obligaciones y tarjetas de crédito, mes a mes.",
  applicationName: "Plata Clara",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Plata Clara", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f1ea" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1714" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-CO" suppressHydrationWarning className={`${manrope.variable} ${fraunces.variable}`}>
      <body className="min-h-dvh">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <Toaster />
          <RegistrarSW />
        </ThemeProvider>
      </body>
    </html>
  );
}
