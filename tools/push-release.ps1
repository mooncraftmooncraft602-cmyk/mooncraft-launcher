# Convenience wrapper around `gh release create` for the modpack.
#
# Prereqs:
#   1. GitHub CLI installed:    winget install GitHub.cli
#   2. Authenticated:           gh auth login
#   3. You ran .\tools\publish.ps1 to produce .\dist
#
# Usage:
#   .\tools\push-release.ps1 -Repo "myorg/mooncraft-client" -Version "1.0.0"

[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)] [string]$Repo,
  [Parameter(Mandatory=$true)] [string]$Version,
  [string]$Dist = ".\dist",
  [string]$Notes = ""
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw "GitHub CLI not found. Install with: winget install GitHub.cli"
}
if (-not (Test-Path "$Dist\manifest.json")) {
  throw "$Dist\manifest.json not found. Run .\tools\publish.ps1 first."
}

$tag = "v$Version"

# Collect every file under dist (manifest + mirrored modpack files).
$assets = Get-ChildItem -Path $Dist -Recurse -File | ForEach-Object { $_.FullName }

Write-Host "Creating release $tag on $Repo with $($assets.Count) assets..." -ForegroundColor Cyan

if (-not $Notes) {
  $Notes = "MoonCraft $Version"
}

# `gh release create` accepts asset paths as positional args.
& gh release create $tag --repo $Repo --title "MoonCraft $Version" --notes $Notes @assets

Write-Host "" -ForegroundColor Green
Write-Host "✓ Release published. Asset URLs follow this pattern:" -ForegroundColor Green
Write-Host "    https://github.com/${Repo}/releases/download/${tag}/" -ForegroundColor Green
Write-Host ""
Write-Host "Your manifest is at:"
Write-Host "    https://github.com/${Repo}/releases/download/${tag}/manifest.json"
Write-Host ""
Write-Host "Or use the always-latest URL (recommended for the launcher):"
Write-Host "    https://github.com/${Repo}/releases/latest/download/manifest.json"
