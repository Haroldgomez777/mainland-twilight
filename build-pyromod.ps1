#Requires -Version 5.1
<#
  Build a distributable .pyromod using Pyrogenesis archive mode.
  See: https://gitea.wildfiregames.com/0ad/0ad/wiki/Modding_Guide#distributing-your-mods

  Run from PowerShell (game must be installed):
    .\build-pyromod.ps1 -GameRoot "C:\Path\To\0 A.D. alpha"

  Or set environment variable for your session:
    $env:ZERO_AD_ROOT = "C:\Path\To\0 A.D. alpha"
    .\build-pyromod.ps1

  Output: .\dist\mainland-twilight-<version>.pyromod (version read from mod.json)

  Notes:
  - Working directory must be the game root when invoking pyrogenesis (script does Set-Location).
  - -archivebuild points at this mod folder (may be under Documents\My Games\0ad\mods\).
  - Only -mod=mod and -mod=public are passed as base layers; do not add -mod=mainland-twilight
    unless that folder also exists under binaries\data\mods\ in the install.
  - Do NOT pass -archivebuild-compress for mod.io releases: Pyrogenesis defaults to ZIP store
    (matches verified mods on mod.io). Deflate is only for smaller manual downloads.
  - In-game mod.io downloads also require Wildfire Games to attach metadata_blob + minisig on
    the mod.io modfile entry (see readme.md "mod.io downloads").
  - Dev-only files are stripped from the output archive after build: *.ps1, dist/, *.zip, *.pyromod.
#>
[CmdletBinding()]
param(
	[string] $GameRoot = $env:ZERO_AD_ROOT,
	[string] $ModRoot,
	[string] $OutputPath
)

$ErrorActionPreference = "Stop"

if (-not $ModRoot) {
	if ($PSScriptRoot) { $ModRoot = $PSScriptRoot }
	elseif ($PSCommandPath) { $ModRoot = Split-Path -Parent $PSCommandPath }
	elseif ($MyInvocation.MyCommand.Path) { $ModRoot = Split-Path -Parent $MyInvocation.MyCommand.Path }
	else { throw "Could not resolve mod folder; pass -ModRoot or run: powershell -File .\build-pyromod.ps1" }
}

$modJsonPath = Join-Path $ModRoot "mod.json"
if (-not (Test-Path $modJsonPath)) { throw "mod.json not found at $modJsonPath" }
$modMeta = Get-Content $modJsonPath -Raw | ConvertFrom-Json
$modName = $modMeta.name
if ($modName -ne "mainland-twilight") { Write-Warning "mod.json name is '$modName'; output name still uses mainland-twilight prefix." }

$version = $modMeta.version
if (-not $version) { throw "mod.json missing version" }

if (-not $OutputPath) {
	$dist = Join-Path $ModRoot "dist"
	if (-not (Test-Path $dist)) { New-Item -ItemType Directory -Path $dist | Out-Null }
	$OutputPath = Join-Path $dist "mainland-twilight-$version.pyromod"
}

$candidates = @()
if ($GameRoot) { $candidates += $GameRoot }
$candidates += @(
	"F:\0 A.D. Empires Ascendant",
	"${env:ProgramFiles}\0 A.D. alpha",
	"${env:ProgramFiles(x86)}\0 A.D. alpha",
	"$env:LOCALAPPDATA\Programs\0 A.D. alpha"
)

$root = $null
foreach ($c in $candidates) {
	if (-not $c) { continue }
	$exe = Join-Path $c "binaries\system\pyrogenesis.exe"
	if (Test-Path $exe) { $root = $c; break }
}

if (-not $root) {
	throw @"
Could not find binaries\system\pyrogenesis.exe.
Pass -GameRoot '...path to 0 A.D. install (folder containing binaries)...'
or set `$env:ZERO_AD_ROOT` to that path.
"@
}

$pyro = Join-Path $root "binaries\system\pyrogenesis.exe"
$modRootAbs = (Resolve-Path $ModRoot).Path
if ([System.IO.Path]::IsPathRooted($OutputPath)) {
	$outAbs = [System.IO.Path]::GetFullPath($OutputPath)
} else {
	$outAbs = [System.IO.Path]::GetFullPath((Join-Path $ModRoot $OutputPath))
}
$outDir = Split-Path -Parent $outAbs
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

# Pyrogenesis mishandles -archivebuild-output paths with spaces; build beside the exe, then move.
$buildOut = Join-Path $root "binaries\system\mainland-twilight-$version.pyromod"

Write-Host "Game root:    $root"
Write-Host "Mod folder:   $modRootAbs"
Write-Host "Build file:   $buildOut"
Write-Host "Output file:  $outAbs"
Write-Host "Running archive build..."

Remove-Item -LiteralPath $buildOut -Force -ErrorAction SilentlyContinue

Push-Location (Join-Path $root "binaries\system")
try {
	& $pyro `
		-mod=mod `
		-mod=public `
		-archivebuild="$modRootAbs" `
		-archivebuild-output="$buildOut"
}
finally {
	Pop-Location
}

$deadline = (Get-Date).AddSeconds(60)
while (-not (Test-Path -LiteralPath $buildOut) -and (Get-Date) -lt $deadline) {
	Start-Sleep -Milliseconds 250
}

if (-not (Test-Path -LiteralPath $buildOut)) {
	if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) {
		throw "pyrogenesis exited with code $LASTEXITCODE and did not create the output file"
	}
	throw "Expected output missing: $buildOut"
}

function Remove-ExcludedPyromodEntries {
	param([string] $ArchivePath)
	Add-Type -AssemblyName System.IO.Compression.FileSystem
	$zip = [System.IO.Compression.ZipFile]::Open($ArchivePath, 'Update')
	try {
		$toRemove = @($zip.Entries | Where-Object {
			$name = ($_.FullName -replace '\\', '/').TrimStart('/')
			$name -match '(^|/)[^/]+\.ps1$' -or
			$name -match '^dist/' -or
			$name -match '(^|/)[^/]+\.zip$' -or
			$name -match '(^|/)[^/]+\.pyromod$'
		})
		foreach ($entry in $toRemove) {
			Write-Host "  strip: $($entry.FullName)"
			$entry.Delete()
		}
		return $toRemove.Count
	}
	finally {
		$zip.Dispose()
	}
}

$stripped = Remove-ExcludedPyromodEntries -ArchivePath $buildOut
if ($stripped -gt 0) {
	Write-Host "Removed $stripped dev-only entries from package."
}

Copy-Item -LiteralPath $buildOut -Destination $outAbs -Force
Remove-Item -LiteralPath $buildOut -Force -ErrorAction SilentlyContinue

if (-not (Test-Path $outAbs)) { throw "Expected output missing: $outAbs" }
$item = Get-Item $outAbs
Write-Host "OK: $($item.FullName) ($([math]::Round($item.Length/1MB, 2)) MB)"
