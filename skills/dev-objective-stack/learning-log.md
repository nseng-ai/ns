# dev-objective-stack learning log

Use this file to capture what we learn while proving the draft workflow. Keep
notes factual and small; promote only repeated or high-confidence lessons into
`SKILL.md`.

## How to add a note

```markdown
- Observation: <what happened>
  Evidence: <command, file, branch, failure, or successful pattern>
  Skill change to consider: <specific edit or open question>
```

## Open questions

- Should the final skill remain internal as `dev-objective-stack`, or graduate to
  a non-`dev-` name after the packagechk implementation?
- Should the skill default to stopping at local stacks, or to `gt submit` when the
  user explicitly says "PRs"?
- How much Objective-update detail belongs here versus delegated entirely to the
  `objective-update` skill?
- Should branch handoffs be created after each PR branch only, or both before and
  after each clean-context implementation session?

## Runs

### 2026-05-19 — packagechk-cli planned stack

Context: Implement `.asdl/objectives/packagechk-cli` as a four-PR Graphite stack
where each PR carries its own Objective update and Branch Memory handoff.

Initial planned split:

1. Scaffold package and CLI contract.
2. PyPI availability.
3. npm availability.
4. Default both registries, JSON output, final scenario coverage, workspace checks.

Notes:

- Observation: The Objective already exists on branch
  `add-packagechk-cli-name-availability-thesis`, so the implementation stack may
  need to be based on that branch rather than trunk.
  Evidence: `gt branch info` reports parent `master`; `objective-current` shows
  the Objective scaffold files are present and open.
  Skill change to consider: Require an explicit base decision when an Objective
  scaffold branch already exists.
- Observation: Internal draft skills are hidden from `npx skills add` unless the
  install command opts into internal skills.
  Evidence: `npx skills add ./skills/dev-objective-stack ...` reported "No valid
  skills found" until rerun with `INSTALL_INTERNAL_SKILLS=1`.
  Skill change to consider: Keep draft skills internal, but mention the install
  environment variable in skill-management notes when creating similar drafts.
- Observation: A real Objective-stack run may update two durable tracking
  surfaces: the selected Objective and the draft skill's learning log.
  Evidence: The packagechk PR 1 slice needs `.asdl/objectives/packagechk-cli/*`
  updates and `skills/dev-objective-stack/learning-log.md` notes in the same
  branch as the implementation.
  Skill change to consider: Add learning-log files to each slice manifest so
  agents do not forget non-Objective workflow notes.
- Observation: `git diff --stat` omits untracked files, which can hide most of a
  newly scaffolded package during pre-commit evidence collection.
  Evidence: PR 1 status showed `?? packages/packagechk/`, while `git diff --stat`
  only showed tracked root and Objective files before the package was staged.
  Skill change to consider: In slice verification, pair `git status --short` with
  either staged stats after `git add` or explicit file inventory for untracked
  package scaffolds.
- Observation: CLI invalid-input tests can accidentally exercise option parsing
  instead of domain validation when sample names begin with `-`.
  Evidence: A PyPI invalid-name scenario using `-bad` failed as Click option
  parsing (`No such option: -b`) until changed to `bad!name`.
  Skill change to consider: Add a reminder that scenario tests should distinguish
  CLI parser errors from domain-level invalid input unless both are in scope.
- Observation: A later planned slice may become partly implemented as a natural
  consequence of an earlier slice's clean design.
  Evidence: After the npm slice, default both-registry execution already works in
  code because the CLI default and both real gateway methods are now wired; the
  final PR is still useful for aggregation scenarios and JSON schema confirmation.
  Skill change to consider: During each Objective update, mark roadmap items by
  landed behavior rather than by the original PR boundary, and let later slices
  narrow to evidence/coverage if implementation moved earlier.
- Observation: Completing all roadmap checkboxes is not the same operation as
  closing the Objective.
  Evidence: PR 4 checks off the packagechk implementation roadmap and adds
  closure-ready evidence, but `closed.md` is intentionally not created because
  `objective-close` is a separate explicit workflow.
  Skill change to consider: Add an end-of-stack decision point: ask whether to
  close the Objective, leave it open for review, or create a follow-up slice.
