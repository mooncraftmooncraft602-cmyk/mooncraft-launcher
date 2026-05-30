# MoonCraft modpack publisher.
#
# Walks a source folder, hashes every file (SHA-256), and produces a
# manifest.json that the launcher consumes at startup.
#
# Usage:
#   .\tools\publish.ps1 -Source "C:\path\to\modpack" `
#                       -BaseUrl "https://github.com/<org>/<repo>/releases/download/v1.0.0" `
#                       -Version "1.0.0" `
#                       -Minecraft "1.21.1" `
#                       -Fabric "0.16.5" `
#                       -Java 21 `
#                       -Changelog "Initial release" `
#                       -Out ".\dist"
#
# Result:
#   <Out>\manifest.json       ← upload to your CDN / GitHub Release
#   <Out>\<file>              ← every modpack file, ready to upload alongside
#
# After upload, the manifest.json URL must match the launcher's MANIFEST_URL.

[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)] [string]$Source,
  [Parameter(Mandatory=$true)] [string]$BaseUrl,
  [Parameter(Mandatory=$true)] [string]$Version,
  [Parameter(Mandatory=$true)] [string]$Minecraft,
  [Parameter(Mandatory=$true)] [string]$Fabric,
  [int]$Java = 21,
  [string]$Changelog = "",
  [string]$Out = ".\dist",
  [string[]]$ExcludeDirs = @("saves", "logs", "crash-reports", "screenshots", ".cache", "versions", "libraries", "assets")
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $Source)) { throw "Source folder not found: $Source" }
$Source = (Resolve-Path $Source).Path
$BaseUrl = $BaseUrl.TrimEnd('/')

# Prepare output dir
New-Item -ItemType Directory -Path $Out -Force | Out-Null
$Out = (Resolve-Path $Out).Path

Write-Host "Scanning $Source ..." -ForegroundColor Cyan

$files = Get-ChildItem -Path $Source -Recurse -File | Where-Object {
  $rel = $_.FullName.Substring($Source.Length + 1) -replace '\\', '/'
  $top = ($rel -split '/')[0]
  -not ($ExcludeDirs -contains $top)
}

Write-Host "Found $($files.Count) files. Hashing..." -ForegroundColor Cyan

$entries = foreach ($f in $files) {
  $rel = $f.FullName.Substring($Source.Length + 1) -replace '\\', '/'
  $hash = (Get-FileHash -Algorithm SHA256 -Path $f.FullName).Hash.ToLower()
  # Copy file into output mirror so you can upload the whole `dist` folder.
  $destFile = Join-Path $Out $rel
  $destDir = Split-Path $destFile -Parent
  if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
  Copy-Item -LiteralPath $f.FullName -Destination $destFile -Force

  [pscustomobject]@{
    path   = $rel
    url    = "${BaseUrl}/${rel}"
    sha256 = $hash
    size   = $f.Length
  }
}

$manifest = [ordered]@{
  version   = $Version
  minecraft = $Minecraft
  fabric    = $Fabric
  java      = $Java
  changelog = $Changelog
  files     = @($entries)
}

$json = $manifest | ConvertTo-Json -Depth 10
$manifestPath = Join-Path $Out "manifest.json"
[IO.File]::WriteAllText($manifestPath, $json, [Text.UTF8Encoding]::new($false))

$totalMb = [Math]::Round(($entries | Measure-Object -Sum size).Sum / 1MB, 2)
Write-Host ""
Write-Host "✓ Manifest written: $manifestPath" -ForegroundColor Green
Write-Host "  $($entries.Count) files, $totalMb MB total" -ForegroundColor Green
Write-Host ""
Write-Host "Next: upload everything in ${Out} to:" -ForegroundColor Yellow
Write-Host "    ${BaseUrl}/"
Write-Host ""
Write-Host 'If you are using GitHub Releases:'
Write-Host ('    .\tools\push-release.ps1 -Repo OWNER/REPO -Version ' + $Version)
