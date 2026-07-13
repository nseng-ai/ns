# Roadmap

## Work

- [~] Settle the canonical README (`references/README-draft.md`) through the
  readme-driven-development loop: draft as finished product documentation for an
  external Graphite-repo adopter, grill every unsettled decision it exposes, fold
  answers back until coherent.
  - Settled at creation: recovery is default-on with a repo override; promotion target
    `ts/packages/capabilities/flow/README.md`; flow stays Graphite-native.
  - Settled by the 2026-07-12 steering decision: no standalone `ns flow validate`
    command or general gate taxonomy now; retain the submit-specific `flow.submit.pre`
    seam. Reconsider a public verb only after a demonstrated need to execute a flow-owned
    check independently of its guarded operation.
  - Settled by the 2026-07-12 grilling session (draft revised to match): recovery point
    id `flow.submit.pre.recovery`; "pre-submit checks" vocabulary with `--no-checks`
    replacing `--no-hooks`; the failure marker documented as a public harness contract
    (`FLOW_SUBMIT_CHECK_FAILURE_MARKER`); inspection via `ns extension points` (no flow
    listing verb); recovery promised submit-only; default prompt reruns the failing
    check, then `ns flow submit`.
  - Settled by the repo-specificity audit: the ns command context is the model-service
    seam; command-specific environment variables select model refs; Slots and GitHub
    squash-merge behavior are documented command-scoped requirements; the complete command
    inventory includes `squash-stack`. No audit question remains in the draft.
- [x] Strip the hardcoded auto-fix bridge from PR #3291 so it lands as the pure
      `hiddenExecGroup` sdk export fix; the real recovery design lands under this
      Objective.
  - Evidence: branch amended to the one-line sdk export (targeted vitest green on the
    reverted files); PR #3291 resubmitted and retitled "Export hiddenExecGroup from the
    ns-cli SDK barrel"; this record submitted as PR #3294.
- [x] Repo-specificity audit of `ts/packages/capabilities/flow`: enumerate every
      ns-repo assumption (hardcoded commands, skills, prompts, model usage, trunk/stack
      assumptions, Pi-host coupling); record findings in
      `references/repo-specificity-audit.md` with a disposition each (resolve / document
      as adopter requirement / park).
  - Evidence: 12 source-backed semantic findings recorded; documented requirements were
    folded into the README draft; resolve work is grouped into repository identity,
    Graphite machine facts, Pi ownership, and point-default fidelity; broader CLI-prose
    and point-definition consolidation concerns are explicitly parked.
- [x] Submit pre-check contract slice: retain `flow.submit.pre` and the submit-specific
      implementation, add an exported stable failure marker, and preserve both submit
      execution paths. Do not introduce a validation-gates module or standalone command.
  - Evidence: `FLOW_SUBMIT_CHECK_FAILURE_MARKER` is exported from `@nseng-ai/flow/api`
    with raw value `NS_FLOW_SUBMIT_CHECK_FAILURE`; `--no-checks` replaces `--no-hooks`;
    both submit paths retain deterministic presentation and abort before checkpoint or
    Graphite submission. Clinkr process exits remain coarse (`1` for a negative check exit
    `1`, otherwise failure exit `2`) while structured `data.exitCode` retains the check
    code; tests cover both rendered marker-line forms. Focused Flow tests, full TypeScript
    tests, and `just` pass; help and point inspection confirm `--no-checks` and unchanged
    `flow.submit.pre`.
- [x] Recovery slice: implement the settled `flow.submit.pre.recovery` prompt point, add
      its built-in generic default and `.ns/prompts`/`ns.toml` override, and rework the Pi
      bridge to detect the stable submit-check failure marker and resolve that prompt.
      Keep this repo's `code-just-fix` reference solely in consumer config.
  - Evidence: the Flow descriptor and mirrored SDK catalog expose the override prompt;
    exact marker-line matching starts one bounded Pi recovery turn only for failed submits;
    missing Git roots and broken explicit prompt policy fail fast. Flow's packaged default
    is repository-neutral, while this repo's conventional prompt owns `code-just-fix`.
    Review remediation now makes production default resolution prefer the preloaded Flow
    descriptor over its incomplete SDK mirror and resolves repository roots through the
    canonical Git gateway on the Pi exec channel; no command, marker, point id, override
    precedence, or recovery-turn behavior changed. Focused recovery/Pi/catalog tests,
    descriptor integration tests, TypeScript checks, style guard, and `just` pass.
- [x] Extension-point docs for adopters: routing line in root `AGENTS.md` to
      `docs/guides/points.md`; "For workflow implementers: consuming the catalog"
      section in that guide; keep the guide's worked example aligned with the retained
      `flow.submit.pre` point and the new submit-scoped recovery point.
  - Reshaped by the 2026-07-13 grilling session: instead of documenting the
    `cardinality` ↔ `semantics` vocabulary mapping, the vocabulary was unified in code —
    the catalog, `ns extension points` CLI, and diagnostics now report descriptor
    `cardinality: one|many` directly and the derived `semantics: additive|override`
    axis is gone (full replacement; `point_override_in_effect` became
    `point_installation_in_effect`).
  - Evidence: two stacked slices — the vocabulary unification (sdk catalog/CLI/tests,
    flow fallback and test manifests, points guide, ADR 0031, sdk CONTEXT.md) and the
    adopter docs (root `AGENTS.md` routing bullet, workflow-implementer catalog
    consumption section, worked example covering `flow.submit.pre` and this repo's
    conventional `flow.submit.pre.recovery` override). Full `just` passes on both.
- [ ] Genericization slices from the audit: implement the resolve-disposition findings
      recorded in `references/repo-specificity-audit.md`.
  - Repository identity: replace `main`/`master` checkpoint protection and `origin`
    refresh assumptions with configured trunk/upstream facts.
  - Graphite machine facts: remove the Slot Command Face dependency from `squash-stack`
    and replace submit's `gt log` / `gt branch info` display parsing with structured
    Graphite facts.
  - Pi ownership: move repo-owned `code-workflows` and `code-gt-restack-resolve` skill
    policy out of the Flow package while retaining generic Flow command mirrors.
  - Point-default fidelity: declare the PR-description built-in prompt through the point
    descriptor/catalog rather than a bespoke fallback branch.
- [ ] Promote the settled README to `ts/packages/capabilities/flow/README.md`, repoint
      this Objective's canonical reference at the promoted doc, and re-derive or retire
      `orientation.md`.

## Parked

- Standalone `ns flow validate`/`check` and a general `flow.validation.*` gate taxonomy.
  Revisit only when users or agents demonstrably need to execute a flow-owned check
  independently of the operation it guards; a second internal check alone is not enough.
- Repo-defined gates via kernel pattern/wildcard point definitions.
- `ns flow test` / `ns flow local-ci` sugar commands.
- Structured machine-failure envelope across the CLI/Pi boundary (marker constant is the
  contract for now).
- Second-consumer proof: actually installing flow into another repository.
