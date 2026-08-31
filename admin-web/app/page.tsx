import styles from './after-home.module.css';

const features = [
  ['Agenda compartida','Colegio, actividades, salud y compromisos familiares en una sola línea de tiempo.'],
  ['Estudio y tareas','Pruebas, trabajos y sesiones de estudio vinculadas a cada estudiante.'],
  ['Responsabilidades','Coordina quién se ocupa de cada cosa y reduce mensajes dispersos entre adultos.'],
  ['Documentos privados','Información familiar sensible almacenada fuera de la web pública y con acceso controlado.'],
] as const;

export default function Home() {
  return <main className={styles.page}>
    <header className={styles.header}>
      <a className={styles.brand} href="/"><span>✦</span><div><b>LESTRA</b><small>AFTER</small></div></a>
      <nav><a href="#funciones">Funciones</a><a href="#privacidad">Privacidad</a></nav>
      <a className={styles.lestraLink} href="https://lestra.app">Ecosistema Lestra ↗</a>
    </header>

    <section className={styles.hero}>
      <div>
        <p className={styles.eyebrow}>APP MÓVIL PARA FAMILIAS</p>
        <h1>Tu familia tiene mucho pasando.<br/><span>After lo pone en orden.</span></h1>
        <p className={styles.lead}>Colegio, pruebas, tareas, actividades, deporte, documentos y responsabilidades familiares reunidos alrededor de cada hijo.</p>
        <div className={styles.actions}><span className={styles.store}><i>▶</i><span><small>Próximamente en</small><b>Google Play</b></span></span><a className={styles.secondary} href="mailto:contacto@lestra.app?subject=Acceso%20anticipado%20Lestra%20After">Solicitar acceso anticipado</a></div>
        <p className={styles.note}>After está diseñada para instalarse en el teléfono. Esta web sirve para conocer el producto; la vida familiar se gestiona dentro de la app.</p>
      </div>
      <div className={styles.visual} aria-hidden="true"><div className={styles.aura}/><div className={styles.phone}><div className={styles.speaker}/><div className={styles.appHead}><span>✦</span><div><small>Buenos días</small><b>Tu semana</b></div></div><div className={styles.today}><small>HOY</small><b>Lo importante, a la vista.</b><i/></div><div className={styles.event}><em>09:00</em><b>Prueba de ciencias</b><small>Martina</small></div><div className={styles.event}><em>18:30</em><b>Entrenamiento</b><small>Tomás</small></div><div className={styles.family}><span>M</span><span>T</span><span>+</span></div></div></div>
    </section>

    <section className={styles.features} id="funciones"><div className={styles.sectionTitle}><p>UNA APP, MENOS CABOS SUELTOS</p><h2>Organiza sin convertir la vida familiar en otra planilla.</h2></div><div className={styles.grid}>{features.map(([title,copy],i)=><article key={title}><span>0{i+1}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></section>

    <section className={styles.privacy} id="privacidad"><div><p className={styles.eyebrow}>PRIVACIDAD DESDE EL DISEÑO</p><h2>La vida de tu familia no es contenido público.</h2></div><div><p><b>Google para identificarte.</b><span>Sin una contraseña adicional de Lestra.</span></p><p><b>Familias aisladas.</b><span>Cada usuario accede únicamente a su contexto autorizado.</span></p><p><b>Documentos privados.</b><span>Los archivos quedan separados de esta web pública.</span></p></div></section>

    <section className={styles.cta}><span>✦</span><p className={styles.eyebrow}>LESTRA AFTER</p><h2>Hecha para acompañarte en el teléfono, no para vivir en otra pestaña.</h2><p>Estamos preparando la distribución oficial para Android. La instalación se realizará desde Google Play cuando esté disponible.</p><a className={styles.secondary} href="mailto:contacto@lestra.app?subject=Avísame%20cuando%20Lestra%20After%20esté%20disponible">Avísame cuando esté disponible</a></section>

    <footer><a className={styles.brand} href="/"><span>✦</span><div><b>LESTRA</b><small>AFTER</small></div></a><p>© {new Date().getUTCFullYear()} Lestra</p><nav><a href="https://lestra.app">Lestra.app</a><a href="mailto:contacto@lestra.app">Contacto</a></nav></footer>
  </main>;
}
