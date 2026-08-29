# Security baseline — Lestra After

- El alumno es el centro funcional, pero el acceso pertenece a una familia autenticada.
- Todas las tablas del esquema `after` usan RLS y aislamiento por familia.
- No existen dependencias directas con tablas de dominio de Deportivo.
- Documentos reales deben almacenarse únicamente en buckets privados.
- No usar service role en navegador.
- Datos de menores, salud y documentos se minimizan y se procesan sólo para el propósito declarado.
- Toda extracción automática debe pasar por revisión humana antes de crear información definitiva.
- No usar material real para entrenamiento automático del producto.
