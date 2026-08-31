import './globals.css';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Lestra After · Organización familiar',
  description: 'Agenda, estudio, responsabilidades y documentos familiares organizados en una app móvil privada.',
  applicationName: 'Lestra After',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es-CL"><body>{children}</body></html>;
}
