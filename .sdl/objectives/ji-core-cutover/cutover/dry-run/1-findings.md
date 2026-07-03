# Dry-run 1 findings (2026-07-02)

First full rehearsal of runbook §B, executed in worktree slot-09 on branch
`ji-cutover-dry-run` (not /tmp). Outcome: **§B1–B5 complete and green** — all 3
chunks executed, 2 fix rounds (budget exactly consumed), full `just` gate green
(3803 tests), all 4 smoke tests pass. Every finding below folds into pipeline
inputs; the plan JSON is regenerated, never hand-patched.

## A. Plan-input amendments (mechanical, no owner decision needed)

1. **cs6 instructions**: name the FakePi customType literals `sdl-command-ack` /
   `sdl-command-progress` in `flow/test/pi/sdl-extension.test.ts` explicitly
   (agent skipped them as "not source-defined constants"; the
   residual-machine-keys invariant requires the ji-* forms in this exact file).
2. **cs3 instructions + anchors**: add env var
   `SDL_KERNEL_DISABLE_FIRST_PARTY_EXTENSIONS` (registry.ts:107,
   extension-registry.test.ts ×6). It appears in NO plan input and was also
   missing from the decisions-log SDL_* enumeration (inventory drift).
3. **cs5 instructions**: name the env-var NAME string values `"SDL_PAYLOAD_ROOT"` /
   `"SDL_PAYLOAD_SESSION_ID"` in aretro `payloads/root.ts` (identifiers
   `SDL_PAYLOAD_*_ENV` survive).
4. **loader.ts joins the plan** (cs2 or cs3):
   `ts/packages/kernel/src/extensions/loader.ts` was in NO chunk, NO skip, NO
   candidate list, yet emits diagnostic code
   `sdl_extension_contribution_import_failed` (+ mirrors in
   extension-loader.test.ts:107, extension-registry.test.ts:380,523).
5. **project-agents.ts hint**: add diagnostic code `sdl_toml_invalid` ×4 (hint
   was scoped to "sdl.toml"→"ji.toml" literals only).
6. **cs2 instructions**: pair `typescript-style-guard.test.ts` assertion texts
   (`missing/unknown sdl.tier`, `without sdl.remainder`) and its `sdl:` mock
   manifest keys with the cohort-tests-11/12 support-file renames. The
   cs2-vs-cohort ownership split created a deliberate two-phase desync that
   surfaced as 3 failing tests between chunk 2 and fix round 2.
7. **Chunk-2/3 hint additions** (found by fix rounds): CONTEXT-MAP.md line 92
   `sdl slot gt` (owning file's hint missed one line);
   pr-download-feedback.test.ts:416 must rename WITH
   pr-stack-feedback-instructions.md (currently split across chunks 2 and 3 —
   move the md into chunk 2 or add a pairing note); sdl-context.test.ts `SDL_TEST`
   env fixture key; source-cli-shim.test.ts `/tmp/sdl` fixture value.

## B. Generator amendments

8. **G11 pattern needed: snake_case machine codes** — `sdl_[a-z_]+` string
   literals are invisible to G1–G10 (that is how loader.ts escaped entirely) and
   to all 21 invariants. Two real families existed:
   `sdl_extension_contribution_import_failed`, `sdl_toml_invalid`.
9. **Second escapee, needs owner decision first** (see D3):
   `address/src/core/feedback-summary.ts:5` `["<!-- sdl-reviewer:",
   "sdl_reviewer_marker"]` — also caught by no generator pattern and no
   invariant grep as written (`"sdl-` is quote-anchored; the marker starts
   `"<!-- sdl-`).

## C. Invariant amendments (7 false-positive groups at chunk-3 verify)

10. **residual-env-vars**: `SDL_[A-Z]` "must be empty" contradicts the brief's
    identifier-survivor rule — 63 hits remained, ALL SCREAMING_SNAKE TS
    identifiers (SDL_EXEC_GROUP_NAME, SDL_COMMAND_NAME_PATTERN, SDL_PAYLOAD_*_ENV,
    …); the verify agent itself confirmed zero env-var STRING VALUES remain.
    Rewrite to target env-var name positions (string literals, `env.SDL_*` /
    `process.env.SDL_*` reads, docs/justfile/skill mentions), or the owner
    decides SCREAMING identifiers rename too.
11. **residual-machine-keys**: narrow regex `"sdl-(command|cli|harness|pi-cli)`
    catches `"sdl-cli-design"` (surfaces.ts:83) — an explicit survivor skill-dir
    name. Reword regex (e.g. require the full machine-key stems).
12. **residual-dot-sdl** + **style-guard-bucket**: `\.sdl` catches identifier
    property access (`.sdlTier`, `.sdlSubpackages`, `.sdlToml`,
    `sdlExtensionParity`) — 29 false violations. Add an identifier carve-out
    (e.g. require `[./"']` or path-ish context after `.sdl`).
13. **residual-namespace**: flags the deliberate NEGATIVE assertions in
    sdl-extension.test.ts:98-117 (`expect(pi.commands.has("sdl:…")).toBe(false)`
    tombstones proving old names are gone). Carve out absence assertions or
    decide the tombstone list is deleted at landing.
14. **residual-bin-argv**: flagged `join(CCC_SRC_DIR, "sdl", …)` in
    module-loader.ts — a survivor the brief protects while CITING
    module-loader.ts by name. Align the invariant with the brief.
15. **scope-untouched-baseline**: both frozen numbers drift for structural
    reasons: src/sdl occurrences 149→147 (two in-window XDG `/sdl/extensions`
    strings were inside the frozen count) and @sdl/ file count 1344→1354 (the
    grep does not exclude `.ji/objectives`, so the pipeline's own artifacts
    inflate it). Exclude the objectives tree + XDG-renamable strings when
    re-deriving, and re-freeze same-day per runbook §A (real landing already
    mandates this).
16. **no-compat-shim**: verify agent flagged areg's pre-existing
    `parseLegacyAregJsonAgents` (areg.json JSON fallback) — a legacy-FORMAT
    feature predating the cutover, not an sdl→ji shim; the six loaders the
    invariant targets all PASS. Scope the prompt to sdl→ji compat explicitly.

## D. Owner decisions needed

17. **Brand prose**: uppercase/bare "SDL" in production messages ("Extension
    manifest contains invalid SDL metadata", "Invalid SDL command candidate…",
    "SDL user module") and pervasively in docs/skills titles and describe()
    blocks. No rename category, invariant, or skip covers it; agents across all
    3 chunks + both fix rounds independently declined it. Decide: (a) new brief
    category "brand prose SDL→ji in user-facing strings", or (b) document as
    survivor-until-branding-row. (`ji --help` still prints "Source Development
    Lifecycle tools.")
18. **`<!-- sdl-reviewer:` PR-comment marker** (feedback-summary.ts): renaming
    breaks recognition of the marker in PRE-EXISTING GitHub PR comments —
    persisted-data compat, not a code compat shim. Rename-and-accept, or
    documented skip.
19. **Brand-named tmpdir prefixes** (~15 sites: `sdl-extension-project-`,
    `sdl-worktree-footer-`, `sdl-shell-home-`, …): brief has no rule; the
    machine-keys broad-sweep judge accepted them this run, but agents flagged
    the ambiguity repeatedly. Write an explicit rule either way.
20. **Historical-fact prose in live docs**: docs/README.md:23 "Retired Python
    `sdl exec` commands" and similar — the historical-prose carve-out covers
    archived docs only. Clarify.

## E. Runbook / process amendments

21. **Reused-worktree pnpm quirk**: on an existing checkout `pnpm install`
    (even `--force`) no-ops and never relinks `.bin` — `.bin/sdl` survived and
    `.bin/ji` was missing until `rm -rf ts/node_modules && pnpm install`
    (3.6s). Fresh /tmp worktrees don't hit this; the REAL landing on an
    existing checkout WILL. Add to §B4.
22. **Expect two formatter fix-ups at B4**: `just dprint-fix` (markdown table
    column widths shift when renames change string lengths — 4 files) and
    `just ts-format-fix` (6 files) before the gate ran green. Add a note to §B4.
23. **Environment-sensitive tests**: clinkr caps/io tests fail under ambient
    FORCE_COLOR=3 (harness shells export it; they stub TERM/COLORTERM but not
    FORCE_COLOR). Unrelated to the rename; run the gate with
    `env -u FORCE_COLOR` or fix the tests to stub FORCE_COLOR.
24. **Model economics** (owner-approved deviation this run): simple tier ran at
    haiku (plan says sonnet), complex/verify at sonnet, per-changeset opus
    overrides stripped. Result: 0 engine failures across 190 agents; every real
    miss traced to plan-input gaps (hints), not model capability. Evidence the
    plan can downgrade tiers if credits matter at the real landing (~6.8M
    subagent tokens total this rehearsal).
25. **Engine/orchestration notes**: session died mid-chunk-1; resume via
    `resumeFromRunId` worked (re-ran agents idempotently against the
    already-edited tree — report changed-counts reflect the second pass).
    Cross-chunk file sharing (extension-registry.test.ts in cs3 AND
    cohort-tests-12) is safe sequentially but produced double-edit reports.
26. **Fix-round budget exactly consumed** (2 of 2). Round 1: 4 files (chunk-1
    scope misses). Round 2: 9 files (invariant reals + queued desyncs). If a
    future rehearsal needs round 3, re-partition per runbook instead.

## F. Verdict

The plan's totality held: ZERO unowned files appeared in any residual sweep
(the two escapees were invisible to the generator, not mis-assigned). All real
defects trace to (a) hint gaps on non-enumerated literal families (env-var
names, machine keys, diagnostic codes) and (b) invariant greps written stricter
than the brief's survivor rules. With amendments A–C folded and D decided, a
second rehearsal should produce 0 fix-round entries and ≤3 invariant failures
(the deliberate judgment ones), making the real landing mechanical.
