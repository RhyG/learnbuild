#!/bin/sh
# Installs LearnBuild from this folder: dependencies, build, and the
# `learnbuild` command. Safe to run again after updating the folder.
set -eu

cd "$(dirname "$0")"

say() { printf '%s\n' "$*"; }
stop() { say ""; say "Setup stopped: $*" >&2; exit 1; }

if ! command -v node >/dev/null 2>&1; then
  stop "Node.js is not installed. Get version 22 or newer from https://nodejs.org, then run this script again."
fi
node_major=$(node -p 'process.versions.node.split(".")[0]')
if [ "$node_major" -lt 22 ]; then
  stop "LearnBuild needs Node.js version 22 or newer and this computer has $(node --version). Get a newer one from https://nodejs.org, then run this script again."
fi
if ! command -v npm >/dev/null 2>&1; then
  stop "npm was not found. It comes with Node.js, so reinstalling Node.js from https://nodejs.org should fix this."
fi

log=$(mktemp)
trap 'rm -f "$log"' EXIT

step() {
  label=$1
  shift
  say "$label"
  if ! "$@" >"$log" 2>&1; then
    cat "$log" >&2
    return 1
  fi
}

step "1 of 3  Downloading what LearnBuild depends on..." npm ci --no-audit --no-fund \
  || stop "the download failed. The output above says why. Check your internet connection and run this script again."
step "2 of 3  Building LearnBuild..." npm run build \
  || stop "the build failed. The output above says why."
step "3 of 3  Adding the learnbuild command..." npm link --no-audit --no-fund \
  || stop "the learnbuild command could not be added. If the output above mentions permissions (EACCES), see https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally"

bin_dir="$(npm prefix -g)/bin"
say ""
found=$(command -v learnbuild 2>/dev/null || true)
if [ -n "$found" ] && [ "$found" -ef "$bin_dir/learnbuild" ]; then
  say "LearnBuild is installed."
elif [ -n "$found" ]; then
  say "LearnBuild is installed in $bin_dir, but your terminal finds a different copy first:"
  say "    $found"
  say "Remove that copy, or put $bin_dir earlier on your PATH, so the new one is used."
else
  say "LearnBuild is installed, but your terminal cannot find the learnbuild command yet."
  say "It is in $bin_dir, which is not on your PATH. Add this line to your shell's start-up file"
  say "(~/.zshrc on a Mac), then open a new terminal window:"
  say ""
  say "    export PATH=\"$bin_dir:\$PATH\""
fi
if ! command -v claude >/dev/null 2>&1; then
  say ""
  say "Claude Code is not installed yet. LearnBuild works inside it, so set it up before"
  say "starting a project: https://code.claude.com/docs/en/setup"
fi
say ""
say "To start your first project, go to the folder where you keep your projects and run:"
say ""
say "    learnbuild new"
