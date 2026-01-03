Param(
  [string]$InstallDir = "$(Join-Path $PSScriptRoot '..\.tools\maestro')"
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$installDirFull = (Resolve-Path -LiteralPath $InstallDir -ErrorAction SilentlyContinue)
if (-not $installDirFull) {
  New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
  $installDirFull = (Resolve-Path -LiteralPath $InstallDir)
}

$zipPath = Join-Path $installDirFull 'maestro.zip'
$downloadUrl = 'https://github.com/mobile-dev-inc/maestro/releases/latest/download/maestro.zip'

Write-Output "Downloading Maestro..."
curl.exe -L -o $zipPath $downloadUrl

Write-Output "Extracting Maestro to $installDirFull ..."
Expand-Archive -Force -Path $zipPath -DestinationPath $installDirFull

# The zip contains a 'maestro' folder with bin/lib.
$binDir = Join-Path $installDirFull 'maestro\bin'
if (-not (Test-Path -LiteralPath $binDir)) {
  throw "Maestro bin folder not found at: $binDir"
}

$env:Path = $env:Path + ";$binDir"

Write-Output "Maestro installed. Version:"
maestro --version

Write-Output ""
Write-Output "For future terminals, add Maestro to your user PATH (example):"
Write-Output ('  setx PATH "%PATH%;' + $binDir + '"')
