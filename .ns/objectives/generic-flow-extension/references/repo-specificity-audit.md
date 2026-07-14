# Flow repo-specificity audit

Audit date: 2026-07-12

## Baseline and method

This audit tests `@nseng-ai/flow` against the Objective's adopter contract: a repository can
adopt Flow with ns, GitHub, and Graphite as the package-wide baseline. Additional
prerequisites may be command-scoped when the command's job intrinsically needs them, but
they must be documented and fail clearly when absent.

Findings are grouped by semantic adopter assumption rather than by file occurrence. Each
uses the agreed disposition test:

- **Resolve** when Flow embeds variable consumer policy, ns-repo identity, or an avoidable
  dependency on another Command Face.
- **Document** when the dependency or policy is intrinsic to the command's promised job.
- **Park** when the concern is real but no demonstrated adopter workflow or bounded safe
  seam justifies implementation now.

The audit covered all source subpackages under `ts/packages/capabilities/flow/src`, the
package manifest and descriptor, and relevant scenario/unit tests. Consumer artifacts
(`ns.toml`, `.ns/prompts/`, and `.pi/extensions/`) were inspected only as boundary evidence.
Known contract work already represented by dedicated roadmap rows — the submit-check marker,
`--no-checks`, and `flow.submit.pre.recovery` — is not duplicated as a new audit finding.

## Summary

| ID  | Semantic assumption                                                                   | Disposition | Contract change         |
| --- | ------------------------------------------------------------------------------------- | ----------- | ----------------------- |
| F1  | Model-backed commands use the ns text-generation service plus env-selected model refs | Document    | Applied to README draft |
| F2  | Checkpoint safety recognizes only branches named `main` or `master` as trunk          | Resolve     | No                      |
| F3  | `pull-trunk` always fetches from remote `origin`                                      | Resolve     | No                      |
| F4  | `squash-stack` obtains Graphite topology through the Slot Command Face                | Resolve     | No                      |
| F5  | Flow's Pi exports bundle ns-repo code-workflow skill names and routes                 | Resolve     | No                      |
| F6  | `land` always performs GitHub squash merges and needs write-capable `gh` auth         | Document    | Applied to README draft |
| F7  | `autoslot` and managed-slot cleanup compose the Slots capability                      | Document    | Applied to README draft |
| F8  | Submit topology and PR identity parse human-facing Graphite display output            | Resolve     | No                      |
| F9  | Submit failure classification matches Git/Graphite/GitHub prose                       | Park        | No                      |
| F10 | PR-description's built-in prompt is not declared as the point's catalog default       | Resolve     | No                      |
| F11 | First-party point definitions are duplicated in the Flow descriptor and SDK built-ins | Park        | No                      |
| F12 | `squash-stack` was omitted from the claimed complete README command inventory         | Document    | Applied to README draft |

## Findings

### F1 — Model-backed behavior is injected, but the adopter contract was incomplete

**Evidence**

- `ts/packages/capabilities/flow/src/ns/commands/changes.ts` documents and selects
  `NS_CHANGES_MODEL`.
- `ts/packages/capabilities/flow/src/ns/commands/cp.ts` and
  `ts/packages/capabilities/flow/src/checkpoint/checkpoint.ts` use
  `NS_CHECKPOINT_MODEL`.
- `ts/packages/capabilities/flow/src/ns/commands/autobranch.ts` and
  `branch-latest-commit.ts` use `NS_SLUG_MODEL`; autobranch also uses the checkpoint
  model.
- `ts/packages/capabilities/flow/src/submit/pr-description.ts` uses
  `NS_DEV_PR_DESCRIPTION_MODEL` and the `flow.submit.pr-description` prompt point.
- `ts/packages/capabilities/flow/src/ns/commands/submit.ts` uses
  `NS_SUBMIT_FAILURE_MODEL` for unknown submit-failure interpretation.
- `ts/packages/capabilities/flow/src/submit/ns-runtime.ts` and command handlers receive the
  `TextGenerator` through the ns command context (`ctx.textGenerator`); Flow does not own a
  provider client.
- `ts/packages/capability-kit/src/kit/text-generation.ts` selects all model refs from the
  command environment, falling back to `openai-codex/gpt-5.6-luna`.

**Current behavior**

The model transport is already injected through the ns SDK-provided command context. Model
identity is consumer-selectable by environment variable. The prior README question was
therefore not an absent DI seam; it was an undocumented runtime requirement and selection
surface. The README mentioned PR descriptions and submit-failure interpretation but omitted
model use by `changes`, `cp`, `autobranch`, and `branch-latest-commit`.

**Adopter scenario**

An adopter has a functioning ns text-generation provider but cannot access the built-in
OpenAI Codex model ref. Without setting the command-specific environment variables, every
model-backed command selects an unavailable default even though Flow's transport boundary is
otherwise portable.

**Disposition: Document**

The ns text-generation service is intrinsic to these command jobs, and the model refs are
already consumer policy rather than hardcoded workflow logic. The README draft now names all
model-backed commands, all current selectors, the default, and the requirement that the ns
runtime can resolve the chosen provider/model. No new Flow-specific model gateway or point is
warranted.

**Next action**

Keep the selectors in command help and the README aligned. A future rename away from the
`NS_DEV_PR_DESCRIPTION_*` legacy spelling is ordinary CLI/config cleanup, not a prerequisite
for generic adoption.

### F2 — Checkpoint trunk protection hardcodes `main` and `master`

**Evidence**

- `ts/packages/capabilities/flow/src/checkpoint/checkpoint.ts`,
  `runCheckpointWorkflow()`, rejects a checkpoint only when
  `snapshot.branch === "main" || snapshot.branch === "master"`.
- `ts/packages/capabilities/flow/src/ns/commands/cp.ts` advertises that same fixed rule.
- The checkpoint workflow is reused by `cp`, dirty `autobranch`, and submit's outstanding-work
  checkpoint path.
- Other Flow workflows already resolve the configured trunk through
  `gt trunk --no-interactive` (for example `trunk-pull/trunk-pull.ts` and land stack facts).

**Current behavior**

A Graphite repository whose configured trunk is `develop`, `trunk`, or another branch can
create a Flow checkpoint directly on trunk. Conversely, a non-trunk feature branch literally
named `main` or `master` is refused.

**Adopter scenario**

A repository configures Graphite trunk as `develop`. Running `ns flow cp` on `develop` stages
and commits the full worktree because the safety check never asks Graphite for trunk identity.

**Disposition: Resolve**

Trunk identity is repository policy already represented by Graphite configuration. Replace
the name heuristic with an injected/configured trunk fact shared by every checkpoint caller;
do not add another Flow trunk setting when Graphite can provide the canonical value.

**Next action**

Design the smallest gateway/runtime change that resolves Graphite trunk before mutation and
add a custom-trunk scenario covering direct `cp` and a composed checkpoint path.

### F3 — `pull-trunk` hardcodes the remote name `origin`

**Evidence**

- `ts/packages/capabilities/flow/src/trunk-pull/trunk-pull.ts` resolves the trunk branch from
  Graphite, then delegates refresh planning to
  `planLocalBranchRefreshFromWorktrees()`.
- `ts/packages/infra/foundation/src/git/index.ts`,
  `planLocalBranchRefreshFromWorktrees()`, emits either
  `git pull --ff-only origin <trunk>` or
  `git fetch origin refs/heads/<trunk>:refs/heads/<trunk>`.
- `ts/packages/capabilities/flow/test/scenario/pull-trunk-command.test.ts` fixes the expected
  remote to `origin`.

**Current behavior**

Trunk naming is configurable through Graphite, but the remote carrying trunk is not. Repos
whose primary remote is `upstream`, `github`, or another name cannot use `pull-trunk`.

**Adopter scenario**

A fork-based repository has `origin` pointing to the contributor fork and `upstream` carrying
the canonical trunk. `ns flow pull-trunk` fetches the wrong repository or fails even though
Git's tracking configuration identifies the correct upstream.

**Disposition: Resolve**

Remote identity is consumer repository policy. Prefer deriving the configured branch
upstream/remote from Git; introduce Flow configuration only if Git/Graphite facts cannot
provide an unambiguous answer.

**Next action**

Add a remote/upstream fact to the refresh planner and cover a non-`origin` checked-out and
non-checked-out trunk.

### F4 — `squash-stack` depends on the Slot Command Face for Graphite topology

**Evidence**

- `ts/packages/capabilities/flow/src/stack-squash/stack-squash.ts` executes
  `ns slot gt exec stack-branches --format json` and owns error strings for that envelope.
- The command then directly executes Graphite operations such as `gt trunk`, `gt checkout`,
  and `gt squash`.
- `ts/packages/capabilities/flow/src/ns/commands/squash-stack.ts` presents this as a Flow
  Graphite workflow, not a Slot workflow.

**Current behavior**

A Graphite-native Flow command cannot inventory its stack unless the Slots extension's hidden
Command Face is also installed and reachable as `ns slot ...`. This is stronger than the
legitimate optional managed-slot integration used by `autoslot` and `land`.

**Adopter scenario**

A repository installs Flow for Graphite workflows but does not activate the Slots extension.
`ns flow squash-stack` fails before any squash even though `gt` and all required Graphite
metadata are available.

**Disposition: Resolve**

The dependency is an avoidable capability Command Face hop, not an intrinsic prerequisite of
stack squashing. Consume a Graphite capability/gateway fact directly (or a curated Capability
API if an existing provider owns the fact).

**Next action**

Replace the `ns slot gt exec` subprocess/envelope dependency with an in-process or direct
Graphite topology seam while preserving the command's current plan and recovery behavior.

### F5 — Flow's Pi package bundles ns-repo code-workflow policy

**Evidence**

- `ts/packages/capabilities/flow/src/pi/code-workflows.ts` hardcodes the `code-workflows`
  skill and repo-relative references such as
  `skills/code-workflows/references/delete-stack.md`, `stacker-agent.md`,
  `parity-review.md`, and `gh-ci-debug.md`.
- `ts/packages/capabilities/flow/src/pi/smart-restack.ts` hardcodes the
  `code-gt-restack-resolve` skill and `/code:gt-restack-resolve` behavior.
- `ts/packages/capabilities/flow/src/pi/code-extension.ts` composes smart restack with stack
  squash, and package exports expose both code extensions.
- `.pi/extensions/code.ts` and `.pi/extensions/code-workflows.ts` are this repository's
  consumer adapters that load those Flow exports.
- By contrast, `src/pi/ns-extension.ts` is a generic mirror over `ns flow ...`, and
  `src/pi/command-backed-skills.ts` describes Flow-owned command surfaces.

**Current behavior**

Installing the Flow package ships Pi surfaces whose names, backing skills, route inventory,
and repo-relative files belong to this repository's code-workflow policy rather than the Flow
Capability. The consumer adapters are thin, but the consumer-specific content is on the
platform side of the boundary.

**Adopter scenario**

An adopter loads `@nseng-ai/flow/pi` expecting Flow mirrors and receives commands that refer
to skills and repository paths it does not have. The package cannot honestly document those
surfaces as generic Flow behavior.

**Disposition: Resolve**

Move the code-workflow picker and skill-specific restack wrapper to consumer-owned or
internal-tool ownership. Keep Flow's Pi subpackage limited to Flow command mirrors and generic
presentation for Flow-owned commands. If a reusable restack workflow remains, its contract
must not name a consumer skill.

**Next action**

Size a separate migration slice after checking current Pi adapter and parity consumers. Do
not replace these hardcoded skill names with a new Flow point unless a real adopter workflow
requires customizable Flow-owned behavior.

### F6 — `land` requires GitHub squash merge semantics and authenticated write access

**Evidence**

- `ts/packages/capabilities/flow/src/land/execution/isolated-landing.ts` and
  `execution/merge-loop.ts` call `squashMergePullRequest()`.
- `ts/packages/capabilities/flow/src/land/stack/land-context-adapter.ts`,
  `squashMergeArgs()`, executes `gh pr merge <number> --squash --match-head-commit ...` and
  supplies the PR title/body as the resulting commit message.
- `ts/packages/capabilities/flow/src/land/land-presentation.ts` documents the concrete merge
  command in its execution preview.
- PR discovery and verification use structured `gh pr view --json` and GraphQL calls in
  `land/stack/pr-facts.ts`.

**Current behavior**

Flow landing is not a generic choice among GitHub merge modes. It deliberately squash-merges
PRs and performs post-merge Graphite maintenance based on that result. Read-only commands can
run without GitHub write permission, but `land` cannot.

**Adopter scenario**

A repository disables squash merge or an operator's `gh` token can read PRs but cannot merge
them. Land preflight may succeed, but merge execution cannot perform the promised job.

**Disposition: Document**

Squash merge is intrinsic to the current land workflow and its stack-maintenance semantics;
turning merge mode into consumer policy would be a separate product design, not genericization
cleanup. The README now states the command-scoped squash-merge and authentication requirement.

**Next action**

Keep this as a documented requirement. Revisit configurability only with a concrete adopter
that needs another merge strategy and an analysis of Graphite maintenance semantics.

### F7 — Slots are a legitimate command-scoped integration, not a package-wide prerequisite

**Evidence**

- `ts/packages/capabilities/flow/src/autoslot/slot-checkout.ts` composes the curated
  `@nseng-ai/slots/api` `SlotClient`; `autoslot` explicitly promises a managed-slot move.
- Land classifies managed slots and can free them before or after landing through
  `land/stack/land-context-adapter.ts` and `land/worktree-paths.ts`; ordinary worktrees are
  classified separately and do not invoke slot cleanup.
- `ts/packages/capabilities/flow/package.json` declares `@nseng-ai/slots` as a runtime
  dependency.
- `push`, `changes`, `cp`, `autobranch`, submit, and PR regeneration do not require a managed
  slot.

**Current behavior**

The package includes Slots composition, but the behavior is localized: `autoslot` exists to
use Slots, and `land` recognizes managed-slot worktrees so it can avoid leaving stale slot
state. This is distinct from F4's avoidable use of the Slot Command Face for generic Graphite
inventory.

**Adopter scenario**

A repository adopts Flow but never uses managed slots. Its ordinary branch, submit, and land
workflows remain valid; only `autoslot`'s stated job is irrelevant. A repository that does use
Slots gets targeted cleanup rather than raw worktree deletion.

**Disposition: Document**

Treat Slots as a command-scoped integration. The README now makes `autoslot`'s dependency and
land's conditional cleanup behavior explicit; it does not add Slots to the package-wide
requirements list.

**Next action**

No genericization code is required for this finding. Keep Slots access through its Capability
API rather than private imports or a hidden CLI hop.

### F8 — Submit topology parses human-facing Graphite display output

**Evidence**

- `ts/packages/capabilities/flow/src/submit/submit-pr-metadata-prewrite.ts` runs
  `gt log --stack --reverse --no-interactive`, parses its branch glyph/text layout in
  `parseGtLogStack()`, then runs `gt branch info` and parses `Parent:` and PR links in
  `parseParentBranch()` / `parseExistingPrFromBranchInfo()`.
- `ts/packages/capabilities/flow/src/submit/gt-output.ts` extracts GitHub PR URLs from
  Graphite output.
- The repo convention in `docs/conventions/graphite-dependency-boundary.md` forbids parsing
  `gt log` and `gt branch info` display output for machine topology decisions and points to
  Graphite plumbing or structured stack facts instead.

**Current behavior**

Submit's metadata prewrite and upstack detection depend on Graphite's presentation format,
including glyphs, labels, and embedded PR URLs. A Graphite CLI display change can alter which
branches Flow believes are in scope before it amends commit metadata.

**Adopter scenario**

An adopter runs a newer Graphite version that changes `gt log` glyphs or `gt branch info`
labels. Core `gt submit` still works, but Flow cannot build its submit plan or may misclassify
new versus existing PR branches.

**Disposition: Resolve**

This is an avoidable machine-contract dependency and violates the repository's established
Graphite boundary. Use plumbing/structured Graphite facts and GitHub PR lookup for identity;
do not merely broaden display regexes.

**Next action**

Size the replacement alongside F4 so Flow has one coherent Graphite topology source. Preserve
existing submit-plan domain types and fake-driven tests while changing only the real adapter.

### F9 — Submit failure interpretation relies on bounded CLI prose heuristics

**Evidence**

- `ts/packages/capabilities/flow/src/submit/cli-prose-heuristics.ts` is the designated module
  for matching Git, Graphite, and GitHub text such as restack-required, trunk-out-of-date,
  remote-updated, no-current-PR, empty-branch, and conflict messages.
- `submit/submit-detect.ts` and `submit/submit-gateway.ts` map those matches into typed failure
  causes and otherwise retain an unknown failure path.
- Git conflict classification supplements prose with porcelain/unmerged-file probes.
- Unknown submit failures retain raw output and can be model-interpreted rather than being
  treated as a known deterministic cause.

**Current behavior**

Flow's enhanced recovery guidance is version-sensitive, but prose mismatch degrades to an
unknown failure rather than changing successful submit execution. The heuristics are
centralized and partly corroborated with Git plumbing.

**Adopter scenario**

A Graphite release rewords its restack message. Flow reports the raw/unknown failure instead
of offering its specialized restack path, while the underlying repository remains unchanged.

**Disposition: Park**

The risk is real, but the audit found no stable structured Graphite failure envelope that can
replace every classification. A broad failure-protocol project would exceed this Objective's
bounded adopter work. Do not extend prose matching for the new submit-check recovery path;
that path has the dedicated stable Flow marker contract.

**Next action**

Keep the heuristics isolated and preserve unknown-failure fallback tests. Reopen only when a
stable Graphite machine surface exists or a concrete adopter/version incompatibility appears.

### F10 — The PR-description default prompt bypasses descriptor/catalog declaration

**Evidence**

- `ts/packages/capabilities/flow/src/ns/extension.ts` defines
  `flow.submit.pr-description` as an override prompt point but does not set its descriptor
  `default`.
- `ts/packages/sdk/src/project-config/points.ts` likewise omits a default path from the
  duplicated built-in definition.
- `ts/packages/capabilities/flow/src/submit/pr-description.ts` manually constructs a fallback
  point definition with `./prompts/pr-description-default.md`, then falls back again to an
  imported prompt constant when normal catalog resolution reports no source.
- ADR 0031 and `docs/guides/points.md` define descriptor-declared prompt defaults as the
  introspectable platform mechanism.

**Current behavior**

Generation gets a generic built-in prompt, but `ns extension point
flow.submit.pr-description` cannot consistently report that package default from the normal
catalog. Flow has a bespoke prompt-resolution branch despite promising point-catalog
customization.

**Adopter scenario**

An adopter inspects the point before overriding it. The catalog reports no active default,
while the command silently uses one; debugging and documentation disagree about the effective
prompt source.

**Disposition: Resolve**

Declare the package-relative default in the Flow descriptor and mirrored built-in definition,
then let normal catalog resolution own source selection. Preserve the environment development
override and repo installation precedence.

**Next action**

Implement with the audit-driven genericization slices, with catalog-detail and prompt
resolution tests proving the same default source.

### F11 — First-party point definitions are duplicated

**Evidence**

- `ts/packages/capabilities/flow/src/ns/extension.ts` declares Flow points for descriptor
  discovery.
- `ts/packages/sdk/src/project-config/points.ts`, `builtInPointDefinitions`, repeats them for
  the preinstalled catalog.
- The Objective already records this as descriptor-contract debt and requires the new recovery
  point to land in both places atomically.

**Current behavior**

Every point change can drift between installed first-party behavior and project-descriptor
inspection. This is platform-wide preinstalled-descriptor architecture, not an ns-repo
consumer assumption unique to Flow.

**Adopter scenario**

A new point is added to only one list. Depending on how Flow was loaded, the adopter sees a
different catalog and may get an installed-but-undefined diagnostic.

**Disposition: Park**

Consolidating first-party descriptor metadata belongs to the broader descriptor/preinstalled
catalog direction. This Objective should not invent a Flow-only registration path.

**Next action**

For the recovery slice, update both definitions and test parity. Track structural
consolidation outside this Objective when the owning descriptor direction schedules it.

### F12 — README command inventory omitted `squash-stack`

**Evidence**

- `ts/packages/capabilities/flow/src/ns/extension.ts` exports the public
  `ns flow squash-stack` command.
- `ts/packages/capabilities/flow/src/pi/ns-extension.ts`, `NS_FLOW_COMMANDS`, mirrors it as
  `/ns:flow:squash-stack`.
- The README draft claimed to list every Flow command but omitted it.

**Current behavior**

An adopter reading the canonical contract cannot discover a shipped mutating Graphite command
or its clean-worktree behavior.

**Adopter scenario**

A repository evaluates Flow from the README and concludes it has no stack-wide squash command,
or invokes it without understanding that it rewrites each branch in the current stack.

**Disposition: Document**

The README draft now includes the command. F4 remains the separate implementation finding for
its hidden Slot Command Face dependency.

**Next action**

Keep the descriptor, Pi mirror inventory, command-backed skills, and README command table in
parity.

## Verified boundaries that should remain

- **Graphite-native identity:** direct Graphite dependency is explicit in command names/help
  and is the product contract, not a genericization defect.
- **GitHub backend:** PR description, submit verification, and land use GitHub deliberately;
  the README already names GitHub as the backend.
- **Consumer pre-submit checks:** this repository installs `just` only in `ns.toml` at
  `flow.submit.pre`; the Flow package does not hardcode `just`.
- **No recovery-skill leak on trunk:** `code-just-fix` does not occur in the Flow package. The
  existing `.pi/extensions/just-fix.ts` is a separate consumer-side `/just` workflow.
- **PR-description customization:** repo prompt policy is already installed through
  `flow.submit.pr-description` or its supported development override; F10 concerns default
  introspection, not the existence of the customization seam.
- **Pi optionality:** Flow's CLI implementation does not import Pi. Pi adapters live under the
  `pi` subpackage, and `@nseng-ai/pi` is an optional peer dependency.
- **Capability API boundary:** downstream in-process consumers use `@nseng-ai/flow/api`; the
  audit found no adopter-facing requirement to expose private Flow modules.

## Resulting implementation slices

The four resolve clusters are independently meaningful but should reuse common seams where
appropriate:

1. **Repository identity:** configured trunk protection (F2) and remote/upstream discovery
   (F3).
2. **Graphite machine facts:** replace Slot Command Face inventory (F4) and Graphite display
   parsing (F8).
3. **Pi ownership:** move repo-owned code-workflow surfaces out of Flow (F5).
4. **Point default fidelity:** catalog-declare the PR-description default (F10).

The parked compatibility concerns (F9, F11) remain explicit and must not silently expand those
slices.
