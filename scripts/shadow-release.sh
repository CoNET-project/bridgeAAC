#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p artifacts
. "$HOME/.cargo/env"
target="${AAC_TARGET:-x86_64-unknown-linux-gnu}"
cargo build --release --locked --offline --target "$target"
bin="${CARGO_TARGET_DIR:-target}/${target}/release/bridge-aac"
format="$(file -b "$bin")"
case "$format" in
  *ELF*) ;;
  *)
    echo "release refused: expected a Linux ELF artifact for ${target}, got ${format}" >&2
    exit 2
    ;;
esac
sha="$(shasum -a 256 "$bin" | awk '{print $1}')"
{
  echo "name bridge-aac"
  echo "version $(awk -F '\"' '/^version/{print $2; exit}' Cargo.toml)"
  echo "sha256 $sha"
  echo "target $target"
  echo "format $format"
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
