<#
.SYNOPSIS
  AgentForge installer from a repository checkout (Windows PowerShell 5.1 and PowerShell 7).

.DESCRIPTION
  Checks Node.js (22+) and npm, installs the build dependencies of this checkout
  (npm ci), builds the CLI and starts "agentforge install" in the current
  directory. Arguments are passed to "agentforge install".

  It never asks for administrator rights, never changes the execution policy and
  never downloads or runs remote scripts. If your policy blocks local scripts,
  run it for this process only:

    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install.ps1

.EXAMPLE
  .\scripts\install.ps1

.EXAMPLE
  .\scripts\install.ps1 --provider claude --scope project --all --yes
#>
$ErrorActionPreference = 'Stop'
$MinNode = 22
$Root = Split-Path -Parent $PSScriptRoot

function Fail([string]$Message) {
  [Console]::Error.WriteLine("agentforge install: $Message")
  exit 1
}

if ($args.Count -gt 0 -and ($args[0] -eq '-h' -or $args[0] -eq '--help')) {
  Write-Output 'Usage: scripts\install.ps1 [agentforge install options]'
  Write-Output ''
  Write-Output 'Builds this checkout and runs "agentforge install" in the current directory.'
  Write-Output 'Without options on a terminal, the interactive wizard starts.'
  Write-Output 'Example: scripts\install.ps1 --provider claude --scope project --all --yes'
  exit 0
}

if (-not (Test-Path -LiteralPath (Join-Path $Root 'package.json')) -or
    -not (Test-Path -LiteralPath (Join-Path $Root 'src\cli\bin.ts'))) {
  Fail "run this script from an AgentForge checkout (not found: $Root\package.json)"
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Fail "Node.js $MinNode or newer is required: https://nodejs.org" }
$npm = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npm) { Fail 'npm is required (it ships with Node.js)' }

$nodeVersion = (& node -p 'process.versions.node').Trim()
$nodeMajor = [int]($nodeVersion.Split('.')[0])
if ($nodeMajor -lt $MinNode) { Fail "Node.js $MinNode or newer is required (found $nodeVersion)" }

$npmVersion = (& npm --version).Trim()
Write-Output "Node.js $nodeVersion, npm $npmVersion"
Write-Output "Installing build dependencies in $Root (npm ci)..."
& npm --prefix "$Root" ci --ignore-scripts --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Fail 'npm ci failed; nothing was installed' }
Write-Output 'Building the CLI (npm run build)...'
& npm --prefix "$Root" run build --silent
if ($LASTEXITCODE -ne 0) { Fail 'build failed; nothing was installed' }

Write-Output ''
& node (Join-Path $Root 'dist\cli\bin.js') install @args
exit $LASTEXITCODE
