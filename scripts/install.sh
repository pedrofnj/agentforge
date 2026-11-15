#!/usr/bin/env sh
# AgentForge installer from a repository checkout (Linux and macOS).
#
#   ./scripts/install.sh                      # interactive wizard
#   ./scripts/install.sh --provider claude --scope project --all --yes
#
# Checks Node.js (22+) and npm, installs the build dependencies of this checkout
# (npm ci), builds the CLI and starts "agentforge install" in the directory you
# ran the script from. Arguments are passed to "agentforge install".
#
# It never uses sudo, never downloads or runs remote scripts, and changes nothing
# outside this checkout except what the installer itself shows and you confirm.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
MIN_NODE=22

say() { printf '%s\n' "$*"; }
fail() {
  printf 'agentforge install: %s\n' "$*" >&2
  exit 1
}

case "${1:-}" in
  -h | --help)
    say 'Usage: scripts/install.sh [agentforge install options]'
    say ''
    say 'Builds this checkout and runs "agentforge install" in the current directory.'
    say 'Without options on a terminal, the interactive wizard starts.'
    say 'Example: scripts/install.sh --provider claude --scope project --all --yes'
    exit 0
    ;;
esac

if [ "$(id -u 2>/dev/null || echo 1)" = "0" ]; then
  say 'Warning: running as root. AgentForge only needs your normal user account.' >&2
fi

[ -f "$ROOT/package.json" ] && [ -f "$ROOT/src/cli/bin.ts" ] ||
  fail "run this script from an AgentForge checkout (not found: $ROOT/package.json)"

command -v node >/dev/null 2>&1 || fail "Node.js $MIN_NODE or newer is required: https://nodejs.org"
command -v npm >/dev/null 2>&1 || fail 'npm is required (it ships with Node.js)'

NODE_VERSION=$(node -p 'process.versions.node')
NODE_MAJOR=${NODE_VERSION%%.*}
[ "$NODE_MAJOR" -ge "$MIN_NODE" ] 2>/dev/null ||
  fail "Node.js $MIN_NODE or newer is required (found $NODE_VERSION)"

say "Node.js $NODE_VERSION, npm $(npm --version)"
say "Installing build dependencies in $ROOT (npm ci)..."
npm --prefix "$ROOT" ci --ignore-scripts --no-audit --no-fund ||
  fail 'npm ci failed; nothing was installed'
say 'Building the CLI (npm run build)...'
npm --prefix "$ROOT" run build --silent || fail 'build failed; nothing was installed'

say ''
set +e
node "$ROOT/dist/cli/bin.js" install "$@"
code=$?
set -e
exit "$code"
