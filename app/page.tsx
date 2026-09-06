import Link from "next/link";
import type { CSSProperties } from "react";

const entryPoints = [
  {
    href: "/cliente/alta",
    label: "Soy cliente",
    description: "Registrá tu vehículo y recibí acceso para seguir el trabajo del taller.",
    icon: <IntakeIcon />,
    accentVar: "--primary" as const,
  },
  {
    href: "/seguimiento",
    label: "Seguir mi vehículo",
    description: "Consultá el estado, los trabajos realizados y los costos de tu orden.",
    icon: <TrackingIcon />,
    accentVar: "--success" as const,
  },
  {
    href: "/admin/login",
    label: "Soy admin",
    description: "Ingresá al panel operativo para gestionar órdenes, bahías y reparaciones.",
    icon: <AdminIcon />,
    accentVar: "--accent" as const,
  },
] as const;

export default function HomePage() {
  return (
    <main className="os-shell" style={styles.main}>
      <div className="os-container" style={styles.container}>
        <header style={styles.header}>
          <p className="os-eyebrow" style={styles.eyebrow}>OS-CAR / TALLER OPERATIVO</p>
          <h1 style={styles.heading}>¿Qué necesitás hacer?</h1>
          <p style={styles.subheading}>
            Una entrada clara para cada momento del taller. Sin cuentas innecesarias para clientes.
          </p>
        </header>

        <div className="entry-grid" style={styles.grid}>
          {entryPoints.map((entry) => (
            <Link
              key={entry.href}
              href={entry.href}
              style={{
                ...styles.card,
                ["--card-accent" as string]: `var(${entry.accentVar})`,
              }}
              className="entry-card"
            >
              <span style={styles.iconWrap}>{entry.icon}</span>
              <span style={styles.cardLabel}>{entry.label}</span>
              <span style={styles.cardDescription}>{entry.description}</span>
              <span className="entry-card-arrow" aria-hidden="true">→</span>
            </Link>
          ))}
        </div>

        <p style={styles.footer}>
          OS-CAR mantiene separados el diagnóstico técnico, el trabajo realizado y los costos de tu vehículo.
        </p>
      </div>
    </main>
  );
}

function IntakeIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect x="6" y="5" width="16" height="20" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M11 5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 15l2.5 2.5L18 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrackingIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <circle cx="14" cy="14" r="3.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M14 3v3.2M14 21.8V25M3 14h3.2M21.8 14H25" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="14" cy="14" r="9" stroke="currentColor" strokeWidth="1.2" opacity="0.4" />
    </svg>
  );
}

function AdminIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="20" height="20" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 17v-4M14 17V9M19 17v-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

const styles: Record<string, CSSProperties> = {
  main: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "32px 20px",
  },
  container: { width: "100%", maxWidth: 1040 },
  header: { marginBottom: 36, maxWidth: 600 },
  eyebrow: { marginBottom: 12 },
  heading: {
    fontFamily: "'Inter Tight', 'Inter', system-ui, sans-serif",
    fontSize: "clamp(32px, 5vw, 52px)",
    fontWeight: 750,
    letterSpacing: "-0.04em",
    lineHeight: 1.05,
    color: "var(--text-main)",
    marginBottom: 16,
  },
  subheading: { fontSize: 17, lineHeight: 1.6, color: "var(--text-muted)", maxWidth: 520 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 },
  card: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 12,
    padding: "28px 24px",
    minHeight: 220,
    backgroundColor: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-lg)",
    textDecoration: "none",
    color: "var(--text-main)",
  },
  iconWrap: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 52,
    height: 52,
    borderRadius: "var(--radius-md)",
    backgroundColor: "var(--surface-raised)",
    color: "var(--card-accent, var(--primary))",
  },
  cardLabel: { fontSize: 20, fontWeight: 650, letterSpacing: "-0.02em", color: "var(--text-main)" },
  cardDescription: { fontSize: 14, lineHeight: 1.6, color: "var(--text-muted)", maxWidth: 280 },
  footer: { marginTop: 36, fontSize: 13, lineHeight: 1.5, color: "var(--text-muted)" },
};
