# After — estabilización de autenticación y build

Estado: rama `feat/after-stabilization-auth-runner-v1`

## 1. Autenticación objetivo

After no debe administrar contraseñas propias. La identidad se delega a proveedores externos y el acceso real a datos se controla dentro de After mediante UUID, membresía familiar, RPC y RLS.

Capas soportadas por el cliente:

1. **Google OAuth** mediante Supabase Auth.
2. **Microsoft Entra ID (Azure OAuth)** mediante Supabase Auth. Se activa con `EXPO_PUBLIC_ENABLE_AZURE_AUTH=true` únicamente después de configurar el proveedor en Supabase.
3. **SSO corporativo por dominio (SAML 2.0)** mediante `signInWithSSO`. Se activa con `EXPO_PUBLIC_ENABLE_ENTERPRISE_SSO=true` únicamente cuando exista al menos un IdP registrado en Supabase.

El cliente usa un único callback móvil:

`lestraafter://auth/callback`

Este callback debe estar incluido en la allowlist de Redirect URLs de Supabase.

### Microsoft / tenant

Para un tenant Microsoft corporativo se recomienda:

- registrar la aplicación en Microsoft Entra ID;
- utilizar el callback de Supabase `https://<project-ref>.supabase.co/auth/v1/callback`;
- configurar el proveedor Azure en Supabase;
- solicitar el scope `email`;
- para acceso limitado a una sola organización, configurar la URL de tenant `https://login.microsoftonline.com/<tenant-id>` en vez de `common`;
- incluir el claim opcional `xms_edov` para que Supabase pueda distinguir correos verificados de Entra.

Para clientes con otros IdP (Google Workspace administrado, Okta, Entra, PingIdentity, etc.), usar SAML SSO por dominio cuando el plan de Supabase lo permita.

## 2. Eliminación de dependencia nativa innecesaria

La pantalla móvil ya no utiliza el SDK nativo `@react-native-google-signin/google-signin`; Google se autentica por OAuth web seguro a través de Supabase + `expo-web-browser`.

Para no arriesgar una desincronización manual de `package-lock.json` antes de disponer de un builder estable:

- se eliminó el config plugin nativo del `app.config.ts`;
- el paquete quedó temporalmente instalado en npm;
- Expo Autolinking lo excluye explícitamente de Android e iOS.

Cuando el self-hosted runner esté operativo, ejecutar `npm uninstall @react-native-google-signin/google-signin`, validar `npm ci`, `expo prebuild`, Android/iOS bundles y committear el lockfile generado.

## 3. Problema real observado en GitHub Actions

El fallo de la Beta 0.5.5 no fue un error de Gradle, TypeScript ni del workflow Android:

- el job `Android Beta APK` finalizó en aproximadamente dos segundos;
- `runner_id` fue `0`;
- no hubo `runner_name`;
- `steps` fue una lista vacía;
- los jobs independientes `mobile` y `admin-web` de CI fallaron del mismo modo.

Eso significa que **GitHub no asignó un runner hospedado al job**. El código del repositorio nunca llegó a ejecutarse.

La API disponible al proyecto no expone la página de Billing/Actions, por lo que desde el repositorio no puede distinguirse con certeza entre:

- minutos de GitHub-hosted Actions agotados;
- límite/presupuesto de Actions alcanzado;
- restricción de facturación;
- política de Actions/runner a nivel de cuenta.

Debe verificarse en GitHub: `Settings -> Billing and licensing -> Actions` y `Repository -> Settings -> Actions -> General`.

## 4. Solución con Windows Server 2022 / 12 GB RAM

Usar el servidor disponible como **self-hosted GitHub Actions runner** dedicado a After.

Ventajas:

- no consume minutos de GitHub-hosted runners;
- 12 GB de RAM superan el entorno free usado en Render y permiten reservar ~4 GB para Gradle sin asfixiar el SO;
- Android SDK/NDK/CMake quedan cacheados en el servidor;
- no se depende de Render para compilar APK;
- el APK se publica directamente como GitHub Release, sin usar artifact storage.

Requisitos recomendados:

- Windows Server 2022 x64 actualizado;
- al menos 30 GB libres para SDK, NDK, cachés y workspaces;
- salida HTTPS a GitHub, npm, Google Android repositories y Adoptium;
- runner ejecutado como servicio;
- equipo dedicado a build, sin exponer puertos entrantes desde Internet;
- no ejecutar PRs de repositorios no confiables en este runner.

### Instalación

Desde PowerShell elevado, ejecutar el script del repositorio:

`powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows-after-builder.ps1`

El script solicita el token temporal de registro del runner, instala JDK 17, Android SDK 36, Build Tools 36, NDK 27.1, CMake 3.22.1, GitHub CLI y registra el runner con etiqueta `after-builder`.

El token se obtiene en GitHub:

`Repository -> Settings -> Actions -> Runners -> New self-hosted runner -> Windows x64`

No guardar ese token en `.env`, scripts o Git; es efímero.

### Workflows nuevos

- `Android Beta APK - Self Hosted`: compila Android, verifica que el bundle JS esté dentro del APK, calcula SHA-256 y publica el archivo como prerelease.
- `CI - Self Hosted`: typecheck, Expo validation, bundles Android/iOS y build/audit del admin web.

## 5. Política de seguridad del runner

- runner dedicado exclusivamente al repositorio After;
- instalar actualizaciones de Windows regularmente;
- no usar cuenta de administrador interactiva como cuenta cotidiana;
- no montar shares con secretos de producción;
- secretos sólo mediante GitHub Secrets / Supabase, nunca en el filesystem del repo;
- workspace del runner considerado efímero/no confiable;
- limpiar workspaces antiguos y cachés si se sospecha contaminación;
- no aceptar workflows arbitrarios desde forks.
