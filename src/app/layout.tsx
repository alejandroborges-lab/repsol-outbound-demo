import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Roberto · Dashboard de Ventas — Repsol Materials',
  description: 'Monitorización en tiempo real del agente de prospección outbound de estireno monómero',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
