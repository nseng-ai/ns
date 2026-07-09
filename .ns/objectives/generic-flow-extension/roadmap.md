# Roadmap

## Work

- [~] Settle the canonical README (`references/README-draft.md`) through the
  readme-driven-development loop: draft as finished product documentation for an
  external Graphite-repo adopter, grill every unsettled decision it exposes, fold
  answers back until coherent.
  - Settled at creation: fixed flow-defined gate set (`pre-submit` first); recovery point
    id `flow.validation.recovery`, default-on with repo override; promotion target
    `ts/packages/capabilities/flow/README.md`; flow stays Graphite-native.
  - Open README questions live in the README itself and `objective.md`.
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
- [ ] Validation gates slice: rename `flow.submit.pre` → `flow.validation.pre-submit`
      (kernel built-ins AND flow descriptor, plus repo `ns.toml` and a targeted
      migration diagnostic for the old id), generalize `submit-hooks.ts` into a
      validation-gates module with the exported stable failure marker, rewire both
      submit paths.
  - Detailed steps: `references/validation-gates-plan.md`.
- [ ] `ns flow validate <gate>` command: run a named gate with marker-formatted
      failures; no-arg lists defined gates; Pi mirror + parity entry via
      `NS_FLOW_COMMANDS`; scenario tests per ns-cli-design.
- [ ] Recovery slice: `flow.validation.recovery` prompt point (built-in default prompt,
      override via `.ns/prompts`/`ns.toml`), Pi bridge rework to marker detection +
      prompt-point resolution (drop `expandRepoSkillBlock` and the `code-just-fix`
      constant), and this repo's `.ns/prompts/flow.validation.recovery.md` referencing
      `code-just-fix` as consumer config.
- [ ] Extension-point docs for adopters: routing line in root `AGENTS.md` to
      `docs/guides/points.md`; "For workflow implementers: consuming the catalog"
      section in that guide; document the `cardinality` ↔ `semantics` vocabulary
      mapping; sync the guide's worked example with the renamed point.
- [ ] Genericization slices from the audit: implement the resolve-disposition findings
      (sized after the audit lands; expected to include the pr-description/model seam
      and any remaining hardcoded consumer references).
- [ ] Promote the settled README to `ts/packages/capabilities/flow/README.md`, repoint
      this Objective's canonical reference at the promoted doc, and re-derive or retire
      `orientation.md`.

## Parked

- Repo-defined gates via kernel pattern/wildcard point definitions (explicitly declined
  at creation; unpark if a real adopter needs to mint gate names).
- `ns flow test` / `ns flow local-ci` sugar commands.
- Structured machine-failure envelope across the CLI/Pi boundary (marker constant is the
  contract for now).
- Second-consumer proof: actually installing flow into another repository.
