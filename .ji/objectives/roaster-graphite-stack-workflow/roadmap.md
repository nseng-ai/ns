# Roadmap

## Work

- [x] Add the visible stack CLI skeleton, profile resolver, and sample profile.
  - Thesis: `roaster stack run <profile-slug>` becomes a discoverable, Graphite-explicit user-facing surface with safe profile lookup and no deterministic markdown-profile parsing.
  - Expected implementation branch/PR: `roaster-stack/cli-profile`.
  - Depends on: existing roaster CLI/plugin conventions only; this should not introduce Graphite, GitHub, Branch Memory, or agent mutation gateways beyond help text and request shape.
  - Likely files: `packages/roaster/src/roaster/cli/roaster/group.py`, `packages/roaster/src/roaster/cli/roaster/stack/__init__.py`, `packages/roaster/src/roaster/cli/roaster/stack/group.py`, `packages/roaster/src/roaster/cli/roaster/stack/run.py`, `packages/roaster/src/roaster/stack_profile.py`, `.roaster/profiles/thermonuclear-stack.md`, and `packages/roaster/tests/scenario/test_stack_cli.py`.
  - Request shape to consider: profile slug, `--target-branch`, `--target-pr`, repeated `--reviewer`, `--model`, `--harness`, `--base-ref`, `--dry-run`, `--new-run`, optional `--run-slug`, `--triage-prompt`, `--resolver-prompt`, and agent model control if supported.
  - Profile rules: slug is a single safe path segment; read `.roaster/profiles/<slug>.md` relative to repo root/cwd; return raw markdown path/content; do not parse headings or prose.
  - Sample profile should contain loose sections such as intent, reviewer guidance, triage guidance, batching guidance, stack ordering guidance, safety stops, resolver context, publication/lineage, and Branch Memory conventions. It must say roaster does not deterministically parse profile markdown.
  - Policy: direct execution after preview.
  - Evidence: standalone roaster CLI scenario tests cover top-level help listing `stack`, `roaster stack -h` mentioning Graphite/`gt`, valid sample profile resolution, invalid profile slug, and missing-profile failure.

- [x] Add stack domain models, slug helpers, and authoritative agent-output frontmatter parsing.
  - Thesis: roaster has typed contracts for stack requests/results, triage/resolver outputs, run manifests, dashboard rows, markers, slugs, and failure cases before orchestration depends on them.
  - Expected implementation branch/PR: `roaster-stack/contracts`.
  - Depends on: `roaster-stack/cli-profile` for public request shape only; keep this slice pure and gateway-free.
  - Likely files: `packages/roaster/src/roaster/stack_models.py`, `packages/roaster/src/roaster/stack_agent_output.py`, `packages/roaster/src/roaster/stack_slugs.py`, `packages/roaster/tests/unit/test_stack_agent_output.py`, and `packages/roaster/tests/unit/test_stack_slugs.py`.
  - Triage frontmatter schema should include `schema_version: roaster.stack.triage.v1`, summary, findings with `id`, `source_review`, path/line/severity/summary/details, `status: accepted | rejected | merged`, rationale, optional `merged_into`, `confidence: high | medium | low`, and `risk: mechanical | behavioral | architectural | speculative`; batches with slug/title/summary/finding IDs/dependencies/confidence/risk/resolver mandate/validation requirements.
  - Resolver frontmatter schema should include `schema_version: roaster.stack.resolver.v1`, `batch_slug`, `status: completed | failed | blocked`, summary, files changed, validation entries with command/status/output summary, and safety flags for unresolved conflicts, destructive changes, secrets/security sensitivity, validation evidence missing, and notes.
  - Parser rules: parse YAML frontmatter fences only; preserve markdown body as explanation only; reject missing frontmatter, invalid YAML, missing/unknown schema version, invalid enum values, duplicate finding IDs, duplicate batch slugs, unknown finding references, unknown batch dependencies, dependency cycles, accepted findings not assigned to a batch, resolver batch mismatch, failed validation, missing validation evidence, and safety flags.
  - Slug rules: validate profile/run/batch slugs separately from raw branch names; generate `<impl-branch-slug>/roaster/<run-slug>/<batch-slug>`; validate generated git/Graphite branch names; validate Branch Memory key segments and reject branch names that Branch Memory cannot encode, notably names containing `---`.
  - Policy: direct execution after preview.
  - Evidence: tests cover valid triage/resolver frontmatter, missing/invalid frontmatter, invalid enums, duplicate IDs/slugs, unknown references, dependency cycles, accepted finding not batched, validation omissions, safety flags, and proof that markdown body text/headings are non-authoritative.

- [x] Add Branch Memory run storage for roaster stack lineage.
  - Thesis: canonical run lineage is persisted under namespace `roaster-runs` on the original implementation branch, with centralized key construction and resume index behavior.
  - Expected implementation branch/PR: `roaster-stack/run-storage`.
  - Depends on: `roaster-stack/contracts` for profile/run/batch identities and Branch Memory-safe key segments.
  - Likely files: `packages/roaster/pyproject.toml`, optional `packages/roaster/src/roaster/gateways/roaster_runs/{gateway.py,real.py,fake.py}`, `packages/roaster/src/roaster/stack_workflow.py`, and focused run-storage tests using `FakeBranchMemoryGateway`.
  - Namespace: `roaster-runs`.
  - Canonical branch scope: original implementation branch, never generated roaster branches.
  - Keys: `indexes/<impl-branch-slug>/<profile-slug>.md`, `runs/<impl-branch-slug>/<profile-slug>/<run-slug>/manifest.md`, `runs/<impl-branch-slug>/<profile-slug>/<run-slug>/triage.md`, and `runs/<impl-branch-slug>/<profile-slug>/<run-slug>/batches/<batch-slug>/resolver.md`.
  - Optional future key: `runs/.../attempts/<batch-slug>/<attempt-slug>.md` if repeated attempts need more detail than the current resolver artifact.
  - Manifest frontmatter should record schema version, implementation branch/slug/PR, profile slug, run slug, status, dashboard comment id, triage key, batch statuses/branches/PRs/finding IDs/resolver keys, superseded batches, and rejected finding count.
  - Resume behavior: default reads the index and reuses latest run for implementation branch/profile; `--new-run` creates a semantic/ordinal slug such as `thermonuclear-stack-2`; explicit `--run-slug` is validated and documented.
  - Policy: direct execution after preview; ask first if this would require changing Branch Memory package behavior rather than using existing gateway/key validation.
  - Evidence: tests prove index, manifest, triage, and resolver keys; writes target the implementation branch only; generated branches do not receive canonical manifests; resume reads latest run; dry-run does not write; invalid Branch Memory branch/key cases fail clearly.

- [x] Add stack dashboard rendering and PR issue-comment publication.
  - Thesis: each roaster stack run owns one persistent dashboard comment on the implementation PR, updated in place with run, batch, finding, validation, and generated PR status.
  - Expected implementation branch/PR: `roaster-stack/dashboard`.
  - Depends on: `roaster-stack/contracts`; may consume run-storage locators but should remain separately reviewable from Branch Memory writes.
  - Likely files: `packages/roaster/src/roaster/stack_dashboard.py`, `packages/roaster/src/roaster/stack_markers.py`, dashboard unit tests, and possibly a small publication helper wrapping existing `PRGateway` comment methods.
  - Dashboard marker recommendation: `<!-- roaster-stack-dashboard {"version":1,"profile_slug":"thermonuclear-stack"} -->`.
  - Dashboard content: heading `## roaster stack · <profile-slug>`, target implementation branch/PR, run slug, Branch Memory namespace/key pointer, reviewers run, accepted/rejected/superseded/submitted/failed/blocked counts, batch table with slug/title/summary/confidence/risk/finding IDs/generated branch/generated PR/resolver-validation status, rejected findings summary, and capped activity log if implemented.
  - Publication behavior: create/update dashboard before generated PRs; update after each batch PR creation/submission or at end; zero accepted batches still publish/update dashboard, store manifest, and exit successfully.
  - Use `PRGateway` for target resolution and issue-comment creation/update; do not use inline review/thread mutation paths.
  - Policy: direct execution after preview using fakes; ask first before adding broad GitHub gateway capabilities unrelated to issue-comment create/update/find or narrow PR body marker support.
  - Evidence: tests show marker rendering/parsing, new comment creation, existing comment update, zero-accepted-batch rendering, activity/log preservation if implemented, dashboard failure before branch mutation is fatal, and no inline review/thread mutation calls.

- [x] Add review collection and the triage agent-runner boundary.
  - Thesis: the workflow can collect findings from explicit or matching roaster reviewers and feed them, with profile guidance, into a fake-driven triage/verifier agent boundary.
  - Expected implementation branch/PR: `roaster-stack/triage-runner`.
  - Depends on: `roaster-stack/contracts`; integrates existing review workflow behavior but should not implement resolver mutation yet.
  - Likely files: `packages/roaster/src/roaster/stack_workflow.py`, `packages/roaster/src/roaster/gateways/agent_runner/{gateway.py,real.py,fake.py}`, `packages/roaster/src/roaster/prompts/stack_triage.md`, and fake-agent tests.
  - Reviewer behavior: repeated `--reviewer` runs exactly those keys; otherwise call `list_matching_reviews(...)` and run selected keys with `requested_format="findings"`; preserve reviewer usage metadata in manifest when available.
  - Recommended zero-reviewer behavior: if no explicit reviewer was requested and matching selects none, return/publish zero-finding success with clear manifest/dashboard text; explicit missing/failing reviewers are non-ideal failures.
  - Triage prompt must instruct the agent to inspect findings/profile guidance, reject false positives, merge overlapping findings, assign stable finding IDs/batch slugs, rank dependency-first then confidence/risk, and output authoritative `roaster.stack.triage.v1` YAML frontmatter.
  - Gateway request should distinguish `kind: triage | resolver`, prompt override path/default resource, model, cwd, input markdown, and allowed tools. Fake records requests and returns seeded markdown.
  - Real adapter can start from existing Claude Code invocation patterns but must be a separate boundary; triage is read-only, resolver requires verified mutating tool support.
  - Policy: direct execution after preview; ask first if choosing a real mutating runner design becomes a blocking architectural decision.
  - Evidence: tests cover explicit reviewer selection, default matching reviewer selection, no matching reviewers, reviewer failure behavior, prompt override threading, profile guidance inclusion without parsing, fake triage output handling, and unavailable real runner failure messaging.

- [x] Implement dry-run stack orchestration and CLI rendering.
  - Thesis: `roaster stack run ... --dry-run` exercises profile resolution, target resolution, reviewer collection, triage planning, manifest/action shaping, and deterministic human/JSON rendering without mutating Branch Memory, GitHub, Graphite, branches, or external systems.
  - Expected implementation branch/PR: `roaster-stack/dry-run`.
  - Depends on: prior CLI/profile, contract, run-storage, dashboard, and triage-runner data shapes; it should prove orchestration without enabling mutation.
  - Likely files: `packages/roaster/src/roaster/stack_workflow.py`, `packages/roaster/src/roaster/cli/roaster/stack/run.py`, result renderers, and `packages/roaster/tests/scenario/test_stack_cli.py`.
  - Dry-run may run reviewers and the triage agent because those are non-mutating in this design.
  - Dry-run must not call Branch Memory `put`, PR dashboard add/update, Graphite checkout/create/modify/submit, generated PR body editing, or external write operations.
  - Human output should show target implementation branch/PR, profile slug/path, run slug, reviewers/finding counts, accepted/rejected/superseded counts, planned batches/actions, and locators that would be used.
  - JSON output should be deterministic and include target/profile/run/reviewer/finding/batch/action/locator fields through the existing Clinkr envelope style.
  - Policy: direct execution after preview.
  - Evidence: dry-run tests assert no mutating gateway calls, deterministic JSON envelope fields, useful human output, clear target/profile/run/reviewer/batch summaries, and clear failure rendering for invalid profile or invalid triage output.

- [x] Add the Graphite stack gateway and generated branch/PR marker support.
  - Thesis: all Graphite-specific stack reads and mutations sit behind a roaster-specific gateway that can attach generated resolution branches above the target implementation stack while preserving lineage to the original target branch/PR.
  - Expected implementation branch/PR: `roaster-stack/graphite-gateway`.
  - Depends on: `roaster-stack/contracts` plus marker/run-storage shapes; do not wire the full resolver loop in this slice.
  - Likely files: `packages/roaster/src/roaster/gateways/graphite_stack/{gateway.py,real.py,fake.py}`, `packages/roaster/src/roaster/stack_markers.py`, generated branch name helpers, PR marker/body helpers, gateway fake tests, and possibly a narrow PR body publication gateway.
  - Graphite gateway operations should cover reading current/target stack, checking out target branch/tip, creating generated branches with `gt create <branch> -m "roaster: <batch title>"`, updating existing generated branches with `gt modify ...`, and submitting via `gt submit --no-interactive`.
  - Target logic: default to current Graphite branch/PR; allow `--target-branch` and/or `--target-pr`; if target implementation is itself a Graphite stack, attach generated resolution PRs above the topmost descendant while storing lineage against the originally targeted branch/PR.
  - Generated PR marker recommendation: compact JSON HTML comment containing version, implementation branch/PR, profile slug, run slug, batch slug, finding IDs, Branch Memory namespace, Branch Memory branch, and manifest key.
  - Human generated PR body should include source implementation PR/branch, profile/run, batch summary/finding IDs, validation summary, and dashboard pointer. If Graphite submit cannot set body, add a narrow gateway/body-editing path rather than ad hoc `gh` calls.
  - Policy: direct execution after preview using fakes and guarded real code; ask first before live Graphite mutation smoke tests or destructive stack repair behavior.
  - Evidence: tests cover stack-tip resolution, generated branch naming, branch-exists behavior, create/update/modify/submit call recording, dependency-first then confidence/risk ordering, generated marker rendering/parsing, PR body update path or documented fallback, Graphite failure propagation, and that runtime Graphite dependency is confined to the explicit `roaster stack` contract.

- [x] Implement resolver-loop mutation orchestration and hard safety stops.
  - Thesis: non-dry-run orchestration persists triage, publishes the dashboard, runs one resolver agent per accepted batch at the current stack tip, enforces structured validation/safety reports, creates or updates generated branches, updates manifest/dashboard status, submits the generated stack, and stops safely on failure.
  - Expected implementation branch/PR: `roaster-stack/resolver-loop`.
  - Depends on: all prior stack workflow/gateway slices; this is where the mutation steelthread is connected end-to-end behind fakes.
  - Likely files: `packages/roaster/src/roaster/stack_workflow.py`, `packages/roaster/src/roaster/prompts/stack_resolver.md`, agent runner fake, Branch Memory storage, dashboard publication, Graphite stack gateway fake.
  - Suggested phases: load profile; resolve target PR/branch; resolve attach tip; resolve/reuse/create run slug; run reviewers; run triage; parse/order batches; dry-run return if requested; persist triage/manifest; publish dashboard; if zero batches mark complete-no-batches; checkout stack tip; for each batch run resolver, parse resolver frontmatter, enforce validation/safety, create/update generated branch, persist resolver/manifest, update dashboard; submit generated stack; update manifest/dashboard final status.
  - Hard stops: invalid profile/slug/key/branch; unresolved target; Graphite stack read/untracked failure; explicit reviewer missing/failing; invalid triage; duplicate/unknown/cyclic finding or batch references; resolver status not completed; failed/skipped/absent validation when evidence is required; safety flags; Graphite create/modify/submit failure; dashboard failure before mutation.
  - Rerun behavior: stable batch slug identifies generated PR branch; matching existing open generated branch updates in place; new slug creates new branch; removed batch is marked superseded in manifest/dashboard and not deleted.
  - Policy: direct execution after preview; ask first before broadening rerun semantics beyond safe update/reuse/fail behavior.
  - Evidence: tests cover zero accepted batches, rejected-only triage, resolver completed/failed/blocked statuses, failed validation, missing validation evidence, safety flags, Branch Memory/dashboard update phases, submit gateway invocation after all successful batches, submit failure status, existing matching batch update, and removed/superseded batch recording where implemented.

- [x] Add guarded real adapters, README documentation, plugin smoke coverage, and closeout validation.
  - Thesis: the steelthread is usable and inspectable: default prompts are packaged, real adapters fail clearly or run through guarded boundaries, docs explain behavior and safety limits, and plugin/package checks show the feature is integrated.
  - Expected implementation branch/PR: `roaster-stack/docs-closeout`.
  - Depends on: all prior slices; this should not add new core workflow semantics except guarded real-adapter/documentation details discovered during implementation.
  - Likely files: `packages/roaster/src/roaster/gateways/agent_runner/real.py`, `packages/roaster/src/roaster/gateways/graphite_stack/real.py`, `packages/roaster/README.md`, `packages/roaster/pyproject.toml`, prompt package resources, and `tests/scenario/test_plugins.py`.
  - README should cover quickstart, Graphite requirement and generated auto-submit behavior, loose `.roaster/profiles/<slug>.md` guidance, default and override prompt files, Branch Memory namespace/keys, dashboard-only MVP, no inline comments/thread resolution, rerun/resume/default behavior, `--new-run`, `--dry-run`, safety stops, manual dry-run smoke, and real mutation smoke only on disposable branches/PRs.
  - Package resources should include `stack_triage.md` and `stack_resolver.md` and tests/importlib checks should ensure they are packaged.
  - Plugin smoke should verify roaster plugin discovery still works and `roaster stack --help` is mounted.
  - Policy: direct execution after preview for source/docs/tests; do not run live external mutation smoke tests or submit implementation PRs without explicit human confirmation.
  - Evidence: targeted roaster tests pass, roaster plugin smoke covers `stack`, README documents quickstart/dry-run/manual-smoke/Branch Memory/dashboard/rerun/safety behavior, package resources include stack prompts, unavailable-tool paths are tested or manually inspected, and broader checks are run when practical.

## Parked

- Final-product polish beyond the steelthread MVP.
- Remote CI waiting, monitoring, or mergeability dashboards.
- Inline GitHub review comments and original review-thread mutation/resolution.
- Deterministic parsing of profile markdown headings or prose.
- Rich profile schema beyond explicit future YAML/frontmatter or CLI flags.
- Full automatic stack surgery for complex reruns where generated branch topology changed substantially.
- Required live disposable mutation smoke tests as Objective completion evidence.
- Automatic submission of this Objective's implementation PRs by `objective-stack-impl`.
- Any broad `pr-address` integration or user-facing contract outside `roaster stack`.
- Synthetic/debug-only triage input for easier manual mutation smoke, unless explicitly promoted later.
