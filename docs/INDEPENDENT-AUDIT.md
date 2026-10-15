# Independent audit — how to complete and publish to GitHub

**Status:** **PROCESS DRAFT** — audit itself remains **PENDING**.  
**Date:** 2026-10-15  
**Repo:** [CoNET-project/bridgeAAC](https://github.com/CoNET-project/bridgeAAC)  
**Does not:** open custody, grant Treasury / GB / Peer roles, unpause canaries,
execute Cutover Phases B–D, or invent third-party sign-off.

This document is the runbook for finishing the **independent third-party
security audit** that blocks production cutover after Obstacles 1–5 Accepted
and engineering assurance PASS. When the auditor Accepts in writing, the
acceptance artifact is published **on GitHub in this repository** (and mirrored
from GitBook pointers). Until then, keep the ASSURANCE / CUTOVER rows at
**PENDING**.

Related:

- [PRODUCTION-CUSTODY-GATES.md](PRODUCTION-CUSTODY-GATES.md) — Obstacles 1–5 Accepted
- [PRODUCTION-ASSURANCE.md](PRODUCTION-ASSURANCE.md) — tests + fail-closed smoke PASS; §4 checklist
- [CUTOVER-CUSTODY.md](CUTOVER-CUSTODY.md) — Phase A recorded; B–D blocked on this audit
- [THIRD-PARTY-ACCEPTANCE.md](THIRD-PARTY-ACCEPTANCE.md) — Shadow / confirmer acceptance (different track)

---

## 1. Goal

Obtain **written Accepted** from an independent auditor that Obstacles 1–5 and
the fail-closed production proxy match the published evidence, so Cutover
Phase B *may* be proposed for a later, separately authorized task.

| Outcome | Meaning |
| --- | --- |
| **Accepted** | Auditor issues a written acceptance (report or letter) covering §3 scope; we attach it on GitHub and flip ASSURANCE §4 / CUTOVER hard-stop to Accepted. |
| **Findings** | Auditor reports defects; cutover stays frozen; gates docs re-open; no role grants. |
| **Not Passed** | Anything short of written acceptance — including engineering smoke alone. |

**107 local tests ≠ independent audit.** Phase A preflight ≠ audit Passed.

---

## 2. Who may accept

| Role | Requirement |
| --- | --- |
| **Auditor** | Third party relative to CoNET / Beamio operators who authored Obstacles 1–5. Not the same person who signed the gate Accepted commits as sole reviewer. |
| **Engagement** | Named firm or individual; SOW cites this runbook + ASSURANCE §4. |
| **Acceptance form** | Signed PDF / HTML report **or** signed letter on letterhead that lists scope items §3 as Accepted / Not Accepted / N/A with rationale. |
| **Forbidden** | Marking Passed from chat logs, internal self-review alone, or “looks good” without an attachable artifact. |

Optional: publish a redacted public summary + full report under NDA. GitHub must
still hold at least: auditor identity, date, scope hash, verdict, and a
content-addressable link or blob hash of the acceptance artifact.

---

## 3. Audit scope (minimum)

Mirror [PRODUCTION-ASSURANCE.md](PRODUCTION-ASSURANCE.md) §4. Auditor must
confirm at least:

1. **Gate evidence integrity** — Obstacles 1–5 in `PRODUCTION-CUSTODY-GATES.md`
   match live Base addresses, explorer / Sourcify verification, and cited repo
   commits (including settler / Obstacle 5 at `83bb39b` lineage).
2. **Fail-closed settler** — proxy `0x9051e08aBA3EC1A1323f36f0F5c3745C81912aAd`:
   `custodyOpen` / `headerFinal` false; `settle()` reverts `CustodyClosed`
   (`0x61839255`); COVER / CONET_FINALITY bindings not swappable by non-owner.
3. **Consume-once** — second consume, reentrancy, failed effect, and layout
   rejection as documented; consumer has **no** Treasury / GB mint authority.
4. **Finality adapters** — Base cover and CoNET finality views do not imply
   `trusted-committee yes` or open mint; Shadow / observer remain
   non-authoritative for custody.
5. **Cutover blast radius** — proposed grants in `CUTOVER-CUSTODY.md` target
   **only** the AAC proxy (never miner EOAs as minters); miner-vote disable is
   sequenced **after** AAC canary, not before.
6. **No silent unpause** — historical canaries stay paused; unpause out of
   scope for the current cutover proposal.

Out of scope for this audit gate (unless SOW explicitly adds them):

- Authorizing Phase B role grants (needs a **separate** owner message).
- Canary mint / release amounts.
- Disabling miner `voteBridgeOperation` / `voteBridgeMint`.
- Restarting EL / CL / validator infrastructure.
- Full formal verification of every M4 proof package (use existing M4
  acceptance docs if SOW expands).

---

## 4. Evidence pack (give the auditor)

Pin a **single git commit** of this repo (or a release tag) and ship:

| Item | Location / how to reproduce |
| --- | --- |
| Obstacles 1–5 | `docs/PRODUCTION-CUSTODY-GATES.md` |
| Engineering assurance | `docs/PRODUCTION-ASSURANCE.md` (tests + Base fail-closed smoke) |
| Cutover Phase A | `docs/CUTOVER-CUSTODY.md` Phase A evidence table (2026-10-15) |
| Settler / consumer source | `contracts/` + `deployments/` cited in the gates doc |
| Live Base RPC reads | `https://base-rpc.conet.network` — script or curl pack matching ASSURANCE §2 |
| Live CoNET reads (GB admins) | `https://rpc1.conet.network` — Phase A table |
| Local tests | `cargo test --tests` → expect **107** passed / **0** failed on the pinned commit |
| Explorer / verification | Blockscout / Basescan links for proxy, settler, cover, finality, consume-once |
| Non-claims | ASSURANCE §6 — copy into SOW so the auditor does not equate smoke with custody open |

Suggested one-liner for the SOW commit pin:

```bash
git -C /path/to/bridgeAAC rev-parse HEAD
# Record that SHA in the engagement letter and in docs/INDEPENDENT-AUDIT-ACCEPTANCE.md
```

---

## 5. Auditor work sequence

1. **Kickoff** — SOW cites §3; pin repo SHA; list addresses in CUTOVER header.
2. **Re-run engineering checks** (auditor-controlled machine):
   - `cargo test --tests` on the pinned commit.
   - Re-execute ASSURANCE §2 fail-closed smoke against Base RPC.
   - Spot-check Phase A GB `admins(AAC proxy) == false` on CoNET and Base.
3. **Code + bytecode review** — settler UUPS layout, consume-once, COVER /
   CONET_FINALITY immutability / owner-only setters, no hidden mint on consumer.
4. **Cutover review** — read CUTOVER Phases B–D; confirm blast-radius claims.
5. **Report** — Accepted / Findings / Not Accepted per §3 item; attach hashes of
   any scripts used.
6. **Handoff** — deliver artifact to CoNET maintainers for GitHub publish (§6).

Do **not** ask the auditor to broadcast role-grant transactions.

---

## 6. Publish acceptance to GitHub (when Accepted)

Only after a real written acceptance artifact exists.

### 6.1 Add the acceptance record

Create **`docs/INDEPENDENT-AUDIT-ACCEPTANCE.md`** in this repository (English):

```markdown
# Independent audit — Accepted

**Status:** Accepted  
**Date:** YYYY-MM-DD  
**Auditor:** <legal name / firm>  
**Repo commit audited:** `<40-hex>`  
**Artifact:** <URL to PDF on GitHub Release / IPFS / signed URL>  
**Artifact content hash:** `sha256:<hex>` (or equivalent)

## Verdict by scope item

| # | Scope item | Verdict |
| --- | --- | --- |
| 1 | Gate evidence integrity | Accepted |
| 2 | Fail-closed settler | Accepted |
| 3 | Consume-once | Accepted |
| 4 | Finality adapters | Accepted |
| 5 | Cutover blast radius | Accepted |
| 6 | No silent unpause | Accepted |

## Explicit non-claims

- Accepted ≠ custody open.
- Accepted ≠ Phase B executed.
- Role grants still require a separate owner-authorized cutover message.

## Links

- Report: …
- PRODUCTION-ASSURANCE.md §4 updated in the same PR
- CUTOVER-CUSTODY.md hard-stop updated in the same PR
```

Optional: attach the PDF as a **GitHub Release** asset
(`independent-audit-YYYY-MM-DD`) so the link is durable.

### 6.2 Update status rows (same PR)

| File | Change |
| --- | --- |
| `docs/PRODUCTION-ASSURANCE.md` | §4 Status → **Accepted**; link acceptance doc + artifact hash |
| `docs/CUTOVER-CUSTODY.md` | Hard stop item 1 → Accepted with link; Phase B still **NOT EXECUTED** |
| `docs/INDEPENDENT-AUDIT.md` | Header Status → point to acceptance doc (keep process text) |
| `README.md` | Independent audit **PENDING** → **Accepted** (custody still closed) |

**Do not** flip Phase B–D to executed in that PR.

### 6.3 Commit, push, optional PR

```bash
cd /path/to/bridgeAAC
git checkout -b docs/independent-audit-accepted   # or commit on main per team policy
git add docs/INDEPENDENT-AUDIT-ACCEPTANCE.md \
        docs/PRODUCTION-ASSURANCE.md \
        docs/CUTOVER-CUSTODY.md \
        docs/INDEPENDENT-AUDIT.md \
        README.md
git commit -m "$(cat <<'EOF'
docs(aac): record independent audit Accepted (custody still closed)

Attach third-party acceptance artifact hash; Phase B+ remains not executed.
EOF
)"
git push -u origin HEAD
# Prefer PR review before merge if the auditor artifact is public-facing
```

Remote: `git@github.com:CoNET-project/bridgeAAC.git`.

### 6.4 Mirror GitBook (same task if public book cites AAC)

Update English pages that say audit **PENDING**:

- `src/docs/gitbook/l1/aac-cross-chain.md`
- `src/docs/gitbook/developers/l1-erc20-bridge.md` (if it cites the gate)

Point them at the GitHub acceptance blob / Release. Deploy with the project
GitBook script (prefer `REMOTE_USER=peter` on `conet.network` if root SSH fails).
Smoke `https://gitbook.conet.network/l1/aac-cross-chain.html`.

### 6.5 If Findings (not Accepted)

- Do **not** create `INDEPENDENT-AUDIT-ACCEPTANCE.md` with Status Accepted.
- Open a GitHub issue or `docs/INDEPENDENT-AUDIT-FINDINGS.md` listing defects.
- Keep ASSURANCE §4 **PENDING**; freeze cutover; re-open related gate sections
  after fixes; schedule a re-audit on a new commit pin.

---

## 7. After Accepted — still closed

Even with audit Accepted on GitHub:

| Action | Still required? |
| --- | --- |
| Custody open / settler upgrade that sets `custodyOpen` | Separate gate + auth |
| Cutover Phase B role grants | Explicit owner message naming txs |
| Phase C canary mint/release | Explicit auth + ceiling |
| Phase D miner-vote disable | Only after successful canary |
| Unpause historical canaries | Out of scope |

---

## 8. Checklist (maintainers)

- [ ] Auditor engaged with SOW citing §3 and pinned SHA
- [ ] Evidence pack delivered (§4)
- [ ] Written artifact received (Accepted or Findings)
- [ ] If Accepted: `INDEPENDENT-AUDIT-ACCEPTANCE.md` + ASSURANCE / CUTOVER / README updated
- [ ] Artifact hash and durable URL recorded
- [ ] Push / PR to `CoNET-project/bridgeAAC`
- [ ] GitBook pointers updated and smoked (if applicable)
- [ ] Phase B **not** executed in the acceptance PR
- [ ] No invented Passed status without the artifact

---

## 9. Publishing *this* runbook (process draft)

This file (`INDEPENDENT-AUDIT.md`) is the process draft. Publishing it does
**not** complete the audit. After merge to `main`:

```text
https://github.com/CoNET-project/bridgeAAC/blob/main/docs/INDEPENDENT-AUDIT.md
```

Share that URL with the auditor as the engagement runbook.
