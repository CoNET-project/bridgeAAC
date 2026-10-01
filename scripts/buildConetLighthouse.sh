#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_DIR="${LIGHTHOUSE_BUILD_DIR:-${TMPDIR:-/tmp}/lighthouse-conet-build}"
REPO_URL="${LIGHTHOUSE_REPO_URL:-https://github.com/sigp/lighthouse.git}"
COMMIT="${LIGHTHOUSE_COMMIT:-d6ba8c397557f5c977b70f0d822a9228e98ca214}"
PATCH_FILE="$ROOT_DIR/vendor/lighthouse-conet/patches/0001-conet-eth1-voting-period.patch"
OUTPUT_DIR="${LIGHTHOUSE_OUTPUT_DIR:-$ROOT_DIR/target/conet-lighthouse}"

if ! command -v git >/dev/null 2>&1; then
  echo "git is required" >&2
  exit 1
fi
if ! command -v cargo >/dev/null 2>&1; then
  echo "cargo is required" >&2
  exit 1
fi

rm -rf "$WORK_DIR"
git clone --filter=blob:none "$REPO_URL" "$WORK_DIR"
git -C "$WORK_DIR" checkout --detach "$COMMIT"
git -C "$WORK_DIR" apply --check "$PATCH_FILE"
git -C "$WORK_DIR" apply "$PATCH_FILE"

# Lighthouse v5.3.0 still vendors a LevelDB Snappy build with a pre-3.5
# CMake minimum; modern CMake requires this compatibility policy explicitly.
export CMAKE_POLICY_VERSION_MINIMUM="${CMAKE_POLICY_VERSION_MINIMUM:-3.5}"
cargo build --manifest-path "$WORK_DIR/lighthouse/Cargo.toml" --release --bin lighthouse

mkdir -p "$OUTPUT_DIR"
cp "$WORK_DIR/target/release/lighthouse" "$OUTPUT_DIR/lighthouse"
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$OUTPUT_DIR/lighthouse" | tee "$OUTPUT_DIR/lighthouse.sha256"
else
  shasum -a 256 "$OUTPUT_DIR/lighthouse" | tee "$OUTPUT_DIR/lighthouse.sha256"
fi
printf 'source_commit=%s\npatch=%s\n' "$COMMIT" \
  "0001-conet-eth1-voting-period.patch" > "$OUTPUT_DIR/build-info.txt"

echo "Built CoNET Lighthouse at $OUTPUT_DIR/lighthouse"
