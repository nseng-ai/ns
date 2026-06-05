# Roaster Graphite Stack Workflow

## Thesis

Build an execution-ready roaster feature that turns local automated review findings into an ordered Graphite resolution stack through:

```bash
roaster stack run <profile-slug>
```

The north star is an end-to-end steelthread MVP: roaster resolves a loose profile, runs existing findings reviewers, asks a prompt-file-driven triage/verifier agent to accept/reject/merge/rank/batch findings, records canonical lineage in Branch Memory, publishes one persistent dashboard PR issue comment, runs a resolver agent per accepted batch, gates each batch on structured validation and safety evidence, creates or updates generated Graphite branches above the target implementation stack, submits that generated stack through Graphite, and leaves live/disposable smoke execution or human PR workflow outside the Objective unless explicitly requested.

This Objective exists so `objective-stack-impl` can implement the feature autonomously as a reviewable Graphite stack after preview confirmation, without relying on the earlier saved planned-branch document or Branch Memory handoff as hidden context.

## Scope

Implement the steelthread MVP for a visible user-facing command shaped like:

```bash
roaster stack run <profile-slug>
```

In scope:

- A visible `roaster stack` CLI group whose help explicitly names Graphite/`gt` because the command intentionally depends on Graphite stack semantics.
- Profile resolution from `.roaster/profiles/<profile-slug>.md`, with profile markdown treated as loose human/agent guidance and not deterministically parsed by headings or prose.
- A checked-in sample profile at `.roaster/profiles/thermonuclear-stack.md` explaining loose conventions.
- Reviewer selection from explicit `--reviewer` flags or existing standard/matching roaster reviewers by default; the profile may guide agents but does not deterministically select reviewers.
- Typed stack domain models for run requests/results, triage/resolver frontmatter, run manifests, dashboard rows, generated branch names, generated PR markers, and non-ideal failures.
- Deterministic YAML-frontmatter parsing for triage and resolver agent outputs. Markdown bodies are human explanation only and never authoritative for roaster decisions.
- Branch Memory run storage under namespace `roaster-runs` on the original implementation branch scope, with centralized key construction and validation.
- A persistent roaster-managed dashboard as a top-level PR issue comment on the target implementation PR.
- One generated Graphite PR per accepted resolution batch, appended above the original implementation PR/stack.
- Fresh resolver agent execution per accepted batch, sequentially from the current generated stack tip, with only that batch's mandate plus needed context.
- Hard safety stops before publishing a batch when validation fails, conflicts remain unresolved, destructive/security-sensitive changes are flagged, resolver status is not completed, or validation evidence is missing.
- Generated branch naming shaped like `<impl-branch-slug>/roaster/<run-slug>/<batch-slug>`.
- Hidden generated PR/body marker support or a narrow documented publication gateway path sufficient for later body updates.
- Rerun semantics that resume/update the latest roaster run for the same implementation branch/profile by default, create a fresh run with `--new-run`, reuse/update matching generated batch PR branches by stable batch slug, create branches for new batch slugs, and mark removed/superseded batches rather than deleting stack history.
- Dry-run orchestration that may run reviewers and triage but performs no Branch Memory writes, GitHub mutations, branch mutations, Graphite submissions, or external write operations.
- Mutation orchestration that, after non-dry-run confirmation, publishes the dashboard, persists lineage, runs one resolver per accepted batch, validates structured resolver reports, creates or updates generated Graphite branches, submits the generated stack with `gt submit --no-interactive`, and updates status artifacts.
- README documentation for the command, profiles, prompt overrides, Branch Memory lineage, dashboard behavior, dry-run behavior, rerun semantics, Graphite requirement, safety stops, and manual real smoke expectations.
- Scenario, unit, and gateway tests using fakes rather than `unittest.mock.patch` for core behavior.

The implementation should preserve existing roaster review behavior and current plugin discovery behavior while adding the new stack surface.

## Non-Goals

- Do not build the final polished product beyond the steelthread MVP.
- Do not wait for or monitor remote CI as part of the steelthread.
- Do not create inline GitHub review comments or resolve original review threads in the MVP.
- Do not mutate original GitHub review threads in this Objective.
- Do not deterministically parse profile markdown headings or prose. If reliable profile structure becomes necessary, add explicit YAML/frontmatter or CLI flags as a separately justified change.
- Do not make `pr-address exec` or another package the user-facing contract for this roaster workflow.
- Do not require autonomous real mutation smoke tests against live GitHub/Graphite resources for Objective completion.
- Do not automatically submit this Objective's implementation PRs from `objective-stack-impl`; human Graphite submission of the implementation stack remains a separate explicit user action. The product being built may auto-submit generated roaster stacks in its own command path.
- Do not introduce hidden stack ledgers, Branch Memory implementation plans, YAML registries, UUID task databases, or state machines for Objective execution itself.
- Do not store canonical roaster run manifests in repo-local `.roaster/runs` files; canonical run lineage belongs in Branch Memory.

## Completion Criteria

This Objective is complete when the steelthread MVP is implemented, tested, and documented such that a user can run `roaster stack run <profile-slug>` in dry-run mode safely and the non-dry-run path has fake-driven coverage plus guarded real gateway implementations.

Completion evidence should include:

- `roaster -h` and `roaster stack -h` expose the stack surface, and `roaster stack -h` names Graphite/`gt`.
- Missing and invalid profiles fail with clear non-ideal messages.
- `.roaster/profiles/thermonuclear-stack.md` exists and documents that profile markdown is loose guidance, not deterministic input.
- Request options include at least profile slug, `--target-branch`, `--target-pr`, repeated `--reviewer`, reviewer model/harness/base-ref controls as needed for existing roaster review reuse, `--dry-run`, `--new-run`, optional `--run-slug`, `--triage-prompt`, `--resolver-prompt`, and agent model control if supported.
- Triage and resolver YAML-frontmatter parsers reject missing frontmatter, invalid YAML, invalid schema versions, invalid enums, duplicate IDs/slugs, unknown references, dependency cycles, accepted findings not assigned to batches, missing validation evidence, and safety failures.
- Branch Memory storage helpers write/read only namespace `roaster-runs` on the original implementation branch scope and centralize all key construction.
- Branch names that cannot be encoded by Branch Memory, notably names containing `---`, fail early with clear errors before mutation.
- Dashboard rendering and publication helpers create/update one persistent PR issue comment and do not call inline review/thread mutation paths.
- Dry-run orchestration produces deterministic human/JSON output and performs no mutating gateway calls.
- Non-dry-run orchestration is fake-covered for review collection, triage, dashboard publication, Branch Memory writes, resolver execution, validation/safety hard stops, generated branch creation/update, generated PR marker/body handling or documented fallback, and submit gateway invocation.
- Graphite and agent-runner real adapters are guarded behind gateway boundaries and surface clear failures when local tools are unavailable.
- README documentation explains the steelthread behavior, safety boundaries, manual real-smoke procedure, and deferred non-goals.
- Relevant package-focused tests pass, plugin smoke covers the stack surface, and broader repo checks are run when practical for the touched files.

## Autonomous Implementation Context

### Settled design decisions from the planning session

Treat these as requirements unless the user explicitly reopens them:

1. The atomic generated unit is one PR per accepted resolution batch, not one PR per reviewer run or per individual finding.
2. Generated resolution PRs append above the original implementation PR/stack; the human-authored implementation stack is preserved as authored.
3. The product command auto-submits the ranked generated stack through Graphite, including speculative/thermonuclear batches, after local structured safety gates pass.
4. A separate triage/verifier agent accepts, rejects, merges, ranks, and batches findings before any implementation resolver runs.
5. Stack ordering is dependency first, then confidence/risk: required prerequisites lower, safer fixes lower, speculative thermonuclear changes higher/topmost.
6. The product surface is roaster-specific and visible: `roaster stack run <profile-slug>`.
7. Generated PR bodies should contain concise human lineage plus a hidden machine-readable marker; full lineage/manifests live in Branch Memory.
8. The implementation PR gets one aggregate roaster dashboard issue comment before generated fix PRs are created; the same comment is updated later with generated PR links/status.
9. Profiles live under `.roaster/profiles/<profile-slug>.md` and remain loose markdown guidance.
10. Reviewer selection is explicit flags or existing roaster matching/standard reviewer behavior, not deterministic profile parsing.
11. Each resolver receives only its batch manifest, relevant profile/prompt guidance, finding evidence, validation requirements, current stack tip, and repo inspection/edit permission. Do not pass full prior transcripts unless explicitly referenced.
12. Resolver agents choose local validation commands; roaster enforces that they report structured validation and safety evidence.
13. Rejected findings are persisted in Branch Memory with rationale; dashboard shows count/summary and optional compact details, not every rejected finding by default.
14. Zero accepted batches publish/update dashboard, store manifest, and exit successfully without generated PRs.
15. Matching batch slugs on rerun update existing generated PR branches in place; attempt history belongs in Branch Memory/dashboard, not in one follow-up PR per attempt.

### Existing roaster package facts to rely on

Relevant files and behavior:

- `packages/roaster/README.md` documents roaster as a markdown-defined local reviewer runner. Review definitions live under repo-root `reviews/` and use YAML frontmatter for reliable fields (`description`, optional `default_model`, optional `when_changed`) plus markdown instructions.
- `packages/roaster/pyproject.toml` currently names package `roaster`, requires Python `>=3.11`, depends on `click>=8.1.7`, `pyyaml>=6`, and `asdl-core`, exposes script `roaster = "roaster.cli.main:main"`, and has plugin entry point `roaster = "roaster.cli.plugin:build_roaster_plugin"`.
- `packages/roaster/src/roaster/cli/main.py` wraps `build_roaster_plugin()` through `build_standalone_cli`.
- `packages/roaster/src/roaster/cli/plugin.py` returns `AsdlPluginSpec(build_group=build_roaster_group, context_factory=build_roaster_context)`.
- `packages/roaster/src/roaster/cli/roaster/group.py` mounts current `review`, `harness`, and hidden `exec` groups; mount the new visible `stack` group here.
- `packages/roaster/src/roaster/context.py` currently has `RoasterCliContext` fields `catalog`, `diff`, `harness_runtime`, `pr_gateway`, and `cwd`. Add optional/defaulted stack-specific dependencies after existing fields, or introduce lazy stack dependency construction, so existing tests remain stable.
- `packages/roaster/src/roaster/workflow.py` has `run_review_by_key(...)`, `list_matching_reviews(...)`, and `resolve_harness(...)`; `run_review_by_key` already supports `requested_format="findings"` and returns `LocalReviewResult` or `RoasterFailure`.
- `packages/roaster/src/roaster/models.py` defines existing domain dataclasses and `RoasterFailure` variants, including existing findings models such as `ReviewFinding`, `FindingsReview`, `LocalReviewResult`, and `ReviewUsage`.
- `packages/roaster/src/roaster/harness/invocation.py` defines `HarnessRuntime` and `HarnessReviewRequest`; current Claude Code review execution is read-only (`Bash,Read`) and structured for review findings, so do not contort it into mutating resolver execution. Add a separate agent-runner boundary.
- `packages/roaster/src/roaster/harness/fake.py` contains constructor-seeded fake style to mirror for new gateways.
- `packages/roaster/src/roaster/findings_publication.py` contains pure helpers and marker/update patterns for existing findings PR comments; reuse patterns where useful but keep the stack dashboard separate.
- `packages/roaster/src/roaster/prompts/` already contains prompt resources (`review_prompt.md`, `review_system_findings.md`, `review_system_text.md`); add `stack_triage.md` and `stack_resolver.md` there and keep `__init__.py` empty/docstring-only.

Testing conventions:

- Roaster standalone CLI scenario tests should use `build_cli()` and live under `packages/roaster/tests/scenario/`.
- Plugin smoke belongs in top-level `tests/scenario/test_plugins.py`; add only a light roaster `stack` smoke, not full scenario coverage.
- Use fake-driven tests; do not use `unittest.mock.patch` for core workflow boundaries.

### Branch Memory lineage contract

Use namespace:

```text
roaster-runs
```

Canonical branch scope is the original implementation branch, not generated roaster branches.

Centralized keys:

```text
indexes/<impl-branch-slug>/<profile-slug>.md
runs/<impl-branch-slug>/<profile-slug>/<run-slug>/manifest.md
runs/<impl-branch-slug>/<profile-slug>/<run-slug>/triage.md
runs/<impl-branch-slug>/<profile-slug>/<run-slug>/batches/<batch-slug>/resolver.md
```

Optional later key if repeated attempts need more than the current resolver artifact:

```text
runs/<impl-branch-slug>/<profile-slug>/<run-slug>/attempts/<batch-slug>/<attempt-slug>.md
```

Implementation details:

- Add `brmem` to `packages/roaster/pyproject.toml` if roaster imports `BranchMemoryGateway`, `RealBranchMemoryGateway`, or `FakeBranchMemoryGateway` directly.
- Prefer a small roaster run-storage helper/gateway so namespace/key construction, validation, and branch-scope rules are centralized and easy to test.
- Resume by default: read the index on the implementation branch; if it has a latest run for the profile, reuse it.
- `--new-run`: create a new semantic/ordinal slug, e.g. `thermonuclear-stack`, then `thermonuclear-stack-2`, not a timestamp/random ID.
- `--run-slug`: validate and use explicit slug; document whether it resumes an existing run or must be paired with `--new-run` for fresh behavior.
- Manifest content should include authoritative machine data, preferably YAML frontmatter, with fields such as schema version, implementation branch/slug/PR, profile slug, run slug, status, dashboard comment id, triage key, batch statuses/branches/PRs/finding IDs/resolver keys, superseded batches, and rejected finding count.
- Branch Memory keys must obey `brmem.key_validation`; branch names containing `---` cannot be encoded into `refs/brmem` and must fail early.

### Triage and resolver frontmatter contracts

Triage/verifier output is markdown with authoritative YAML frontmatter. Suggested schema:

```yaml
schema_version: roaster.stack.triage.v1
summary: "short human summary"
findings:
  - id: F001
    source_review: dignified-python
    path: app.py
    line: 12
    severity: warning
    summary: "Use pathlib"
    details: "..."
    status: accepted        # accepted | rejected | merged
    rationale: "why triage chose this status"
    merged_into: null       # finding id, if status=merged
    confidence: high        # high | medium | low
    risk: mechanical        # mechanical | behavioral | architectural | speculative
batches:
  - slug: use-pathlib
    title: "Use pathlib for path construction"
    summary: "Replace os.path joins in the touched code."
    finding_ids: [F001]
    dependencies: []
    confidence: high
    risk: mechanical
    resolver_mandate: "Implement only this pathlib fix."
    validation_requirements:
      - "Run the checks the resolver judges relevant and report them."
```

Resolver output is markdown with authoritative YAML frontmatter. Suggested schema:

```yaml
schema_version: roaster.stack.resolver.v1
batch_slug: use-pathlib
status: completed          # completed | failed | blocked
summary: "Implemented pathlib replacement."
files_changed:
  - app.py
validation:
  - command: "uv run pytest packages/roaster/tests/unit/test_stack_slugs.py"
    status: passed         # passed | failed | skipped
    output_summary: "1 passed"
safety:
  unresolved_conflicts: false
  destructive_changes: false
  secrets_or_security_sensitive: false
  validation_evidence_missing: false
  notes: "No safety issues found."
```

Parser requirements:

- Parse markdown frontmatter fences only; preserve body separately for human explanation/lineage.
- Reject missing frontmatter, invalid YAML, missing/unknown schema version, invalid enum values, duplicate finding IDs, duplicate batch slugs, batch references to unknown finding IDs, accepted findings not assigned to any batch, unknown batch dependencies, dependency cycles, resolver batch mismatch, missing validation evidence for completed resolver output, failed validation, and safety flags.
- Markdown headings/body must not affect authoritative parsed data.
- Triage agent proposes human-readable batch slugs; roaster validates syntax/uniqueness and may append a short suffix only on collision.

### Dashboard and generated PR marker contract

Persistent dashboard:

- It is a top-level PR issue comment, not a PR review.
- Use `PRGateway` methods for target PR resolution, discussion-comment creation, marker lookup, and update.
- Do not call inline review/comment/thread mutation paths in this MVP.
- Publish/update dashboard before creating generated PRs, then update after each batch PR creation/submission or at the end.

Suggested dashboard marker:

```markdown
<!-- roaster-stack-dashboard {"version":1,"profile_slug":"thermonuclear-stack"} -->
```

Dashboard content should include:

- Heading `## roaster stack · <profile-slug>`.
- Target implementation branch/PR.
- Run slug.
- Branch Memory namespace/key pointer for manifest.
- Reviewers run and finding counts.
- Accepted, rejected, superseded, submitted, failed/blocked counts.
- Batch table with slug, title/summary, confidence/risk, finding IDs, generated branch, generated PR link/number, and resolver/validation status.
- Rejected findings summary count and optional compact details.
- Activity log capped to recent entries if implemented, similar to existing findings-publication patterns.

Suggested generated PR body marker:

```markdown
<!-- roaster-stack-batch {"version":1,"implementation_branch":"feature/widget","implementation_pr":123,"profile_slug":"thermonuclear-stack","run_slug":"thermonuclear-stack","batch_slug":"use-pathlib","finding_ids":["F001"],"brmem_namespace":"roaster-runs","brmem_branch":"feature/widget","brmem_key":"runs/feature-widget/thermonuclear-stack/thermonuclear-stack/manifest.md"} -->
```

Generated PR body should also contain concise human lineage: source implementation PR/branch, profile/run, batch summary and finding IDs, validation report summary, and dashboard pointer if known. If `PRGateway` lacks PR body editing support, add a narrow gateway method/helper or controlled `gh pr edit --body-file` adapter behind a gateway; do not shell out ad hoc from core workflow and do not use heredocs for PR descriptions.

### Graphite and target-stack contract

Graphite is an allowed runtime dependency only because the command contract names Graphite/`gt`.

Add a roaster-specific `GraphiteStackGateway` instead of overloading generic review code. It should fake and guard operations such as:

- Reading current stack/target stack.
- Checking out a branch or generated stack tip.
- Creating a generated branch with `gt create <branch-name> -m "roaster: <batch title>"`.
- Updating an existing generated branch with `gt modify -m ...` or `gt modify --no-edit` as appropriate.
- Submitting the generated stack with `gt submit --no-interactive`.

Target resolution:

- Default to current Graphite branch/PR as the implementation target.
- Allow `--target-branch` and/or `--target-pr` overrides.
- If target implementation is itself a Graphite stack, attach generated resolution PRs above the topmost descendant of the target stack while storing lineage against the originally targeted branch/PR.
- Do not do destructive stack surgery for complex reruns; surface clear failures when safe update/reuse behavior is not enough.

### Agent-runner contract

Add a separate fake-driven `AgentRunnerGateway` for triage and resolver sessions. Suggested request fields:

- kind: `triage` or `resolver`.
- prompt override path or default prompt resource.
- model if provided.
- cwd.
- input markdown.
- allowed tools.

Default prompt resources:

- `stack_triage.md`: instructs verifier to inspect reviewer findings/profile guidance, reject false positives, merge duplicates, emit stable finding IDs and batch slugs, rank by dependencies then confidence/risk, output authoritative `roaster.stack.triage.v1` frontmatter, and keep markdown body explanatory only.
- `stack_resolver.md`: instructs resolver to implement only its batch mandate, inspect/edit repo as needed, choose and run relevant local validation, report validation/safety in `roaster.stack.resolver.v1` frontmatter, and avoid unrelated findings/batches.

Real adapter:

- Existing Claude Code review invocation is a starting point, but it is read-only. Verify exact local runner flags for mutating resolver sessions during implementation.
- For triage, read-only tools are sufficient.
- For resolver, allow editing tools only through the guarded adapter after verifying supported tool names/behavior.
- If the local runner is unavailable or unsupported, return a clear failure.

### Orchestration outline and hard stops

Suggested high-level workflow:

```python
def run_stack_workflow(request, deps):
    profile = load_profile(...)
    target = resolve_target_pr_and_branch(...)
    stack_tip = resolve_attach_tip(...)
    run_identity = resolve_or_create_run_slug(...)

    review_results = run_selected_reviewers(...)
    triage_output = agent_runner.run_agent(kind="triage", ...)
    triage = parse_triage_frontmatter(triage_output.output_markdown)
    ordered_batches = order_batches(triage.batches)

    if request.dry_run:
        return dry_run_result(...)

    put_triage_and_manifest_to_branch_memory(...)
    publish_dashboard(..., status="triaged")

    if not ordered_batches:
        update_manifest_status("complete-no-batches")
        publish_dashboard(...)
        return ok

    checkout(stack_tip)
    for batch in ordered_batches:
        resolver_output = agent_runner.run_agent(kind="resolver", ...)
        resolver = parse_resolver_frontmatter(...)
        enforce_validation_and_safety(resolver)
        create_or_update_generated_branch(batch, resolver)
        persist_resolver_and_manifest(...)
        publish_dashboard(...)

    submit_generated_stack()
    update_manifest_status("submitted")
    publish_dashboard(...)
    return ok
```

Hard stops include:

- Missing/invalid profile, run slug, batch slug, generated branch name, Branch Memory branch encoding, namespace, or key.
- Target PR/branch cannot be resolved.
- Graphite stack cannot be read or branch is untracked.
- Explicit reviewer key is missing or reviewer execution fails; no matching reviewers may be treated as zero-finding success if no explicit reviewer was requested.
- Triage output invalid, duplicate IDs/slugs remain, unknown finding/batch references, accepted finding not batched, dependency cycle.
- Resolver status is not `completed`.
- Any validation entry has status `failed`.
- No validation entries are present or validation evidence is flagged missing.
- Safety flags are true: unresolved conflicts, destructive changes, secrets/security-sensitive changes, or validation evidence missing.
- Graphite create/modify/submit fails.
- Dashboard publication fails before any branch mutation; after branch mutation, surface failure and update manifest/dashboard if possible.

Dry-run may run reviewers and triage but must not write Branch Memory, create/update dashboard comments, create/update branches, modify branches, submit Graphite stacks, or mutate external systems. Human and JSON dry-run output should include target, profile, run slug, reviewers/finding counts, accepted/rejected/superseded counts, planned batches/actions, and Branch Memory/dashboard locators that would be used.

### Likely source files and tests

Likely roaster source additions/edits:

- `packages/roaster/pyproject.toml`
- `packages/roaster/README.md`
- `.roaster/profiles/thermonuclear-stack.md`
- `packages/roaster/src/roaster/context.py`
- `packages/roaster/src/roaster/cli/roaster/context.py`
- `packages/roaster/src/roaster/cli/roaster/group.py`
- `packages/roaster/src/roaster/cli/roaster/stack/__init__.py`
- `packages/roaster/src/roaster/cli/roaster/stack/group.py`
- `packages/roaster/src/roaster/cli/roaster/stack/run.py`
- `packages/roaster/src/roaster/stack_models.py`
- `packages/roaster/src/roaster/stack_workflow.py`
- `packages/roaster/src/roaster/stack_profile.py`
- `packages/roaster/src/roaster/stack_agent_output.py`
- `packages/roaster/src/roaster/stack_dashboard.py`
- `packages/roaster/src/roaster/stack_markers.py`
- `packages/roaster/src/roaster/stack_slugs.py`
- `packages/roaster/src/roaster/prompts/stack_triage.md`
- `packages/roaster/src/roaster/prompts/stack_resolver.md`
- `packages/roaster/src/roaster/gateways/agent_runner/{gateway.py,real.py,fake.py}`
- `packages/roaster/src/roaster/gateways/graphite_stack/{gateway.py,real.py,fake.py}`
- Optional `packages/roaster/src/roaster/gateways/roaster_runs/{gateway.py,real.py,fake.py}` wrapper.

Likely tests:

- `packages/roaster/tests/unit/test_stack_slugs.py`
- `packages/roaster/tests/unit/test_stack_profile.py`
- `packages/roaster/tests/unit/test_stack_agent_output.py`
- `packages/roaster/tests/unit/test_stack_dashboard.py`
- `packages/roaster/tests/unit/test_stack_workflow.py`
- `packages/roaster/tests/gateways/test_stack_fakes.py`
- `packages/roaster/tests/scenario/test_stack_cli.py`
- Update `packages/roaster/tests/scenario/test_review_cli.py` only if top-level help expectations change.
- Update `tests/scenario/test_plugins.py` with light `roaster stack --help` smoke.

## Definition of Progress

Progress is keepable when:

- It lands an independently reviewable semantic slice from the roadmap with fake-driven tests or clear local validation evidence.
- It preserves existing roaster review CLI behavior while extending the package through explicit new modules and gateway boundaries.
- It reduces uncertainty around one risky boundary: profile/CLI shape, frontmatter parsing, Branch Memory storage, dashboard publication, agent running, Graphite mutation, resolver safety gates, or real-adapter/docs integration.
- It leaves the repository in a state where the current branch can pass targeted tests for the changed slice, or clearly records why validation was skipped or blocked.

Do not keep changes that:

- Mix unrelated product decisions into one PR slice.
- Depend on unreviewed live GitHub/Graphite mutations for correctness.
- Parse loose profile markdown as authoritative structure.
- Bypass existing gateway/fake patterns with ad hoc `gh`, `gt`, subprocess, or filesystem calls in core workflow code.
- Add package re-exports through `__init__.py` files or leading-underscore module names.

Useful evidence includes targeted pytest runs for roaster unit/gateway/scenario tests, plugin smoke tests for roaster discovery, static checks relevant to touched Python/Markdown/TOML, and parent-agent inspection of diffs after each runner subagent returns.

Suggested validation commands:

```bash
uv run pytest packages/roaster/tests/unit packages/roaster/tests/gateways packages/roaster/tests/scenario -n auto
uv run pytest tests/scenario/test_plugins.py -k roaster -n auto
just lint
just format-check
just ty
just test
just check
```

Use `just fix` for mechanical ruff/format failures and `just dprint-fix` for mechanical Markdown/TOML dprint failures, then rerun the failing check.

Manual smoke commands are explicitly optional and human-confirmed only:

```bash
roaster stack run thermonuclear-stack --dry-run --format json
roaster stack run thermonuclear-stack --reviewer <safe-reviewer-key>
```

The second command should only run on an intentionally disposable Graphite branch/PR after fake-driven tests are green.

## Runner Policy

This Objective is designed for autonomous pursuit by `objective-stack-impl` after the parent agent presents and the user confirms an execution preview.

- Direct execution is allowed when: the preview covers 1-3 Graphite PR slices at a time, each slice has one clear thesis, the worktree is safe, and the slice stays within the steelthread MVP scope above.
- The parent agent may create or amend local Graphite branches, dispatch one runner subagent at a time, edit repo source/tests/docs, run local validation, and record Objective updates when meaningful progress is made.
- Steer or ask first when: the implementation would expand beyond the steelthread MVP, require live GitHub/Graphite mutation smoke tests, submit this Objective's implementation PRs, change the public contract away from `roaster stack run <profile-slug>`, introduce deterministic profile-prose parsing, remove existing roaster review behavior, or choose between materially different real agent runner designs.
- How work may be left: completed slices should be committed/amended through the repo Graphite workflow after parent-side validation. Blocked slices may leave inspected local changes only if the parent reports the blocker, validation state, and recommended recovery path.
- Validation before keeping work: prefer targeted roaster tests for each slice, plugin smoke tests when CLI/plugin wiring changes, and repo checks when practical. If lint or format failures are mechanical, use `just fix` or `just dprint-fix` per repo policy rather than hand-formatting.
- What will not happen unless explicitly requested: submission of this Objective's implementation PRs, live disposable roaster stack mutation smoke tests, GitHub issue/PR mutation outside tested/faked code paths, deployment, remote CI waiting, original review-thread mutation, or broad product expansion beyond the MVP.

## Assumptions and Risks

Assumptions:

- Existing roaster reviewer workflows can provide findings through `run_review_by_key(..., requested_format="findings")` and matching review selection can be reused for default reviewer choice.
- Branch Memory can be used as a declared roaster dependency, or wrapped behind a small roaster run-storage gateway if direct imports become awkward.
- The target implementation branch normally resolves to a GitHub PR through existing `PRGateway` methods.
- Graphite is an acceptable runtime dependency for this command because the user-facing `roaster stack` contract explicitly names Graphite/`gt`.
- A local non-interactive agent runner can be adapted to return markdown with YAML frontmatter for triage/resolver sessions, even if exact flags need verification during implementation.
- Fake-driven tests are sufficient Objective completion evidence for external mutation paths; real mutation smoke remains manual and explicitly confirmed.
- Existing roaster review definitions have `default_model` or the user passes `--model`; otherwise existing `ModelNotProvided` behavior can remain the failure path.

Risks:

- The real agent runner adapter may differ from the existing read-only Claude Code review harness and may need a smaller first implementation or a clear unavailable-tool failure mode.
- Updating generated PR bodies with hidden markers may require a narrow PR body editing gateway because Graphite submission alone may not set the final body shape.
- Rerun/update semantics for existing generated batch branches can become stack-surgery-heavy. The MVP should prefer clear failure modes over destructive automatic repair.
- Branch Memory branch encoding rejects branch names containing `---`; the workflow must validate this early and surface a clear message.
- The feature crosses multiple external boundaries: Branch Memory, GitHub comments, Graphite, and agent execution. Gateway boundaries and fakes are load-bearing for safe autonomous implementation.
- The Objective may tempt scope creep into remote CI monitoring, inline comments, thread resolution, sophisticated profile semantics, or final-product polish. These remain parked unless explicitly promoted.
- Resolver-chosen validation means roaster gates on reported evidence rather than independently selecting checks. Enforce structured evidence and safety flags, but recognize the trust boundary.
- GitHub dashboard update failure after branch mutation can leave generated branch state ahead of publication state; orchestration should record/retry/report this rather than silently succeeding.

## Open Questions

- What exact command and flags should the real local agent runner adapter use for mutating resolver sessions?
- Should generated PR body editing be added to `PRGateway`, a roaster-specific publication gateway, or a controlled `gh pr edit --body-file` adapter?
- What exact deterministic rule should generate a new `run_slug` for `--new-run` without an explicit slug? The default recommendation is profile slug plus ordinal suffix from the Branch Memory index.
- Should a later debug-only synthetic triage input be added to simplify manual mutation smoke tests without undermining prompt-driven production behavior?
- How much of matching existing generated PR branches on rerun should the MVP implement before failing safely and asking for human intervention?
- When no matching reviewers are found and no explicit reviewer was requested, should the command publish a zero-finding dashboard/manifest or return a non-ideal warning? The current recommendation is zero-finding success with clear dashboard/manifest text.
