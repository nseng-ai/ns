# Vocabulary sweep: infra, capability-kit, tools

Resolves the ontology-reshape roadmap row "Vocabulary sweep: infra, capability-kit,
tools (research)", 2026-07-10. Question: what domain language lives in
`ts/packages/infra/*` (brmem, clinkr, foundation), `ts/packages/capability-kit/`
(kit level — only its graphite subpackage has a context), and `ts/packages/tools/*`
(areg, packagechk, vibechk) that no context file records?

Method: as in the prior sweeps — per-package mining of `package.json` export maps and
`ns.*` metadata, READMEs/AGENTS files, and the source modules behind each export
subpath, excluding terms already recorded in the brmem `CONTEXT.md`, the graphite
subpackage `CONTEXT.md`, or the root `CONTEXT.md`. Suspects are weighted toward
**simplification**: candidates to collapse, retire, or delete, not just gaps to
document.

Baseline note: git-tracking verification confirmed exactly the seven roadmap packages
are tracked (`@nseng-ai/capability-kit` is one published container package, not a
directory of packages). `ts/packages/infra/` on disk additionally holds **nine
untracked directories** — `cli-theme`, `cli-runtime`, `exec`, `time`,
`typescript-analysis`, `domain-primitives-transitional`, `git`, `github`, `graphite` —
each containing only a stale `node_modules`: husks of the retired standalone-infra
split. Their names map onto today's foundation subpackages
(infra/foundation/package.json:52-62) and capability-kit subpackages
(capability-kit/package.json:65-71), so they document the absorption story from `ls`
alone. Extends the leftover-directory list in `ideas.md`.

## Summary

- Coverage is inverted relative to importance: **the two most-imported packages in
  the workspace — foundation and clinkr — have no context and no README**, while the
  small leaf tools (packagechk, vibechk) have good READMEs. Only brmem has its own
  glossary (clean per the drift audit), plus the graphite subpackage context inside
  capability-kit.
- **The exec seam contradicts the root glossary three ways** — the sweep's headliner,
  feeding the layering grilling row. The root `CONTEXT.md` says gateways are never
  Neutral Infra and lists `exec` among the Capability Kit's per-domain gateway seams
  (CONTEXT.md:177, CONTEXT.md:223), and its Gateway entry cites `ExecGateway` as the
  flagship example (CONTEXT.md:142). In code: the exec contract lives in foundation
  (`primitives/command.ts`, exported at `./command`), the real process-spawning
  adapter `NodeCommandExecApi` lives in `foundation/exec`
  (infra/foundation/src/exec/index.ts:1,59) — real-world I/O inside the "no
  real-world I/O" floor — and the live seam name is `CommandExecApi`, not
  `ExecGateway`; the only live `ExecGateway` symbol is a Pi-host type
  (`@nseng-ai/pi/shared/exec-gateway`,
  internal/pi-tools/src/pr-feedback-watch/feedback-download.ts:3).
- **The indecision is machine-recorded**: the style guard allows the
  `@nseng-ai/brmem → @nseng-ai/capability-kit` tier debt edge with reason "until
  neutral-infra gateway placement is finalized"
  (internal/typescript-style-guard/src/package-tier-taxonomy.ts:130-134). The
  glossary states gateway placement as decided; the enforcement config records it as
  open.
- **brmem and capability-kit are mutually coupled** at the product level: brmem
  (tier `neutral-infra`) imports `@nseng-ai/capability-kit/git` and `/xdg`
  (infra/brmem/src/prompt-resolution.ts:6-9), while `@nseng-ai/capability-kit/brmem-cli`
  discovers the workspace root and shells out to the brmem CLI
  (capability-kit/src/kit/brmem-cli.ts:1-11). Not an import cycle, but a boundary
  neither glossary can currently describe in one sentence.
- **Name collisions ready to simplify**: `./model-slug` is an export subpath of both
  foundation (model *refs*: provider/modelId, fast-model default,
  infra/foundation/src/primitives/model-slug.ts:1-10) and capability-kit (LM slug
  *derivation*: `RawTextModel*`, `SlugModelEvidence`,
  capability-kit/src/kit/model-slug.ts:1-8) — same name, different concepts.
  "Registry" now carries a fourth meaning (packagechk's npm/PyPI/Homebrew registries,
  tools/packagechk/src/models.ts:1-2) alongside areg's registry, the
  command-backed-skill-registry, and the point catalog's banned "registry".
- **Domain vocabulary sits below the SDK**: `foundation/terminal` exports Runner
  subagent usage/cost totals (infra/foundation/src/terminal/runner-usage.ts:3-16)
  and PR-link/custom-message presentation types
  (infra/foundation/src/terminal/terminal-presentation.ts:8-11), and
  `foundation/primitives` owns skill-lookup roots
  (infra/foundation/src/primitives/skill-lookup.ts:3-7) — runner, PR, and skill
  vocabulary in the neutral floor.

## Cross-package themes

- **The CLI framework contract is repo law but glossaried nowhere.** Every
  first-party CLI is a clinkr `ClinkrGroup` with the four-variant exit contract
  (ok/negative/failure/usage-error → exit 0/1/2 and a `MachineEnvelope`
  discriminated union, infra/clinkr/src/exit.ts:41,76,195), and `ts/AGENTS.md:32`
  states hard gates in clinkr vocabulary (hidden `exec` groups). None of it is in a
  context file.
- **Machine Envelope is produced in one package and parsed in another.** clinkr owns
  envelope construction (infra/clinkr/src/exit.ts:47-113); foundation owns envelope
  parsing for consumers of ns CLIs
  (infra/foundation/src/primitives/machine-envelope.ts:4-13). Root `CONTEXT.md`
  never defines the term; the producer/consumer seam is unrecorded.
- **`ns.*` manifest keys keep growing without a home**: areg adds `ns.group` and
  `ns.settings` (settings-path descriptors, tools/areg/package.json:27-38) to the
  already-unrecorded `ns.tier`/`ns.subpackages`/`ns.remainder` family from the prior
  sweep.
- **Checkpoint vocabulary spans kit and capability.** The kit owns
  `CheckpointMessage` (subject ≤ 52 chars, ≤ 3 bullets,
  capability-kit/src/kit/checkpoint-message.ts:3-9) and checkpoint-flow validation;
  the capabilities sweep recorded flow's checkpoint vocabulary as flow-local. One
  concept, two homes, no recorded seam.
- **Declared future splits live in comments**: the cmux gateway is marked "Neutral
  cmux substrate ... so it can move to a dedicated cmux package without changing its
  implementation" (capability-kit/src/cmux/gateway.ts:5-6) — a package-topology
  intention recorded only in a source comment.
- **Text generation has three homes**: foundation's fast-model refs
  (primitives/model-slug.ts:6-10), capability-kit's `TextGenerationRequest`/text-repair
  (capability-kit/src/kit/text-generation.ts:3-10), and the kernel SDK
  `TextGenerator` over the Pi model registry found by the prior sweep.

## Per-package inventories

### @nseng-ai/brmem — has CONTEXT.md

Context is current and clean on storage vocabulary (drift audit). Unrecorded beyond
it:

- **Prompt resolution surface** — the hidden `brmem exec resolve-prompt` command
  resolving `<name>` to `.ns/prompts/<name>.md` (tier `project`) or an XDG global
  prompt root under `brmem/prompts` (tier `global`).
  (src/operations/resolve-prompt.ts:12-15, src/prompt-resolution.ts:49-54)
- **Result contracts** — `BrmemResult` / `BrmemOptionalResult`
  (found/missing/error) with `BrmemErrorInfo` carrying an optional
  `displayCommand`. (src/contracts.ts:1-12)
- **Ref layout constants** — `refs/brmem` prefix, `base`/`ns` segments,
  `FLAT_SEPARATOR`, branch-name encoding/decoding behind the glossaried Snapshot
  Ref shapes. (src/ref-layout.ts:9-12, src/index.ts:3-12)
- **Key glob** — fnmatch-style Entry Key matching for list/gc filters.
  (src/key-glob.ts:3-9)
- **Run-from-source shim distribution** — `just install-brmem` /
  `just install-tools` render a source CLI shim to `~/.local/bin`; in-checkout
  runs use that checkout, outside runs use the baked-in path. (README.md:20-32)

Suspects (simplification-weighted):

- **"Prompt plugin" vs "prompt"** — the brmem skill teaches "prompt plugins";
  the source and result schema say `prompt` with tier `project | global`
  (src/operations/resolve-prompt.ts:12-15). One name should win; the glossary
  records neither.
- **The tier debt edge** — brmem's `neutral-infra` classification is only valid via
  the allowed debt edge to capability-kit
  (package-tier-taxonomy.ts:130-134); resolving gateway placement (the layering
  row) decides whether brmem's imports or its tier moves.

### @nseng-ai/clinkr — no CONTEXT.md, no README

The CLI framework beneath every first-party CLI (`ns`, `brmem`, `slot`, areg,
packagechk, vibechk, ...). Candidate terms:

- **ClinkrGroup** — the command-group construct; `isHidden` exec groups are a
  `ts/AGENTS.md` hard gate. (src/group.ts:196, ts/AGENTS.md:32)
- **Exit-variant contract** — `ClinkrExit` = ok | negative | failure | usage-error,
  mapped to exit codes 0/1/2 and rendered as the `MachineEnvelope` union.
  (src/exit.ts:41-80,195)
- **ClinkrFailure** — the sole throwable in the operation contract; anything else
  is a crash. (src/failure.ts:1-8)
- **ClinkrFormat** — the `human | json | markdown` render axis. (src/emit.ts:13)
- **Caps / terminal capability detection** — dependency-free `Caps` resolution
  (`ColorDepth`, NO_COLOR/FORCE_COLOR honoring) that cli-theme and the stream
  subpath paint against. (src/caps.ts:1-15)
- **ClinkrInteraction / confirmation** — confirmed | declined | aborted results,
  `requireInteractiveOrUsageError`. (src/confirmation.ts:4-13, src/index.ts:1-6)
- **Surface plans and completion** — `OptionPlan`/`PositionalPlan`/`FieldKind`
  driving help, JSON schema documents (`--json-schema`), and shell completion
  candidates. (src/surface.ts:4-14, src/json-schema.ts:5-9, src/completion.ts:3-13)
- **Stream subpath** — `StreamSink`, `FrameRenderer`, `StreamClock`, line dwell,
  spinner frames for live-updating command output. (src/stream/index.ts:1-14)
- **Raw subpath** — `RawCommandSpec` escape hatch outside the schema-driven
  contract. (src/raw/index.ts:10-14)
- **Testing import scanner** — literal-specifier scanning used by package tests.
  (src/testing/import-scanner.ts:4-8)

Suspects:

- **The name "clinkr"** — expansion recorded nowhere in the package or any glossary
  (the root context names it only as a Neutral Infra example, CONTEXT.md:177).
  Same unglossaried-brand pattern as `nscc` and `areg`.
- **Machine Envelope split brain** — construction here, parsing in foundation
  (theme above). A one-owner decision or a recorded seam would simplify both.

### @nseng-ai/foundation — no CONTEXT.md, no README

Nine declared subpackages, 27 export subpaths (package.json:5-34,52-62); the
absorbed former standalone packages are still visible as untracked husks under
`ts/packages/infra/`. Per-subpackage inventory:

- **primitives** — `ExplicitUndefined` + `ExplicitUndefinedReason`
  (`di-seam`, `env-map`, `abort-signal`, ..., src/primitives/primitives.ts:6-12):
  the typed carrier of the `exactOptionalPropertyTypes` spread idiom the
  ns-typescript skill teaches; `optionalEntry`/`optionalEntries`; `Result`/
  `ErrorInfo` (src/primitives/result.ts); **managed regions** (begin/end marker
  parsing for owned file spans, src/primitives/managed-region.ts:1-14); markdown
  frontmatter; **branch slug** normalization (50-char cap,
  src/primitives/branch-slug.ts:1-11); **model refs** (`ParsedModelRef`,
  `DEFAULT_FAST_MODEL` `openai-codex/gpt-5.4-mini`, provider families,
  `SLUG_MODEL_ENV`, src/primitives/model-slug.ts:1-14,42); **skill lookup**
  (three roots — `skills`, `.agents/skills`, `.claude/skills` — with sourceType
  `repo | vendored | claude` and root rank, src/primitives/skill-lookup.ts:3-11);
  **command primitives** (`ExecResult`, `startupError`, exit 127, tail text,
  src/primitives/command.ts:4-13); terminal escapes; **machine-envelope parsing**
  (src/primitives/machine-envelope.ts:4-13).
- **time** — `Clock`, `TimerScheduler`/`ScheduledTimer`, system adapters, manual
  test fakes; the repo-wide time-seam rule (`ts/AGENTS.md`) is stated in this
  vocabulary. (src/time/)
- **exec** — `CommandExecApi` / `StdinCapableCommandExecApi` contracts and the real
  spawning adapter `NodeCommandExecApi`, plus command formatting helpers.
  (src/exec/index.ts:1-12,59)
- **cli-runtime** — `defineCli` / `CliEntrypointDeps`: the shared CLI entrypoint
  contract; `CliRuntime` = `typescript | bun`; the `--runtime` diagnostic format
  (`runtime: ...` / `entry_point: ...`); `isDirectCliInvocation`.
  (src/cli-runtime/index.ts:17,145,193)
- **cli-theme** — glyphs, palette `Intent`/`Swatch`, result blocks including
  **destructive result blocks**, status lines, tables. (src/cli-theme/index.ts:1-14)
- **terminal** — text tables/truncation/normalization/tail buffers, time
  formatting, **runner usage totals** (`RuntimeRunnerSubagentUsageTotals`, token
  and cost accounting, src/terminal/runner-usage.ts:3-16), and **terminal
  presentation** (`CustomMessageContent`, `PrLink`,
  src/terminal/terminal-presentation.ts:2-11).
- **test-kit** — `TempDirTracker`, `TempGitRepo` test scaffolding.
  (src/test-kit/index.ts:6-12)
- **typescript-analysis** — TS source scanning primitives consumed by the style
  guard. (src/typescript-analysis/index.ts:6-11)
- **config** — a single module: XDG path resolution. (src/config/xdg-path.ts)

Suspects (simplification-weighted):

- **Foundation is where the layering rules bend.** Three subpackages carry
  domain-smelling vocabulary below the SDK: runner-usage (Runner subagents),
  terminal-presentation (PR links), skill-lookup (harness/skill domain). Each is a
  move-up candidate; deciding them shrinks what a foundation glossary must cover.
- **exec placement** (headliner above) — adapter with real I/O inside the declared
  pure floor, contract in a different subpackage (`primitives/command.ts` exported
  as `./command` vs `./exec`), and a glossary that assigns the domain to
  capability-kit.
- **`config` is a one-module subpackage** — collapse into primitives or grow;
  as-is it is taxonomy without content. (package.json:61, src/config/)
- **Three-way rendering split** — clinkr `Caps`, foundation `cli-theme`, foundation
  `terminal` divide "how CLIs render" with no recorded boundary; a one-sentence-per-
  home rule is the documentation-phase test.
- The `ideas.md` single-context-vs-per-subpackage question is downstream of these
  moves: decide what leaves foundation before deciding how to document it.

### @nseng-ai/capability-kit — kit-level: no CONTEXT.md (graphite subpackage only)

One published container package, five subpackages: `kit`, `git`, `github`,
`graphite` (has context), `cmux` (package.json:63-72). `AGENTS.md` carries the
**Kit admission test** — tool vocabulary only; two consumers or a single-consumer
justification plus demotion trigger — as rule prose outside any context file
(AGENTS.md:8-12).

- **kit** (the root `.` export plus most subpaths): `createNsDomainCommand` /
  **Ns Domain Command** (src/kit/ns-command.ts:1-10, src/kit/index.ts:19);
  **NsCommandRunner** / `NsCommandExecApi` — the `ctx`→exec adapter
  (src/kit/command-runner.ts:19); **gateway-result** — `GatewayResult` as a
  re-export alias of foundation `Result`, `commandFailure`, diagnostic formatting
  (src/kit/gateway-result.ts:3-9); **checkpoint message/flow** —
  `CheckpointMessage` subject/bullets limits and validation feedback
  (src/kit/checkpoint-message.ts:3-9); **pending worktree** git facts
  (src/kit/pending-worktree.ts:6-10); **ns context** — `NsCwdEnvStdinContext`,
  clinkr-interaction bridging (src/kit/ns-context.ts:4-10); **text generation** —
  `TextGenerationRequest` (modelRef, reasoning `minimal | low`)
  (src/kit/text-generation.ts:3-10) and **text repair** (bounded-attempt LM repair
  loop with progress heartbeat, src/kit/text-repair.ts:8-10); **content slug /
  model slug** — `deriveSlugWithModel`, `SlugModelEvidence`, `RawTextModel*`
  (src/kit/content-slug.ts:3-8, src/kit/model-slug.ts:11-30); **brmem-cli** —
  workspace-root discovery plus brmem CLI invocation (src/kit/brmem-cli.ts:1-11);
  **workspace root markers** (src/kit/workspace-root.ts:4-9); **xdg** —
  `requireNsStatePath`, `resolveNsXdgPath` ("ns state path" vocabulary,
  src/kit/xdg.ts:5-11); json-input; **shell support** — managed regions in
  zsh/bash rc files (src/kit/shell-support.ts:8-10); temp files.
- **git**: the contract actually lives at `src/kit/git-contract.ts` and is
  re-exported through `git/contract.ts` (`GitGateway`, `KnownGitErrorCode`,
  `GitCwdParams`, src/git/contract.ts:1-8); `RealGitGateway`; **worktree state**
  facts (`GitOperationInProgress` = merge | cherry-pick | revert | rebase | bisect,
  src/git/worktree-state.ts:6-8); local-ref reader; status paths.
- **github**: `runGitHubCli` (src/github/index.ts:1-7), `GithubPrIdentity`
  (src/github/identity.ts:3-8), PR status over GraphQL, and the **pr-feedback**
  sub-tree (`GithubPrFeedbackGateway`, discussion-comment **marker upsert**,
  author normalizers, src/github/pr-feedback/index.ts:1-8).
- **cmux**: cmux command execution (`CmuxCommandExecHost`, startup-failure code,
  src/cmux/index.ts:1-8), `RealCmuxGateway` with **caller context** and **created
  cmux surface** parsing (src/cmux/focused-terminal-tab.ts:3-9), **focused terminal
  tab**, and **pi launch** options (`ModelInfo`, `ThinkingLevel`,
  src/cmux/pi-launch.ts:4-8).

Suspects (simplification-weighted):

- **`kit` is the container's junk drawer.** Nineteen of the package's subpaths map
  to the `kit` subpackage — an accretion of checkpoint, slug, text-generation,
  shell, xdg, and brmem concerns beside the per-domain gateway subpackages. The
  kit-level context decision (the `ideas.md` partial) mostly reduces to deciding
  what `kit` *is*.
- **git contract in `kit/`, git adapters in `git/`** — the subpackage boundary
  blurs exactly where the glossary says subpackages are the architecture unit.
  (src/kit/git-contract.ts, src/git/contract.ts:1-8)
- **Text-generation triplication** (theme above) — kit request/repair vs kernel SDK
  `TextGenerator` vs foundation model refs; one recorded owner would collapse two
  explanations.
- **`model-slug` name collision** with foundation (theme above).
- **Kit admission test lives in AGENTS.md** — the strongest kit-level vocabulary
  (tool-vocabulary-only rule, demotion trigger) is agent instructions, not
  glossary; the documentation phase should decide which file owns it.
- **cmux move-out comment** — a topology decision recorded only in source
  (src/cmux/gateway.ts:5-6); either graduate it to a spec/row or delete the
  promise.

### @nseng-ai/areg — no CONTEXT.md, no README

"Manage ns agent registry projects" (src/cli.ts:29). Tier `standalone-tool`
consuming harness-artifacts `/api`, the command-backed skill registry, and
capability-kit git (package.json:18-26). Candidate terms:

- **areg project** — the registry-project unit behind project inspection,
  mutations, and git-root resolution (`AregProjectGateway`,
  src/operations/project-resolution.ts:4-10, src/gateways/project-gateway.ts).
- **check** — "Check that skills follow areg conventions", pairing directories.
  (src/cli.ts:42-43, src/index.ts:4)
- **doctor skills** — drift diagnosis with severity and report rendering across
  "skill registry, Pi inventory, and replacement-command drift". (src/cli.ts:49-55,
  src/operations/doctor-skills.ts)
- **skill find** — resolution over the foundation skill-lookup roots with searched-
  roots evidence and root rank. (src/operations/skill-find.ts:1-11)
- **skill kind** — classification, inference, frontmatter, and apply-plan modules.
  (src/operations/skill-kind.ts, skill-kind-inference.ts, skill-kind-apply-plan.ts)
- **Pi replacement verification** — verified command-backed replacement surfaces.
  (src/operations/pi-replacement.ts:3-10)
- **Pi settings exclusions** — managed Pi settings state. (src/operations/pi-settings.ts:7-11)
- **manifest sources** — skill-source provenance `first-party | npm-module`.
  (src/operations/manifest-sources.ts:10-12)
- **`ns.group` and `ns.settings` manifest keys** — settings-path descriptors with
  agent-facing descriptions; new members of the unrecorded `ns.*` family.
  (package.json:27-38)

Suspects:

- **"areg" expansion recorded nowhere** — the root glossary *defers* to areg twice
  ("**Registry** remains areg vocabulary", CONTEXT.md:174; "reconciled by areg",
  CONTEXT.md:134) while areg itself has no README, no context, and no expansion.
  The deferred-to vocabulary does not exist. Same pattern as `nscc` and `clinkr`.
- **Overlap with `skill-management-subsystem`** — doctor/check/replacement
  vocabulary should be reconciled with that objective before any glossary is
  authored; coordinate rather than fork.

### @nseng-ai/packagechk — no CONTEXT.md, has README

Public package-registry state checker. Candidate terms: **Registry**
(`pypi | npm | brew`) and **CheckStatus** (`available | taken | invalid | error`,
src/models.ts:1-5); **claim** workflow — publishing a minimal **placeholder
package** to hold an available name (`ClaimProjectSpec`, src/claim.ts:6-12,
README.md:9); `PackageRegistryGateway` / publish gateways (src/check.ts:2,
src/publish-gateways.ts). The README carries an explicit scope guard: workspace
architecture checks, import-boundary enforcement, and export-map policy are out of
scope (README.md:19-27).

Suspects: the fourth live meaning of "registry" (theme above). Otherwise the
package is small, coherent, and self-documenting — a strong **deliberately-thin**
context-decision candidate for the documentation phase.

### @nseng-ai/vibechk — no CONTEXT.md, has README + MANUAL_E2E

Agent-run cost/speed comparison harness. Candidate terms:

- **Baseline / treatment** — the two clean git workdirs a comparison runs against.
  (README.md:9-12)
- **Plan** — the verbatim task text shared by both runs. (README.md:100)
- **Runner (adapter)** — the agent CLI adapter (`claude` implemented; `codex` and
  `pi` planned), `RunnerRequest`/`RunnerResult`. (src/runners.ts:8-16, README.md:33-38)
- **Run bundle / store** — the persisted evidence unit (`bundle.json`, `plan.md`,
  `transcript.txt`, `diff.patch`, artifacts dir) under a store resolved via
  `VIBECHK_HOME`/XDG state. (src/store.ts:13-17, README.md:118-130)
- **Run id** — 8-hex-char, unique-prefix addressable. (src/ids.ts:1-4, README.md:198)
- **Result branch** — `vibechk/<run-id>` committed in the workdir when the agent
  produced changes; never pushed by the tool. (README.md:171,229)
- **Git provenance** — starting branch/commit capture. (src/models.ts:13-17)
- **Metrics** — null-capable wall time/tokens/cost deltas; **failed bundle** on
  non-zero runner exit. (src/models.ts:3-11, README.md:176)

Suspects:

- **"Runner" is now a four-way collision** — vibechk's agent-CLI adapter, the
  Objective Runner, Pi Runner subagents, and foundation's `runner-usage` totals.
  No glossary disambiguates; a naming decision here is cheap while vibechk is
  young.
- Otherwise coherent with a good README — like packagechk, a **deliberately-thin**
  context-decision candidate.
