# Lestra After — V1 verification

Esta rama existe para ejecutar CI real sobre el candidato V1 sin alterar Deportivo.

## Recorridos validados

- Autenticación Google nativa preparada con `signInWithIdToken` y sesión persistida en SecureStore.
- Onboarding familiar reanudable: familia incompleta vuelve al alta del primer alumno.
- Alta de alumno.
- Alta manual de tarea/prueba/actividad.
- Agenda consolidada.
- Responsabilidades familiares.
- Documentos privados: PDF/JPG/PNG/WEBP, 8 MB máximo, ruta por familia/usuario y eliminación restringida al uploader.

## Seguridad validada

Pruebas transaccionales con dos identidades autenticadas y ROLLBACK confirmaron que una identidad externa a la familia obtiene:

- `is_family_member = false`
- `student_in_my_family = false`
- agenda: 0 elementos
- documentos: 0 elementos
- contexto familiar vacío

## Criterio CI

El workflow debe completar typecheck, validación Expo y export de bundles Android e iOS antes de considerar este candidato revisable.
