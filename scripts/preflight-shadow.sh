#!/bin/sh
# Refuse to install a shadow build that is not a clean, tagged commit.
set -eu
cd "$(dirname "$0")/.."
version="$(awk -F '"' '/^version/{print $2; exit}' Cargo.toml)"
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "preflight refused: bridgeAAC is not inside a git work tree"
    exit 2
fi
dirty="$(git status --porcelain -- .)"
if [ -n "$dirty" ]; then
    echo "preflight refused: bridgeAAC worktree is dirty"
    exit 2
fi
if ! git tag --list "bridge-aac-v${version}" | grep -q .; then
    echo "preflight refused: missing tag bridge-aac-v${version}"
    exit 2
fi
echo "preflight accepted bridge-aac-v${version}"
