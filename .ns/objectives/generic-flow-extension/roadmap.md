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
  - Remaining open README questions (model seam; audit findings) live in the README
    itself and `objective.md`; they gate promotion, not the implementation slices.
- [x] Strip the hardcoded auto-fix bridge from PR #3291 so it lands as the pure
      `hiddenExecGroup` sdk export fix; the real recovery design lands under this
      Objective.
  - Evidence: branch amended to the one-line sdk export (targeted vitest green on the
    reverted files); PR #3291 resubmitted and retitled "Export hiddenExecGroup from the
    ns-cli SDK barrel"; this record submitted as PR #3294.
- [ ] Repo-specificity audit of `ts/packages/capabilities/flow`: enumerate every
      ns-repo assumption (hardcoded commands, skills, prompts, model usage, trunk/stack
      assumptions, Pi-host coupling); record findings in
      `references/repo-specificity-audit.md` with a disposition each (resolve / document
      as adopter requirement / park).
- [ ] Submit pre-check contract slice: retain `flow.submit.pre` and the submit-specific
      implementation, add an exported stable failure marker, and preserve both submit
      execution paths. Do not introduce a validation-gates module or standalone command.
  - `references/validation-gates-plan.md` predates the 2026-07-12 steering decision and
    is superseded where it proposes the point rename, general gates module, or
    `ns flow validate`; revise it before implementation.
- [ ] Recovery slice: implement the settled `flow.submit.pre.recovery` prompt point, add
      its built-in generic default and `.ns/prompts`/`ns.toml` override, and rework the Pi
      bridge to detect the stable submit-check failure marker and resolve that prompt.
      Keep this repo's `code-just-fix` reference solely in consumer config.
- [ ] Extension-point docs for adopters: routing line in root `AGENTS.md` to
      `docs/guides/points.md`; "For workflow implementers: consuming the catalog"
      section in that guide; document the `cardinality` ↔ `semantics` vocabulary
      mapping; keep the guide's worked example aligned with the retained
      `flow.submit.pre` point and the new submit-scoped recovery point.
- [ ] Genericization slices from the audit: implement the resolve-disposition findings
      (sized after the audit lands; expected to include the pr-description/model seam
      and any remaining hardcoded consumer references).
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
