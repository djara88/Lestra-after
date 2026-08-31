import './access.css';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { logout } from '@/app/login/actions';
import { setFamilyStatus } from './actions';

type Summary = { families:number; active_families:number; members:number; students:number; agenda_items:number; documents:number; open_privacy_requests:number; created_last_30d:number };
type Family = { id:string; name:string; status:string; created_at:string; members:number; students:number };
type Audit = { id:number; action:string; entity_type:string; created_at:string };
type PlatformPageProps = { searchParams: Promise<{ error?: string; updated?: string }> };

export default async function PlatformPage({ searchParams }: PlatformPageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: allowed, error: accessError } = await supabase.rpc('after_platform_admin_access');
  if (accessError || allowed !== true) {
    return <main className="shell"><header className="topbar"><div className="brand"><span className="brandmark">L</span><span>Lestra After · Plataforma</span></div><form action={logout}><button className="ghost">Cerrar sesión</button></form></header><section className="head"><p className="eyebrow">ACCESO DE PLATAFORMA</p><h1>Cuenta Google aún no autorizada</h1><p>La identidad fue autenticada, pero aún no está ligada al rol interno de administrador de Lestra.</p></section></main>;
  }

  const [{data:summaryData,error:summaryError},{data:families,error:familiesError},{data:audit,error:auditError}] = await Promise.all([
    supabase.rpc('after_platform_admin_summary'),
    supabase.rpc('after_platform_admin_families',{p_limit:100}),
    supabase.rpc('after_platform_admin_audit',{p_limit:30}),
  ]);
  if (summaryError || familiesError || auditError) throw new Error('No fue posible cargar el portal de After.');
  const s = summaryData as Summary;
  const rows = (families ?? []) as Family[];
  const events = (audit ?? []) as Audit[];

  return <main className="shell">
    <header className="topbar"><div className="brand"><span className="brandmark">L</span><span>Lestra After · Plataforma</span></div><form action={logout}><button className="ghost">Cerrar sesión</button></form></header>
    {params.updated ? <p className="accessNotice success">Acceso actualizado correctamente.</p> : null}
    {params.error ? <p className="accessNotice error">No fue posible actualizar el acceso. La cuenta no fue modificada.</p> : null}
    <section className="head"><p className="eyebrow">ADMINISTRACIÓN LESTRA</p><h1>Control de After</h1><p>Vista de operación y crecimiento. No expone nombres de alumnos, documentos privados ni datos de salud.</p></section>
    <section className="grid">
      <article className="metric"><p>Familias</p><strong>{s.families}</strong><span>{s.active_families} activas · {s.created_last_30d} nuevas en 30 días</span></article>
      <article className="metric"><p>Alumnos activos</p><strong>{s.students}</strong><span>{s.members} miembros familiares</span></article>
      <article className="metric"><p>Agenda</p><strong>{s.agenda_items}</strong><span>Tareas y eventos creados</span></article>
      <article className="metric"><p>Documentos</p><strong>{s.documents}</strong><span>Metadatos privados registrados</span></article>
      <article className="metric"><p>Privacidad</p><strong>{s.open_privacy_requests}</strong><span>Solicitudes abiertas</span></article>
    </section>
    <section className="panel"><h2>Familias / cuentas</h2><div className="tableWrap"><table><thead><tr><th>Familia</th><th>Estado</th><th>Miembros</th><th>Alumnos</th><th>Alta</th><th>Acceso</th></tr></thead><tbody>{rows.map(r=>{
      const isActive = r.status === 'active';
      return <tr key={r.id}><td><strong>{r.name}</strong></td><td><span className={`statusBadge ${isActive ? 'active' : ''}`}>{isActive ? 'Activo' : r.status === 'paused' ? 'Pausado' : 'Cerrado'}</span></td><td>{r.members}</td><td>{r.students}</td><td>{new Date(r.created_at).toLocaleDateString('es-CL')}</td><td><form action={setFamilyStatus}><input type="hidden" name="family_id" value={r.id}/><input type="hidden" name="status" value={isActive ? 'paused' : 'active'}/><button className={`accessAction ${isActive ? 'pause' : 'restore'}`} type="submit">{isActive ? 'Pausar' : 'Reactivar'}</button></form></td></tr>;
    })}</tbody></table></div></section>
    <section className="panel"><h2>Actividad reciente</h2>{events.length===0?<p>Sin eventos de auditoría todavía.</p>:<div className="tableWrap"><table><thead><tr><th>Acción</th><th>Entidad</th><th>Fecha</th></tr></thead><tbody>{events.map(e=><tr key={e.id}><td>{e.action}</td><td>{e.entity_type}</td><td>{new Date(e.created_at).toLocaleString('es-CL')}</td></tr>)}</tbody></table></div>}</section>
  </main>;
}
