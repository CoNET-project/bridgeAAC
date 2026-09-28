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
if ! git rev-parse --verify --quiet "refs/tags/bridge-aac-v${version}" >/dev/null; then
    echo "preflight refused: missing tag bridge-aac-v${version}"
    exit 2
fi
head_commit="$(git rev-parse HEAD)"
tagged_commit="$(git rev-parse "bridge-aac-v${version}^{}")"
if [ "$head_commit" != "$tagged_commit" ]; then
    echo "preflight refused: bridge-aac-v${version} does not point at HEAD"
    exit 2
fi
remote="$(git ls-remote origin "refs/tags/bridge-aac-v${version}" "refs/tags/bridge-aac-v${version}^{}")"
remote_commit="$(printf '%s\n' "$remote" | awk '/\^\{\}$/ { print $1; exit }')"
if [ -z "$remote_commit" ]; then
    remote_commit="$(printf '%s\n' "$remote" | awk -v tag="refs/tags/bridge-aac-v${version}" '$2 == tag { print $1; exit }')"
fi
if [ "$remote_commit" != "$head_commit" ]; then
    echo "preflight refused: bridge-aac-v${version} is not published at HEAD"
    exit 2
fi
echo "preflight accepted bridge-aac-v${version}"
