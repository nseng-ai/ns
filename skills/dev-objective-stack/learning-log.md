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
