# TypeScript Capability Porting Playbook

Reusable guidance extracted from the completed `pr-address`, `brmem`, `handoff`, `areg`, `objective`, and `slot` TypeScript cutovers. This is evidence from production migrations, not a framework-first template: later capability subobjectives should apply the shape deliberately and record any divergence.

## 1. Inventory public contracts before porting internals

Start each capability with a contract inventory that separates stable public behavior from incidental Python implementation detail.

Classify at least:

- Skill instructions and command snippets agents execute.
- Standalone CLI and plugin surfaces, including hidden `exec` commands and `--format json` envelopes.
- JSON schemas, payload artifact layouts, golden fixtures, wrapper scripts, config entry points, and safety guarantees.
- External-system behaviors such as git/GitHub reads, live mutations, publishing, or no-push guarantees.

`pr-address` showed why this matters: durable contracts included its skill/CLI/JSON/payload/mutation-safety behavior, while several click/parser details and Python module boundaries were incidental or intentionally replaced. `brmem put` reinforced the same rule: Python runtime/parser constraints, such as stdin being reserved for JSON request input, must be classified separately from durable storage and output contracts before TypeScript preserves them.

For git-backed state capabilities, storage contracts outrank Python module shapes. `brmem` treated `refs/brmem/base|ns/...` Snapshot Refs, branch `/` to `---` encoding, Entry Locator shape, Entry Key and Namespace rules, content limits, exit codes, and JSON envelopes as durable contracts even while replacing the implementation language and package layout.

`handoff` showed the same rule for consumer workflows over a storage layer: durable contracts included the Branch Memory namespace/key shape, Handoff Slug semantics, Branch State values, markdown table shape, JSON fields, stdout/stderr separation, and Pi/skill expectations, while Python package layout and the historical `asdl handoff` plugin path were incidental after inventory found no active user-facing usage.

`areg` broadened inventory beyond command bytes into managed repository artifacts. Durable contracts included `.agents/skills` / `.claude/skills` layouts, `skills-lock.json`, `asdl.toml` `[areg].agents`, legacy `areg.json` fallback where still supported, managed instruction blocks, `.pi/settings.json` replacement state, Codex sidecar files, hidden `exec skillx` envelopes, and external `npx skills` / `gh api` boundaries. Legacy command-conversion spelling was reclassified into the flattened `areg skill apply|list|show` surface by the child Objective before final cutover, so inventory can intentionally retire obsolete user paths when the Objective records that decision.

`objective` showed the same pattern for checked-in Markdown state: durable contracts were active/archive Objective roots, closure marker semantics, hidden `objective exec` skill commands, first-party Pi/CCC JSON consumers, and the standalone `objective` command. The `asdl objective` plugin path was retired rather than ported after inventory found no active callers. Objective-local legacy machine-output projections were acceptable short-lived migration debt during Python deletion, but once consumers were coordinated, Objective moved to TS-native camelCase JSON and canonical Clinkr result schemas directly.

`slot` added the first OS/worktree/shell-coupled inventory. Ports with host state must inventory filesystem layout and ambient environment alongside command bytes: `~/.slots` repo/worktree paths, parent-shell `SLOT_CD_DIRECTIVE_FILE` protocol, rc-block markers and idempotency, clipboard tri-state outcomes, hidden exec JSON surfaces, Graphite boundary rules, and host shell behavior. Treat these as durable contracts when installed wrappers or live skill/agent consumers depend on them, even if the Python package layout disappears.

## 2. Port in vertical slices

Prefer one small deterministic operation first, then expand through adjacent surfaces only after seams are proven.

A useful sequence from `pr-address` was:

1. Contract inventory and package boundary.
2. Minimal command runtime, schema, envelope, and JSON-input seams.
3. A deterministic first operation.
4. Validation and planning operations on the same seams.
5. Payload/artifact helpers.
6. Read-only git/GitHub gateway operations.
7. Mutation builders and fake-backed mutation helpers.
8. Wrapper, public CLI, plugin, and distribution cutover.
9. Python fallback retirement and package deletion.
10. Playbook feedback into the umbrella Objective.

Future ports do not need the exact operation order, but they should keep each slice reviewable and contract-backed. When storage interoperability is the central risk, as it was for `brmem`, prove storage/gateway parity before broad operation work, then expand operations on that seam. When the capability mutates managed project files, as `areg` does, prove planning, fake-backed mutation, path/symlink safety, dry-run behavior, and deletion-confirmation gates before defaulting the TypeScript implementation.

For broad skill-management CLIs like `areg`, a useful variation is: hidden deterministic helpers first, then read-only validation, then planning/mutation commands, then artifact-reconciliation commands, and only after parity evidence, caller/docs cutover plus Python deletion. This keeps high-risk project-file mutation behind fake-driven seams before it becomes the default implementation.

## 3. Keep seams local until a second consumer proves reuse

Do not framework-first a capability port. Add package-local runtime, payload/reference, and adapter seams when only one capability needs them. Move only repeated, stable gaps into shared TS foundations such as `@asdl/clinkr` or `@asdl/core`.

`pr-address` kept `loadOperationPayload` and the payload/reference policy package-local after cutover. Framework work moved only when the shell migration exposed reusable clinkr gaps such as strict integer parsing, `--format` choices, and schema-document routing. `brmem` likewise kept ref/blob/tree plumbing package-local; shared shell-out helpers and machine-envelope parsing moved only after repeated CLI-backed consumers proved the need.

`handoff` promoted only one framework seam: first-class `renderMarkdown` support in `@asdl/clinkr`, because the Handoff markdown table was a durable public contract that the existing human renderer could not preserve. It kept per-entry timestamp git plumbing package-local and reused public `@asdl/brmem` validation/ref-layout helpers only where they removed duplication without turning Handoff into a native storage-layer implementation. `areg` promoted only a small `@asdl/clinkr` final-variadic positional extension needed to represent `apply <kind> <skill...>` directly; skill-lock parsing, managed-block editing, project-file mutation, and skill-layout validation remain package-local until a second consumer proves reuse. Do not add shared framework concepts solely to emulate a Python-only precondition; if TypeScript's runtime does not share the precondition, prefer an explicit compatibility reclassification with tests and an Objective update.

`areg` kept skill-lock parsing, project-config parsing, managed-block planning, Pi/Codex artifact reconciliation, and `npx skills` orchestration package-local even after several internal `areg` commands reused them. The only shared extraction was a small `@asdl/clinkr` variadic-positional extension, because the command shape itself exposed a framework gap. Treat repeated use inside one package as local evidence; wait for a second package before promoting product-specific skill/project seams.

`slot` kept git-worktree, shell-integration, rc-block, and clipboard seams package-local even though they are substantial. Do not promote a shared `@asdl/core` git-worktree or shell-integration abstraction from one OS-coupled port alone; record second-consumer criteria instead. Plain `slot` commands also stayed Graphite-free, while `slot gt` and hidden `slot gt exec` may use Graphite because the command path names that dependency explicitly.

## 4. Use fake-driven gateways and parity evidence

External boundaries should be gateway-shaped and fake-testable before real adapters become load-bearing.

Prefer:

- In-memory or scripted fakes for git, GitHub, filesystem, process, clocks, and payload stores.
- Scenario tests for public CLI behavior.
- Golden fixtures where exact bytes are a durable contract.
- Structured parity where formatting or key order is not contractually meaningful.
- Limited safe real-adapter smoke checks only when they de-risk local environment or API assumptions.

`pr-address` preserved byte parity for payload artifacts and stable machine envelopes, but accepted structured parity or deliberate divergence for some schema/help/usage surfaces. `brmem` combined fake tests, real-git tests, and temporary cross-language parity probes; those probes were valid migration evidence and were deleted once TypeScript became default and the Python reference was deleted. `handoff` combined fake gateway scenarios with limited real `brmem`/real-git smoke tests to prove the consumer CLI still worked against actual Branch Memory refs after the Python fallback disappeared. `areg` used fake-driven gateways for host-tool checks, GitHub listing, `npx skills`, project inspection, filesystem mutation plans, prompts, and skill-artifact reconciliation, plus focused real-adapter tests for symlink/path revalidation; project-file mutation should not become default until both fake behavior and targeted real safety facts are covered.

`slot` showed the extra evidence needed for shell-installed CLIs. Tests for shell/completion install must redirect `HOME`, rc files, and directive files so validation never mutates the operator's real shell. Real-shell parity belongs in a deliberate throwaway harness, not ordinary test setup. JSON mode must suppress parent-shell `cd`, including hidden/directive-file side effects. Static TypeScript completion can intentionally diverge from Click `_SLOT_COMPLETE` when there is no TS analog, but marker/idempotency/user-visible completion behavior must be preserved and the divergence must be documented.

## 5. Retire fallback intentionally

Python fallback should be short-lived after TypeScript parity is proven.

Before deletion:

- Audit every command and user-facing invocation path.
- Remove active callers, plugin entry points, docs, config, tests, and fallback routers in the same retirement window.
- Decide and document rollback/reference evidence when the in-repo Python source is deleted; this may be external or an explicit in-repo pre-deletion commit for private packages.
- Broaden validation when package deletion touches workspace config or shared tests.

`pr-address` retired the `asdl pr-address` plugin instead of porting it, removed the TypeScript unknown-operation Python router, deleted `packages/asdl-pr-address`, moved the golden corpus under the TS package, and kept rollback as the frozen external PyPI artifact `asdl-pr-address==0.1.1`. `brmem` had no plugin to retire; its post-deletion reference is the recorded in-repo commit `44c3e9992b424c4b174ccaeb9f4567bb8f611dc1`, the last pre-deletion Python package source. `handoff` explicitly retired the `asdl handoff` plugin after grep evidence showed no active user-facing usage, deleted `packages/asdl-handoff`, and recorded rollback/reference commit `c7953b640c94fad4182df35c277fe19dfbe5eca7`.

`areg` showed the deletion checklist for repo-local caller cutover: update just recipes, CI paths that invoke those recipes, skill instructions, install recipes, and hidden helper guidance; prove the runtime reports TypeScript; grep for active `uv run areg`, `areg.cli:main`, and `packages/areg` callers; then remove Python workspace wiring and package files in the same retirement window. It had no top-level `asdl` plugin to retire; repo-local callers moved to the TypeScript source CLI/shim, tracked `packages/areg` Python files were deleted, and rollback/reference evidence is in-repo commit `18f25c34720f2422881afe93084d569f0d071dfd`, the parent of deletion commit `eb5785fc3`.

`objective` confirmed that a Python plugin can be retired without a replacement when active callers use the standalone CLI. Its retirement window removed the plugin smoke test, root workspace/source/dev/plugin/test/build/Ruff/ty references, install/docs references to `uv tool install asdl-objectives` and `asdl objective`, and the `packages/asdl-objectives` tree. Rollback/reference evidence is in-repo commit `1b1bb1fa44ad`; restoring the deleted Python implementation also requires restoring the removed root manifest/test/build references. A later Objective JSON cleanup showed that retained compatibility projections should be burned down promptly once current consumers can migrate: Objective now emits camelCase `data` keys, includes `read-objective` Markdown bodies in ok JSON, and relies on canonical result schemas instead of package-local legacy projection.

`slot` added deletion evidence for a port that previously had host-installed shell behavior and a Python editable-tool fallback. Deletion must include source-shim distribution evidence (`just install-slot` / `install-tools`), stale editable-tool removal or absence, docs and active config cleanup, live hidden-exec consumer support, and a rollback/reference commit; for `slot`, the deleted `packages/asdl-slots` reference is commit `9164ef9ea562`.

## 6. Treat distribution as a product decision

Do not inherit either the old Python `uvx` distribution model or `pr-address`'s run-from-source shim by default. Decide distribution from actual consumers.

For `pr-address`, checkout-free bundling and npm publishing were explicitly dropped. The accepted installed CLI model is the run-from-source shim installed by `just install-pr-address`, which runs the checkout's TypeScript CLI and may require `ts/node_modules`.

For `brmem`, actual consumers likewise did not require npm publishing or checkout-free bundling. The accepted installed model is the run-from-source TypeScript shim installed by `just install-brmem` and `install-tools`.

For `handoff`, the same installed model was sufficient for the standalone CLI and Pi/skill consumers, but cutover exposed an extra packaging lesson: `just install-handoff` must remove stale project-venv `handoff` console scripts so an activated Python development environment cannot shadow the TypeScript shim.

For `areg`, repo-local TypeScript source invocation plus the `just install-areg` / `install-tools` shim was accepted for active repo development and skill-management use. `just install-areg` also removes stale project-venv `areg` console scripts, and closure verification showed `areg --runtime` / `uv run areg --runtime` resolving to TypeScript in this checkout. External npm-style execution or checkout-free packaging remains a future product decision rather than a reason to keep Python alive.

These are capability-specific evidence for completed ports, not blanket requirements for `objective` or later ports; later ports still need their own consumer-backed distribution decision.

For `areg`, repo-local TypeScript source invocation plus the `install-areg` shim was enough for current callers after skills and just recipes were updated; external installed use beyond a checkout remained parked rather than keeping Python `uvx areg` alive. Treat "delete Python now, park external distribution" as valid only when actual callers are repo-local and the parked distribution question is recorded clearly.

For `objective`, the same source-shim model now covers a formerly Python-only standalone CLI with checked-in Markdown storage. `just install-objective` installs the TypeScript shim and removes stale project-venv `objective` scripts so an activated Python development environment cannot shadow the TypeScript command; `install-tools` depends on that shim instead of installing `packages/asdl-objectives` as an editable uv tool.

For `slot`, source-shim distribution was accepted only after shell/completion and parent-shell navigation parity were proven. The deletion window confirmed `just install-slot` / `install-tools` route through the TypeScript source shim, active `uv tool install asdl-slots` references were removed, and stale Python fallback paths were scrubbed or documented as historical provenance.

## 7. Record Semantic Updates at decision points

Write Objective updates for meaningful decisions, compatibility changes, de-risking evidence, and reusable lessons. Avoid ceremonial status pings.

Good update subjects include:

- Contract inventory and durable/incidental classifications.
- Distribution or plugin compatibility decisions.
- Proven parity or accepted divergence.
- Fallback-retirement gates and deletion evidence.
- Repeated seams that should or should not move into shared foundations.

Do not rewrite old updates to make the migration story cleaner; append new evidence.

## 8. Keep Objective boundaries clean

Capability-specific consumer migration belongs in that capability's subobjective. Shared provider/framework work belongs in `ts-cli-foundation` or another foundation Objective. The umbrella Objective owns sequencing, migration-ledger status, migration-debt visibility, and this cross-cutting playbook.

When a capability discovers a reusable gap, record whether it is still local evidence or belongs in a shared Objective. The `pr-address` port deliberately avoided promoting package-local payload/reference machinery into `@asdl/clinkr` until another non-`pr-address` consumer proves the same seam.
