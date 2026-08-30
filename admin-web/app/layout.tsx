import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Lestra After · Plataforma', description: 'Administración interna de Lestra After' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
