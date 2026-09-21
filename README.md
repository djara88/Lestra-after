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

## Beta 0.5.8
OCR estructural para calendarios escolares y carga de horario por OCR conectada con Mochila.


## Beta 0.5.9
Calendario con vistas Semana/Mes/Año y Mochila rediseñada para niños: estuche global, materiales especiales manuales, OCR de horario y checklist diario.
