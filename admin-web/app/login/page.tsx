import { loginWithGoogle } from './actions';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return <main className="authShell"><section className="authCard">
    <div className="brand"><span className="brandmark">L</span><span>Lestra After · Plataforma</span></div>
    <div className="authIntro"><p className="eyebrow">ADMINISTRACIÓN LESTRA</p><h1>Acceso con Google</h1><p>Este portal está reservado para administración de plataforma. La autenticación se realiza con Google y luego se valida tu rol interno en Supabase.</p></div>
    {params.error && <div className="authError">No pudimos completar el acceso con Google.</div>}
    <form action={loginWithGoogle}><button className="primary" type="submit">Continuar con Google</button></form>
    <p className="trust">No existe contraseña de superadministrador almacenada por Lestra.</p>
  </section></main>;
}
