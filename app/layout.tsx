import type { Metadata, Viewport } from "next";
import { Saira_Condensed, Barlow, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const saira = Saira_Condensed({
  variable: "--font-saira",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Taller Mecánico OS-CAR — Diagnóstico · Refrigeración · Lubricación",
  description:
    "Centro de mando del Taller Mecánico OS-CAR de Posadas. Ingreso de vehículos, seguimiento en vivo con aprobación de presupuesto y gestión operativa de bahías, almacén y hotel de neumáticos.",
  keywords: ["taller mecánico", "Posadas", "OS-CAR", "diagnóstico OBD", "service", "neumáticos"],
  authors: [{ name: "Taller Mecánico OS-CAR" }],
};

export const viewport: Viewport = {
  themeColor: "#0A0B0E",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark" suppressHydrationWarning>
      <body
        className={`${saira.variable} ${barlow.variable} ${jetbrains.variable} antialiased bg-background text-foreground min-h-screen`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
