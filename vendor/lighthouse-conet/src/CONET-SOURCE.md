# CoNET Lighthouse source snapshot

This directory is a vendored source snapshot of
[sigp/lighthouse](https://github.com/sigp/lighthouse.git).

- Release line: `v5.3.0`
- Pinned upstream commit:
  `d6ba8c397557f5c977b70f0d822a9228e98ca214`
- Archive SHA-256:
  `6cc10c3f664d586bab0fe8bffbbb065f6c7ef1265aad457d20b0c3d515a9963d`

The source is distributed here so an independent CoNET operator can build
the client without depending on a live checkout of the upstream repository.
The CoNET consensus-constant change is intentionally **not** applied directly
to this snapshot. `scripts/buildConetLighthouse.sh` copies this tree to a
temporary build directory and applies the checked-in patch from
`vendor/lighthouse-conet/patches/`.

When changing the upstream version:

1. Replace this snapshot with the exact upstream commit.
2. Update `SOURCE_COMMIT` and this file's archive checksum.
3. Update or replace the CoNET patch and verify it applies cleanly.
4. Record the resulting binary checksum in `vendor/lighthouse-conet/README.md`
   and rebuild before deployment.

Do not place runtime secrets, JWT files, beacon databases, execution-layer
databases, or release binaries in this source directory.
