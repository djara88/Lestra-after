# Lestra After

Aplicación móvil familiar centrada en el alumno. React Native + Expo + TypeScript + Supabase.

## Principios
- App móvil real para iOS y Android.
- Aislamiento estricto por familia mediante RLS.
- Nunca incluir `service_role`/secret keys en el cliente.
- `EXPO_PUBLIC_*` contiene exclusivamente valores publicables.
- Datos reales de menores sólo después de validar autorización, almacenamiento y eliminación.

## Primer flujo
Login → Hoy → Agenda → Agregar → Familia.

La IA se incorpora después del flujo manual y siempre con revisión humana antes de crear información definitiva.