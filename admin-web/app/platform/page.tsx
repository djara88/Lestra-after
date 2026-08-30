import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { logout } from '@/app/login/actions';

type Summary = {
  families:number;
  active_families:number;
  members:number;
  students:number;
  agenda_items:number;
  documents:number;
  open_privacy_requests:number;
  created_last_30d:number;
};

type Family = {
  id:string;
  name:string;
  status:string;
  created_at:string;
  members:number;
  students:number;
};

type Audit = {
  id:number;
  action:string;
  entity_type:string;
  created_at:string;
};

function percent(part:number, total:number) {
  if (!total) return 0;
  return Math.round((Number(part || 0) / Number(total || 0)) * 100);
}

export default async function PlatformPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: allowed, error: accessError } = await supabase.rpc('after_platform_admin_access');
  if (accessError || allowed !== true) {
    return <main className="platformGate">
      <section className="platformGateCard">
        <span className="platformLogo">L</span>
        <p className="platformKicker">LESTRA CONTROL</p>
        <h1>Acceso de plataforma pendiente</h1>
        <p>La identidad fue autenticada, pero esta cuenta aún no está autorizada como administración interna de Lestra After.</p>
        <form action={logout}><button className="platformButton secondary" type="submit">Cerrar sesión</button></form>
      </section>
    </main>;
  }

  const [summaryResult, familiesResult, auditResult] = await Promise.all([
    supabase.rpc('after_platform_admin_summary'),
    supabase.rpc('after_platform_admin_families', { p_limit: 100 }),
    supabase.rpc('after_platform_admin_audit', { p_limit: 30 }),
  ]);

  if (summaryResult.error || familiesResult.error || auditResult.error) {
    throw new Error('No fue posible cargar el portal de plataforma de Lestra After.');
  }

  const s = summaryResult.data as Summary;
  const rows = (familiesResult.data ?? []) as Family[];
  const events = (auditResult.data ?? []) as Audit[];
  const activation = percent(s.active_families, s.families);

  return <main className="platformApp">
    <aside className="platformSidebar">
      <div className="platformBrand">
        <span className="platformLogo">L</span>
        <div><strong>Lestra</strong><small>Control</small></div>
      </div>
      <nav className="platformNav" aria-label="Administración de Lestra After">
        <a className="active" href="#overview"><span>01</span> Resumen</a>
        <a href="#families"><span>02</span> Familias</a>
        <a href="#privacy"><span>03</span> Privacidad</a>
        <a href="#audit"><span>04</span> Auditoría</a>
      </nav>
      <div className="platformSidebarFoot">
        <span className="platformEnvironment"><i/> Producción</span>
        <small>Lestra After</small>
      </div>
    </aside>

    <section className="platformMain">
      <header className="platformTopbar">
        <div><p>Administración de plataforma</p><strong>Lestra After</strong></div>
        <div className="platformTopActions">
          <span className="platformSecure">Acceso protegido</span>
          <form action={logout}><button className="platformIconButton" type="submit" aria-label="Cerrar sesión">Salir</button></form>
        </div>
      </header>

      <div className="platformContent" id="overview">
        <section className="platformHero">
          <div>
            <p className="platformKicker">LESTRA CONTROL</p>
            <h1>Vista general</h1>
            <p>Control ejecutivo de Lestra After. Esta consola trabaja con métricas operacionales y evita exponer nombres de estudiantes, contenido de documentos privados o información sensible.</p>
          </div>
          <div className="platformHealth">
            <span>Estado de plataforma</span>
            <strong>Operativa</strong>
            <small>{activation}% de familias registradas están activas</small>
          </div>
        </section>

        <section className="platformMetrics">
          <article>
            <div className="metricTop"><span className="metricGlyph">F</span><em>+{s.created_last_30d} / 30d</em></div>
            <strong>{s.families}</strong><p>Familias registradas</p><small>{s.active_families} activas</small>
          </article>
          <article>
            <div className="metricTop"><span className="metricGlyph">E</span></div>
            <strong>{s.students}</strong><p>Estudiantes</p><small>{s.members} miembros familiares</small>
          </article>
          <article>
            <div className="metricTop"><span className="metricGlyph">A</span></div>
            <strong>{s.agenda_items}</strong><p>Ítems de agenda</p><small>Tareas, eventos y responsabilidades</small>
          </article>
          <article>
            <div className="metricTop"><span className="metricGlyph">D</span></div>
            <strong>{s.documents}</strong><p>Documentos</p><small>Solo metadatos agregados</small>
          </article>
        </section>

        <section className="platformSplit">
          <article className="platformCard" id="families">
            <div className="platformCardHead"><div><p className="platformKicker">CUENTAS</p><h2>Familias</h2></div><span>{rows.length} visibles</span></div>
            {rows.length === 0 ?
              <div className="platformEmpty"><span className="emptyGlyph">F</span><strong>Aún no hay familias registradas</strong><p>Las cuentas aparecerán aquí cuando comience la operación real.</p></div> :
              <div className="platformTableWrap"><table className="platformTable"><thead><tr><th>Familia</th><th>Estado</th><th>Miembros</th><th>Estudiantes</th><th>Alta</th></tr></thead><tbody>{rows.map(r => <tr key={r.id}><td><strong>{r.name}</strong></td><td><span className={`statusDot ${r.status === 'active' ? 'ok' : ''}`}>{r.status}</span></td><td>{r.members}</td><td>{r.students}</td><td>{new Date(r.created_at).toLocaleDateString('es-CL')}</td></tr>)}</tbody></table></div>}
          </article>

          <aside className="platformStack">
            <article className="platformCard privacyCard" id="privacy">
              <div className="privacyIcon">P</div>
              <p className="platformKicker">PRIVACIDAD</p>
              <strong>{s.open_privacy_requests}</strong>
              <h3>Solicitudes abiertas</h3>
              <p>Seguimiento agregado sin mostrar información personal, documentos ni antecedentes privados.</p>
            </article>
            <article className="platformCard">
              <p className="platformKicker">ESTRUCTURA</p>
              <div className="structureRows">
                <span>Familias activas <strong>{s.active_families}</strong></span>
                <span>Miembros <strong>{s.members}</strong></span>
                <span>Estudiantes <strong>{s.students}</strong></span>
                <span>Documentos <strong>{s.documents}</strong></span>
              </div>
            </article>
          </aside>
        </section>

        <section className="platformCard" id="audit">
          <div className="platformCardHead"><div><p className="platformKicker">SEGURIDAD</p><h2>Actividad reciente</h2></div><span>Últimos {Math.min(events.length, 30)}</span></div>
          {events.length === 0 ?
            <div className="platformEmpty"><span className="emptyGlyph">A</span><strong>Sin eventos de auditoría todavía</strong></div> :
            <div className="auditList">{events.map(e => <div className="auditRow" key={e.id}><span className="auditGlyph">•</span><div><strong>{e.action}</strong><small>{e.entity_type}</small></div><time>{new Date(e.created_at).toLocaleString('es-CL')}</time></div>)}</div>}
        </section>
      </div>
    </section>
  </main>;
}
