#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p artifacts
. "$HOME/.cargo/env"
cargo build --release --locked --offline
bin="${CARGO_TARGET_DIR:-target}/release/bridge-aac"
sha="$(shasum -a 256 "$bin" | awk '{print $1}')"
{
  echo "name bridge-aac"
  echo "version $(awk -F '\"' '/^version/{print $2; exit}' Cargo.toml)"
  echo "sha256 $sha"
  rustc --version
  rustc -vV | awk '/^host:/{print}'
  echo "profile release"
  echo "locked yes"
  echo "shadow read-only"
  echo "custody closed"
  if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "git $(git rev-parse HEAD)"
    echo "git-dirty $(git status --porcelain -- . | wc -l | tr -d ' ')"
  fi
} | tee artifacts/shadow-release.txt
