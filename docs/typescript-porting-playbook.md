# TypeScript Porting Playbook

How to port a Python-backed asdl capability to TypeScript while preserving its public contract. The
patterns here were proven end-to-end by the `pr-address` port (the first production vertical slice)
and are written for later capability ports: `brmem`, `handoff`, `objective`, `roaster`, `slot`, and
others.

Worked example references:

- Objective record: `.asdl/objectives/pr-address-typescript-port/` (thesis, roadmap, updates).
- Package boundary decision: `docs/adr/0004-pr-address-typescript-package-boundary.md`.
- Landed code: `ts/packages/pr-address/` (read its README), `skills/pr-address/scripts/pr-address-run`.

## 1. Porting shape: vertical slices, not frameworks

- **Operation-slice-first over framework-first.** Port one coherent user-facing operation with only
  the local runtime/schema seams that slice needs (envelope rendering, JSON input handling,
  `--json-schema` emission). Do not design a shared command-runtime framework up front; let repeated
  slices reveal which seams are actually shared. `pr-address` started with a single operation
  (`classification-template`) and kept every runtime helper package-local through full cutover.
- **Keystone-dependency-first ordering.** Before planning the endgame, map which shared dependency
  the remaining unported operations all need, and port that seam first. For `pr-address` it was the
  payload artifact store: one branch ported the store, and the next three branches flipped every
  remaining operation on top of it. Expect the keystone's real contract to differ from prose
  descriptions of it — port from source, and correct the plan record when reality disagrees.
- **Per-operation registry with fallback dispatch as the migration bridge.** The TypeScript CLI owns
  argument parsing and dispatch from day one; operations not yet ported delegate to the legacy CLI
  with identical argv, stdin, stdout, stderr, and exit code. This gives users one entry point
  throughout the migration and makes "what is ported" an explicit registry fact rather than a docs
  claim. The fallback is scaffolding: remove it in the final deletion branch, and treat any
  still-delegating route as a cutover blocker.

## 2. Parity discipline

- **Capture fixtures from the in-repo reference implementation while it still exists.** Once the
  Python package is deleted, the reference is a frozen published artifact plus checked-in fixtures —
  far more expensive to interrogate. Early branches should bank fixture suites: fixed clocks
  injected at the gateway boundary, temp roots, `{ROOT}` substitution for embedded absolute paths,
  and fake gateway state serialized in the reference implementation's dataclass field order so one
  fixture file drives both implementations identically.
- **Two parity bars, chosen per output class.** Treat machine envelopes and on-disk artifacts as
  byte-for-byte targets, normalizing only genuinely environment-dependent values (root-length
  byte counts, live timestamps). Treat generated `--json-schema` documents as structured semantic
  parity, verified by a dedicated comparator — schema serializers differ legitimately across
  languages, and byte-comparing them encodes accidents. If a route cannot meet its bar yet, exempt
  it explicitly and check in the reference fixtures for a future tightening pass; do not silently
  lower the bar.
- **Known serialization traps when the reference is Pydantic/`json.dumps`.** Pydantic emits explicit
  `null` for optional fields — TypeScript must not drop them. Python's
  `json.dumps(..., indent=2)` applies `ensure_ascii` escaping (`\uXXXX`) to non-ASCII content —
  match it in envelopes or byte parity breaks only on non-ASCII inputs, which test suites rarely
  cover by accident. Both traps were real `pr-address` bugs caught by parity fixtures.

## 3. Gateway and fake seams

- **Capability-shaped gateways, not transport-shaped ones.** Define gateways around what the
  capability needs (PR lookup, review threads, thread mutation, local-branch facts, payload
  storage, process execution), not around `gh`/`git` invocation mechanics. This is what lets the
  same operation core run against in-memory fakes and real adapters unchanged.
- **In-memory fakes mirror the reference fakes' observable behavior**, including miss/error message
  text where tests assert on it. Validation-before-action tests should assert that invalid payloads
  and invalid provenance fail before any fake mutation call is recorded — that ordering is the
  safety contract, and fakes are the only safe place to test it. No live-write probes during
  ordinary porting; live mutations require explicit per-operation confirmation.
- **Real-adapter tests only for filesystem-level stores.** Stores backed by the local filesystem
  (e.g., the payload store) get real-adapter tests against temp directories. Network-backed
  gateways get fakes plus, at most, safe read-only smoke probes where they materially de-risk
  environment assumptions.

## 4. Distribution

- **Checked-in deterministic single-file bundle inside the installed skill.** Installed skills are
  plain directory copies with no build hook, so the prod execution path must ship as an artifact in
  the skill directory: a single-file ESM bundle (sources plus runtime deps), runnable by plain
  `node` with no `node_modules`. No registry publish is required for cutover; keep the npm package
  unpublished unless a registry consumer appears.
- **Make the bundle build byte-deterministic, then byte-compare it in CI.** Lockfile-pinned esbuild,
  stable banner, pinned `absWorkingDir`, no timestamps. A freshness test rebuilds the bundle and
  compares bytes against the checked-in artifact, converting staleness into a CI failure instead of
  silently shipping old behavior. Accepted residuals: a checked-in artifact in the hundreds of KB
  and regenerate-on-every-source-change diffs.
- **Pin a Node floor** matching the workspace `engines` floor, and target the bundle at it.
- **External frozen package as post-deletion rollback.** After in-repo deletion, rollback is the
  last published reference artifact (for `pr-address`: `uvx --from asdl-pr-address==0.1.1` behind
  an explicit wrapper mode), not in-repo code. Verify the pinned version actually exists on the
  registry — `pr-address`'s prod wrapper had pinned a never-published version, meaning there was no
  working prod path to preserve at all.

## 5. Retirement sequencing

- **Plugin retirement is a deliberate breaking change, not a compatibility project.** If the
  capability is mounted under the `asdl` umbrella CLI, decide explicitly whether the standalone CLI
  becomes the sole invocation surface. If yes: remove the entry point, plugin module, and
  asdl-scope smoke test in one branch; scrub docs of the old invocation; and add a retirement-guard
  test asserting the capability never re-mounts under the umbrella.
- **Full deletion is gated, and the gates are evidenced before the deletion branch runs.** Delete
  the Python package only when: every operation executes TypeScript-managed, every `--json-schema`
  route is TypeScript-owned, the bundle/wrapper cutover has landed, the plugin is retired, and
  docs/tests contain no remaining Python invocation path. Validate the deletion branch with the
  full repo gate (`just`: lint, types, format, TS check, JS tests, Python tests), not just the TS
  package — deletion is exactly the change that breaks distant references.
- **Usage-error envelope cutover is the documented final compatibility change.** Argument-parser
  error shapes (click usage text) are the last surface still delegating to the reference CLI.
  Cutting them over to native structured error envelopes is an intentional contract change: record
  it (ADR amendment plus package README), and make it the last divergence rather than an
  unannounced side effect of deletion.
- Decide the fate of shared Python modules at deletion time by checking remaining importers: keep
  what other consumers still use, delete what reaches zero importers.

## 6. Portability limits — when not to reuse this playbook

- **pr-address-specific, do not generalize:** the payload artifact store layout and env-variable
  session contract; mutation-safety semantics (validation-before-action ordering, planned
  provenance, no-push guarantees); the broken-prod-pin situation that made cutover low-risk; the
  exact wrapper mode names. Re-derive the contract inventory per capability — the strongest
  contract sources are the public skill, CLI reference, source group registration, scenario tests,
  and golden fixtures, in that order over developer prose, which goes stale.
- **One port is not enough evidence for shared infrastructure.** The command-runtime seams
  (operation registry, envelope rendering, JSON input handling, `--json-schema` emission,
  managed-option parsing) repeated within `pr-address` but have only one capability behind them.
  Extracting a shared `@asdl` command-runtime package is deliberately deferred until a second
  capability port proves the same seams — this is the Objective's standing open question, resolved
  by the next port, not by more `pr-address` work.
- **Capabilities with different I/O shapes need different parity bars.** This playbook assumes a
  CLI whose contract is JSON envelopes, on-disk artifacts, and schema documents. Capabilities whose
  contract is interactive output, long-running processes, or GitHub-write-heavy workflows will need
  their own evidence strategy for the surfaces fakes cannot cover.
