import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OS-CAR — Sistema de Taller Mecánico",
  description: "Gestión operativa y administrativa de talleres mecánicos y flotas",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
