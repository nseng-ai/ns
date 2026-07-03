# Core Cutover Surface Inventory

Compiled 2026-07-02 from a five-way parallel sweep of the repo (surfaces: `sdl` bin,
`.sdl/` paths, `/sdl:*` Pi namespace, XDG `*/sdl/` namespaces, cross-surface coupling).
This is the planning artifact for the "core cutover in one landing window" roadmap row.
Excludes historical records (`objective-archive/`, `updates/`, ADR history) per the
Non-Goals.

> **Snapshot status (2026-07-02, post-compilation):** the operational source of truth
> for the edit list is now the child Objective's pipeline
> (`ji-core-cutover/cutover/` — generator, frozen lists, `cutover-plan.json`), which
> re-derives this surface deterministically. Two drift waves since compilation are
> absorbed there: the flow land/submit refactor (typed Graphite command channel →
> cs9; retired `command-exec.ts`) and the Objective Runner begin/finish decomposition
> (3 new runner test files, `exec-runner-step.ts`, `SDL_RUNNER_PI_BIN`,
> `sdl-objective-runner-` tmpdir prefix). This document remains the narrative
> evidence base; counts below are as-compiled.

## Executive summary

- ~705 in-scope literal `.sdl` occurrences repo-wide; ~154 `sdl <command>` instruction
  lines across `skills/**/*.md`; 13+ test files hardcode `/sdl:*` command names; 51 test
  files embed `.sdl` literals. **No surface has a single source of truth** except the XDG
  namespace (one canonical function, three bypass sites).
- The rename is a mechanical but wide sweep: no generator or manifest regenerates any of
  these names from one config value. Every code site, skill, doc, and test-assertion
  string needs its own edit, landed atomically.
- One hard build-breaker, several silent-failure traps, and four open design questions
  (below; all four resolved by the owner 2026-07-02 — everything renames to ji).

## Hardest atomicity points (break-the-build or silent failure)

1. **pnpm workspace glob — hard build breaker.** `ts/pnpm-workspace.yaml:4`,
   `ts/package.json:53`, `ts/tsconfig.json:34-35`, `ts/pnpm-lock.yaml:116,157` wire
   `../.sdl/reviews/*/tools/*` in as a real workspace member
   (`.sdl/reviews/reinvented-abstractions-tripwire/tools/scan-reinvention`). Mis-sequence
   this and `pnpm install`/`tsgo`/CI fail outright.
2. **Kernel extension discovery — silent.** `ts/packages/kernel/src/extensions/registry.ts:121-128`
   scans `join(cwd, ".sdl", "extensions")`. If `.sdl/` moves without this line, every
   repo-local `sdl <group>` command silently vanishes from the catalog (no crash).
3. **Tests that read the real checked-in `.sdl/extensions/` directory.**
   `ts/packages/kernel/test/helpers/{objective,flow,handoff,aretro,roaster}-extension.ts`,
   `ts/packages/kernel/test/integration/repo-local-extension-manifest-parity.test.ts:34`,
   `ts/packages/capabilities/address/test/scenario/extension-manifest.test.ts:20` — all
   traverse `../.sdl/extensions` relative URLs; ENOENT hard-crash on a split landing.
4. **`isManagedSlotPath()` regex — silent.**
   `ts/packages/capabilities/flow/src/land/stack/worktrees.ts:74-76` hardcodes
   `/sdl\/slots\/repos\/…\/worktrees\/slot-…/` and does NOT go through the canonical XDG
   helper. Missed → managed-slot detection during `flow land` silently degrades to
   manual-worktree handling. (Fixtures: `flow/test/unit/land-stack-helpers.test.ts:496-553`;
   this exact regression happened once before in the `.slots` → XDG migration.)
5. **Duplicate independent literals with the same value** — a grep pass that "finds one"
   can miss the twin:
   - `REPO_PR_DESCRIPTION_PROMPT_PATH = ".sdl/prompts/pr-description.md"` declared twice:
     `flow/src/submit/pr-description.ts:26` and `flow/src/sdl/commands/regenerate-pr.ts:22`.
   - `COMMAND_NAME = "sdl:flow:land"` declared twice with no import relationship:
     `flow/src/land/land.ts:68` and `flow/src/land/stack/constants.ts:1` (the latter feeds
     printed usage text — desync is silent).
   - `objective/src/core/storage.ts:5-6` constants re-hardcoded in
     `ccc/src/cmux/objective-sidebar.ts:15-17`.
6. **Style-guard bucket — silent.**
   `ts/packages/infra/core/test/typescript-style-guard/typescript-style-guard.test.ts:82-91`
   classifies `.sdl/extensions` as an exempt path category; missed → wrong bucket, no
   failure.
7. **CI.** `.github/workflows/roaster.yml:59,123-126,132` literally invokes
   `sdl roaster …` (PATH comes from `ts/node_modules/.bin`, which self-heals on
   `pnpm install`, but the three literal invocations do not).
8. **Agent onboarding.** `AGENTS.md:32,43` (`sdl objective exec load-orientations`,
   `objective list`) — the full chain AGENTS.md → bin → `registry.ts` → `discovery.ts`
   manifest key → `.sdl/extensions/objective/` re-exports →
   `objective/src/core/storage.ts:5-6` → `real-storage.ts` must move as one unit.

## Surface 1: `sdl` bin → `ji`

- **Declaration (one site):** `ts/packages/kernel/package.json:32-34`
  `"bin": {"sdl": "./src/cli/index.ts"}`. pnpm shims (`ts/node_modules/.bin/sdl` plus the
  twelve dependent packages' shims) regenerate automatically on `pnpm install`.
- **justfile:** `install-sdl` recipe (`justfile:63-68`), `install-tools` echo
  (`justfile:133-134`), retired-bin echo text (`justfile:109-118`). The
  `_install-ts-shim` machinery and `ts/scripts/render-cli-shim.mjs` /
  `source-cli-shim-template` are parameterized — invoke with `"ji"`, no code change
  (template prose mentions "sdl checkout" — cosmetic, POST).
- **CLI self-references:** completion script (`kernel/src/cli/completion.ts:22`
  `commandName: "sdl"`), shell wrapper + install strings (`kernel/src/cli/shell.ts:79-92`),
  help text (`kernel/src/cli/index.ts:494`), duplicate wrapper in
  `capabilities/slot/src/sdl/extension.ts:159`. Paired scenario tests:
  `kernel/test/scenario/{shell-cli,completion-cli}.test.ts`,
  `kernel/test/integration/node-runtime-cli.test.ts:9,14` ("Usage: sdl").
- **~14 production subprocess dispatches** hardcoding `"sdl"` as argv[0] (plus
  `formatCommand("sdl", …)` display strings and a `which sdl` PATH probe with its error
  message): `local/pi-tools/src/pr-feedback-watch/feedback-watch/controller.ts:576-586`,
  `local/pi-tools/src/pr-previews/{preview-feedback-command.ts:245,preview-checks-command.ts:173}`,
  `hosts/pi/src/core/pr/{feedback-download.ts:80,extension.ts:297,321}`,
  `capabilities/objective/src/pi/extension.ts:266-270`,
  `capabilities/ccc/src/cmux/{objective-sidebar.ts:99-105,slot-dispatch-plan.ts:382}`,
  `capabilities/flow/src/land/{post-landing-slot-cleanup.ts:72-138,stack/landing-operations.ts:59-100,stack/command-exec.ts:88,stack/graphite-topology.ts:57-91}`,
  `capabilities/flow/src/pi/stack-squash.ts:172`,
  `hosts/sdlcc/src/{stack-map-model-loader.ts:238,objective-tab.ts:44}` — each with 1:1
  fake-driven tests asserting `command === "sdl"` (incl. `TOPOLOGY_COMMAND = "sdl"` in
  `ccc/test/land-test-helpers.ts:4` and `flow/test/unit/land-test-helpers.ts:4`).
- **Skills:** ~154 `sdl <command>` instruction lines across ~40 files under `skills/`
  (single source of truth; `.agents/skills/` and `.claude/skills/` are symlinks), incl.
  **7 `Bash(sdl …)` allowed-tools frontmatter patterns** (`handoff-pickup`,
  `handoff-create`, `code-autobranch`, `code-checkpoint`, `code-just-the-stack`,
  `branch-retro`, `sdl-flow-submit`) that would silently re-introduce permission prompts
  or block agents.

## Surface 2: `.sdl/` → `.ji/`

- **No repo-wide canonical constant.** Canonical-ish sites and their un-imported twins:
  - `.sdl/objectives` + `.sdl/objective-archive`: `objective/src/core/storage.ts:5-6`
    (canonical); duplicated in `ccc/src/cmux/objective-sidebar.ts:15-17`; raw literals in
    `objective/src/core/{objective-selection-flow.ts:217,238, objective-picker.ts:169, fake-storage.ts:158}`.
  - `.sdl/reviews`: `roaster/src/gateways/review-catalog.ts:12,138`;
    `roaster/src/core/skill-reviews.ts:110`;
    `local/pi-tools/src/thermo-council/{constants.ts:7,prompt.ts:39,extension.ts:38}`.
  - `.sdl/prompts`: `infra/brmem/src/operations/resolve-prompt.ts:24`;
    `branch-context/src/pi/enriched-plan-save.ts:214-251`; duplicate
    `REPO_PR_DESCRIPTION_PROMPT_PATH` (see atomicity §5).
  - `.sdl/extensions`: `kernel/src/extensions/registry.ts:123,128`.
  - `.sdl/pi/agents`: `hosts/pi/src/runtime/agent-definition.ts:47,51,63` (fails loudly).
  - `.sdl/state/submit-failure-logs` cwd-fallback: `flow/src/sdl/commands/submit.ts:311`.
  - `.pi/extensions/objective-autopilot.ts:353,354,750` (repo-root Pi extension).
- **`.gitignore:40`** `.sdl/tmp` → needs `.ji/tmp`.
- **Tests:** 263 matches across 51 `*.test.ts` files (objective 114, capability-kit 38,
  roaster 38, kernel integration/scenario suites, plus 8 non-test helper files). No
  committed snapshots embed `.sdl`; all inline string literals — find/replace, not regen.
- **Operative docs/skills:** ~9 objective-family skills with `git …
  -- .sdl/objectives/...` command templates; 6 roaster tripwire skills pointing at
  `.sdl/reviews/<key>/review.md`; `skills/brmem/SKILL.md:311`,
  `skills/sdl-flow-submit/SKILL.md:56`; root `CONTEXT.md:24,28`, `AGENTS.md:25`,
  `kernel/CONTEXT.md` + `kernel/README.md`, `roaster/CONTEXT.md:33`,
  `docs/objective-system.md` (~25 hits) and the `docs/pi/*` family.
- **Distinct concern, do not conflate:** the `"sdl"` **key inside package.json manifests**
  (`sdl.group`, `sdl.tier`, `sdl.commands`, `sdl.subpackages`) read by
  `kernel/src/extensions/discovery.ts:86-87,218,287-304` and the areg style guard — see
  open question Q1.

## Surface 3: `/sdl:*` → `/ji:*`

- **No single source of truth; three mechanisms:**
  - A: `piNamespace: "sdl:flow"` in `flow/src/pi/sdl-extension.ts:76` (join logic at
    `hosts/pi/src/commands/cli-extension.ts:563`) — drives all 10 `/sdl:flow:*` commands.
  - B: 6 hardcoded full-name constants in `hosts/pi/src/commands/surfaces.ts:1-12`
    (branch-context/plan commands), plus `KNOWN_PI_COMMAND_NAMESPACES` (`"sdl"` at :33)
    and `SPECIALIZED_SKILL_REPLACEMENTS` (:102-125). Exported publicly as
    `@sdl/pi/commands`.
  - C: orphan duplicates — two independent `"sdl:flow:land"` literals (atomicity §5).
- Extension discovery is filesystem-convention (`.pi/extensions/*.ts`); no manifest
  declares the namespace. `.pi/extensions/sdl.ts` filename is cosmetic.
- **Production message strings:** `flow/src/sdl/commands/push.ts:18,70,84,108`,
  `ccc/src/cmux/slot-dispatch-plan.ts:245,246,483`,
  `docs-site/lib/extensions-catalog.ts:81,94` (hand-curated, already drifted).
- **Tests failing immediately on rename:** `flow/test/pi/sdl-extension.test.ts:96-120`
  (asserts exact name set AND absence of legacy aliases), 4 branch-context pi test files,
  `hosts/pi/test/commands/pi-command-surfaces.test.ts`,
  `hosts/pi/test/worktree-status/{refresh,extension}.test.ts`,
  `flow/test/scenario/push-command.test.ts`,
  `flow/test/unit/land-stack-{helpers,topology-guards}.test.ts`, `ccc/test/ccc.test.ts`.
- **Parity table:** `.sdl/objectives/cross-harness-parity/parity-table.md:38,51` — only
  two `/sdl:` line edits, but the table is independently flagged STALE (2026-06-26) and
  the objective plans to bundle its update into this landing.
- **Skills/docs:** ~9 skill files, `docs/pi/README.md` (dense),
  `docs/pi/branch-context-workflow.md` (~25 occurrences), `CONTEXT-MAP.md:42,73,75`,
  `hosts/pi/CONTEXT.md:44,48` (glossary definition of the namespace convention),
  `kernel/README.md` (~10 lines). Note `skills/code-autobranch` and
  `skills/code-checkpoint` reference already-stale flat names (`/sdl:autobranch`,
  `/sdl:cp`) — fix to `/ji:flow:*` in the same pass.
- Internal event key `"sdl:pi-extension-command:finished"`
  (`hosts/pi/src/commands/events.ts:1`) — not a slash command; rename for consistency but
  it's a machine key, not user-facing.

## Surface 4: XDG `*/sdl/` → `*/ji/`

- **Canonical constant:** `infra/core/src/config/xdg-path.ts:67` — the single `"sdl"`
  segment inside `resolveSdlXdgPath()`; facade re-export `@sdl/capability-kit/xdg`.
  Consumers via the helper: slot (`slot/src/core/context.ts:91` → `state/sdl/slots`),
  plans (`plans/src/saved-plan-file.ts:129` → `state/sdl/enriched-plan`), kernel global
  extensions (`registry.ts:100` → `data/sdl/extensions`), brmem global prompts
  (`brmem/src/prompt-resolution.ts:51` → `config/sdl/brmem/prompts`), pi trace log
  (`hosts/pi/src/commands/cli-command-trace.ts:16`).
- **Three bypass sites (hand-rolled literals):**
  1. `flow/src/sdl/commands/submit.ts:300-311` (submit-failure-logs, reimplements XDG
     resolution).
  2. `flow/src/land/stack/worktrees.ts:74-76` `isManagedSlotPath()` regex (atomicity §4 —
     highest-risk).
  3. `aretro/src/payloads/root.ts:16` `join(baseTempDir, "sdl")` (OS tmpdir, same
     pattern — Q4).
- **LLM-facing tool-contract strings** spell out `$XDG_STATE_HOME/sdl/enriched-plan/…`:
  `branch-context/src/pi/enriched-plan-save.ts:99,296-302` + three test files asserting
  that text.
- **Deliberate exception:** vibechk stores at `state/vibechk` with NO `sdl` segment
  (`vibechk/src/store.ts:53-59`) — no change.
- **Docs:** `docs/xdg-base-directory-spec.md:110-129` is the canonical enumeration of all
  roots — the single best doc target. Also `docs/pi/branch-context-workflow.md:9,46,49`
  ("Legacy `~/.sdl/…` not read" — see Q3), `skills/branch-context/references/*`,
  `skills/brmem/SKILL.md`.
- **Test fixtures:** `infra/core/test/xdg-path.test.ts`, capability-kit `xdg.test.ts`,
  slot `context.test.ts`, plans, brmem scenario helpers, and the large family of literal
  `/Users/me/.local/state/sdl/slots/...` fixtures in
  `flow/test/unit/land-stack-{helpers,command-scenarios}.test.ts`,
  `ccc/test/land-command.test.ts:721,756`, `hosts/sdlcc/test/unit/stack-map.test.ts`.

## Machine migration notes (feeds the later checklist row)

- No registry/index files anywhere — slots, extensions, plans are pure filesystem layout.
  Slot occupancy derives live from `git worktree list` (`slot/src/core/inventory.ts`).
- **Worktrees cannot be raw-`mv`d**: each slot's `.git` file points back to the main
  repo's `.git/worktrees/<name>` admin dir — use `git worktree move` / prune+re-add.
- Trees to move: `state/sdl/slots` (contains the live checkouts themselves),
  `state/sdl/enriched-plan` (durable data), `data/sdl/extensions`,
  `config/sdl/brmem/prompts`. Safe to drop: `state/sdl/submit-failure-logs`,
  `state/sdl/pi-cli-command-extension` (diagnostics).
- Out of sweep: `state/vibechk` (sibling, unchanged), `~/.pi/agent/…` (Pi-owned,
  explicitly excluded per sdl-config-layout-migration).
- **Shell-profile `SDL_*` env vars stop working at the landing** (found during
  pipeline authoring; the in-repo names all rename to `JI_*` in-window):
  `SDL_CHECKPOINT_MODEL`, `SDL_DEV_*`, `SDL_SLUG_MODEL`, `SDL_SUBMIT_FAILURE_MODEL`,
  `SDL_CCC_SIDEBAR_MODEL`, `SDL_PI_CLI_TRACE*`,
  `SDL_KERNEL_DISABLE_FIRST_PARTY_EXTENSIONS`, `SDL_RUNNER_PI_BIN` (added by the
  Objective Runner decomposition). Any exported in owner shell profiles must be
  renamed as part of this checklist.

## Cross-objective coupling

- **`ship-objectives-to-customers`** — highest risk: unimplemented `sdl init` spec text
  would scaffold `.sdl/objectives/` and `sdl:objectives:*` markers into customer repos.
  Update its spec text before/at cutover; treat implementation as blocked until then.
- **`cross-harness-parity`** — parity-table.md rows 38/51 + every typed
  `PiSurfaceParity` record's `cli:`/`surface:` strings; bundled into the landing (already
  planned).
- **`checkout-free-sdl-distribution`** — its bundling work must target `.ji/extensions/*`
  and bin `ji` post-cutover.
- **`eve-parity-docs-site`** — branding/copy (vocabulary sweep, time-sensitive but not
  atomic). `docs-site/lib/extensions-catalog.ts` command hints are atomic-adjacent.
- **`repo-ontology`, `ts-cli-core-structural-cleanup`, `skill-management-subsystem`** —
  prose goes stale on the package-scope sweep; refresh soon after cutover
  (skill-management-subsystem designs a `sdl skills` surface — reconcile before it
  implements).

## Ordering: PRE / ATOMIC / POST

**PRE (safe before the window):**

- Decision records (done), `@ji` npm org registration (owner, pending).
- Author (not execute) the mechanical rename script/checklist.
- Answer open questions Q1–Q4 below and update `ship-objectives-to-customers` /
  `skill-management-subsystem` spec prose.

**ATOMIC (one landing window):**

- `git mv .sdl .ji` (records move wholesale) + `.gitignore`.
- pnpm workspace glob quartet (`pnpm-workspace.yaml`, `package.json`, `tsconfig.json`,
  lockfile via `pnpm install`).
- Bin key + justfile + CI (`roaster.yml`) + `AGENTS.md:32,43`.
- All production path/namespace/argv literals across surfaces 1–4, incl. every bypass and
  duplicate site named above.
- Every test file enumerated above (they are 1:1 with their production siblings).
- Skills sweep (`skills/**/*.md` incl. allowed-tools patterns) + operative docs
  (`docs/pi/*`, `docs/objective-system.md`, `docs/xdg-base-directory-spec.md`,
  CONTEXT/AGENTS/README operative lines).
- `cross-harness-parity/parity-table.md` update.
- Whatever Q1 decides for the manifest key, `discovery.ts` and all manifests agree in the
  same commit.

**POST (trails):**

- Historical records untouched forever (Non-Goals).
- `repo-ontology` / `ts-cli-core-structural-cleanup` prose refresh; docs-site branding.
- Shim-template prose, internal event key if deferred.
- GitHub repo rename (manual, last). XDG machine migration executes right after the
  landing installs the new bin.

## Open design questions (answer before the landing window)

**Resolved 2026-07-02 by the owner: everything renames to ji** — no sdl-brand literal
survives. Decisions recorded per question below and in
`.sdl/objectives/ji-core-cutover/objective.md` (Open Questions) plus its Semantic
Update `2026-07-02-q1-q4-resolved-everything-is-ji.md`.

- **Q1 — package.json manifest key — RESOLVED: rename to `"ji"`.** The
  `"sdl": {group, commands, tier, subpackages}` metadata key (including `sdl.tier`
  fields) becomes `"ji"`. Touches `kernel/src/extensions/discovery.ts`, every
  `.sdl/extensions/*/package.json`, every workspace package.json carrying `sdl.tier`,
  the areg/style-guard readers, and
  `skills/architecture-topology-report/scripts/extract-graph.mjs` — all consistent in
  one ATOMIC commit.
- **Q2 — `sdl.toml` — RESOLVED: rename to `ji.toml`.** It is brand-named; areg staying
  un-renamed does not exempt its config filename. Update the areg and roaster readers
  (`areg/src/{gateways,operations/init,…}.ts`,
  `roaster/src/{operations/review-run,gateways/local-diff}.ts`) in the same landing.
- **Q3 — "no legacy `~/.sdl/enriched-plan` fallback" prose — RESOLVED: rewrite to
  `~/.ji/…`.** Keep the no-fallback sentence, pointed at the ji path, at the live
  sites (`enriched-plan-save.ts:99`, the three test assertions,
  `branch-context-workflow.md:49`, ADR 0005).
- **Q4 — small-fry brand literals — RESOLVED: all become ji.** Aretro tmpdir segment
  (`payloads/root.ts:16`), internal event key → `"ji:pi-extension-command:finished"`
  (`events.ts:1`), `.pi/extensions/sdl.ts` → `.pi/extensions/ji.ts`. The `src/sdl/`
  source-subdirectory convention ("SDL Command Face") also renames to `src/ji/` but
  executes in the package-scope sweep row, not the cutover window. POST ordering for
  the event key (if deferred) stands.
