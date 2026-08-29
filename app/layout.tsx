import './globals.css';
export const metadata = { title: 'Lestra After', description: 'Tu familia, estudio y vida en un solo lugar' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="es"><body>{children}</body></html>; }
