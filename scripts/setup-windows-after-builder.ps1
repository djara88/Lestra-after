[CmdletBinding()]
param(
  [string]$RepoUrl = 'https://github.com/djara88/Lestra-after',
  [string]$BuilderRoot = 'C:\AfterBuilder',
  [string]$RunnerName = 'after-builder-01',
  [string]$RunnerToken
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Assert-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Ejecuta PowerShell como Administrador.'
  }
}

function Add-MachinePath([string]$PathToAdd) {
  $current = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $parts = @($current -split ';' | Where-Object { $_ })
  if ($parts -notcontains $PathToAdd) {
    [Environment]::SetEnvironmentVariable('Path', (($parts + $PathToAdd) -join ';'), 'Machine')
  }
  if (($env:Path -split ';') -notcontains $PathToAdd) {
    $env:Path = "$PathToAdd;$env:Path"
  }
}

function Download-File([string]$Url, [string]$Destination) {
  Write-Host "Descargando $Url" -ForegroundColor Cyan
  Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $Destination
}

Assert-Administrator
New-Item -ItemType Directory -Force -Path $BuilderRoot | Out-Null

$drive = Get-PSDrive -Name ([IO.Path]::GetPathRoot($BuilderRoot).TrimEnd(':','\'))
if ($drive.Free -lt 30GB) {
  Write-Warning "Hay menos de 30 GB libres en $($drive.Name):. Para Android + NDK + cachés se recomiendan al menos 30 GB."
}

# JDK 17: necesario para sdkmanager y Gradle.
$javaRoot = Join-Path $BuilderRoot 'java'
$jdkDir = Join-Path $javaRoot 'jdk17'
if (-not (Test-Path (Join-Path $jdkDir 'bin\java.exe'))) {
  New-Item -ItemType Directory -Force -Path $javaRoot | Out-Null
  $jdkZip = Join-Path $BuilderRoot 'jdk17.zip'
  Download-File 'https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse' $jdkZip
  $extract = Join-Path $BuilderRoot 'jdk17-extract'
  Remove-Item -Recurse -Force $extract -ErrorAction SilentlyContinue
  Expand-Archive -Path $jdkZip -DestinationPath $extract -Force
  $source = Get-ChildItem -Directory $extract | Select-Object -First 1
  if (-not $source) { throw 'No se pudo extraer JDK 17.' }
  Remove-Item -Recurse -Force $jdkDir -ErrorAction SilentlyContinue
  Move-Item $source.FullName $jdkDir
}
[Environment]::SetEnvironmentVariable('JAVA_HOME', $jdkDir, 'Machine')
$env:JAVA_HOME = $jdkDir
Add-MachinePath (Join-Path $jdkDir 'bin')
& (Join-Path $jdkDir 'bin\java.exe') -version

# Android SDK. Mantenerlo fuera del workspace evita reinstalarlo en cada build.
$androidRoot = Join-Path $BuilderRoot 'android-sdk'
$cmdTools = Join-Path $androidRoot 'cmdline-tools\latest'
$sdkManager = Join-Path $cmdTools 'bin\sdkmanager.bat'
if (-not (Test-Path $sdkManager)) {
  $androidZip = Join-Path $BuilderRoot 'android-commandline-tools.zip'
  Download-File 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip' $androidZip
  $androidExtract = Join-Path $BuilderRoot 'android-tools-extract'
  Remove-Item -Recurse -Force $androidExtract -ErrorAction SilentlyContinue
  Expand-Archive -Path $androidZip -DestinationPath $androidExtract -Force
  New-Item -ItemType Directory -Force -Path $cmdTools | Out-Null
  Copy-Item -Recurse -Force (Join-Path $androidExtract 'cmdline-tools\*') $cmdTools
}
[Environment]::SetEnvironmentVariable('ANDROID_HOME', $androidRoot, 'Machine')
[Environment]::SetEnvironmentVariable('ANDROID_SDK_ROOT', $androidRoot, 'Machine')
$env:ANDROID_HOME = $androidRoot
$env:ANDROID_SDK_ROOT = $androidRoot
Add-MachinePath (Join-Path $androidRoot 'platform-tools')
Add-MachinePath (Join-Path $cmdTools 'bin')

Write-Host 'Aceptando licencias Android…' -ForegroundColor Cyan
$yes = 1..60 | ForEach-Object { 'y' }
$yes | & $sdkManager --sdk_root=$androidRoot --licenses | Out-Null
& $sdkManager --sdk_root=$androidRoot 'platform-tools' 'platforms;android-36' 'build-tools;36.0.0' 'ndk;27.1.12297006' 'cmake;3.22.1'

# GitHub CLI para publicar APK como Release sin usar artifact storage.
$ghRoot = Join-Path $BuilderRoot 'gh'
$ghExe = Get-ChildItem -Path $ghRoot -Filter gh.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $ghExe) {
  New-Item -ItemType Directory -Force -Path $ghRoot | Out-Null
  $ghRelease = Invoke-RestMethod -Headers @{ 'User-Agent' = 'AfterBuilderBootstrap' } -Uri 'https://api.github.com/repos/cli/cli/releases/latest'
  $ghAsset = $ghRelease.assets | Where-Object { $_.name -match 'windows_amd64\.zip$' } | Select-Object -First 1
  if (-not $ghAsset) { throw 'No se encontró GitHub CLI para Windows x64.' }
  $ghZip = Join-Path $BuilderRoot $ghAsset.name
  Download-File $ghAsset.browser_download_url $ghZip
  Expand-Archive -Path $ghZip -DestinationPath $ghRoot -Force
  $ghExe = Get-ChildItem -Path $ghRoot -Filter gh.exe -Recurse | Select-Object -First 1
}
Add-MachinePath $ghExe.Directory.FullName

# Runner de GitHub. El token de registro es efímero y no se guarda en el repositorio.
if (-not $RunnerToken) {
  $secure = Read-Host 'Pega el token temporal de GitHub para registrar el runner' -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $RunnerToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
if (-not $RunnerToken) { throw 'Falta RunnerToken.' }

$runnerRoot = Join-Path $BuilderRoot 'actions-runner'
$configCmd = Join-Path $runnerRoot 'config.cmd'
if (-not (Test-Path $configCmd)) {
  New-Item -ItemType Directory -Force -Path $runnerRoot | Out-Null
  $runnerRelease = Invoke-RestMethod -Headers @{ 'User-Agent' = 'AfterBuilderBootstrap' } -Uri 'https://api.github.com/repos/actions/runner/releases/latest'
  $runnerAsset = $runnerRelease.assets | Where-Object { $_.name -match 'actions-runner-win-x64-.*\.zip$' } | Select-Object -First 1
  if (-not $runnerAsset) { throw 'No se encontró GitHub Actions Runner para Windows x64.' }
  $runnerZip = Join-Path $BuilderRoot $runnerAsset.name
  Download-File $runnerAsset.browser_download_url $runnerZip
  Expand-Archive -Path $runnerZip -DestinationPath $runnerRoot -Force
}

Push-Location $runnerRoot
try {
  & .\config.cmd remove --unattended --token $RunnerToken 2>$null | Out-Null
} catch {
  # Es normal en la primera instalación.
}

& .\config.cmd --unattended --replace --url $RepoUrl --token $RunnerToken --name $RunnerName --labels 'after-builder,android,windows-server-2022' --work '_work' --runasservice
if (Test-Path '.\svc.cmd') {
  & .\svc.cmd start
}
Pop-Location

Write-Host ''
Write-Host 'After Builder listo.' -ForegroundColor Green
Write-Host "Runner: $RunnerName"
Write-Host "ANDROID_HOME: $androidRoot"
Write-Host 'Etiquetas: self-hosted, Windows, X64, after-builder'
Write-Host 'Siguiente paso: en GitHub ejecuta el workflow "Android Beta APK - Self Hosted".' -ForegroundColor Yellow
