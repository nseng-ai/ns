# Roadmap

## Work

- [ ] Decide the operation name and JSON manifest shape (workspace facts, branch facts,
      evidence scope, locators) and record the decision as a Semantic Update.
- [ ] Implement the read-only `ns cmux exec` inventory operation in
      `ts/packages/capabilities/cmux` behind gateway seams with fake-driven tests.
- [ ] Retrofit `ns-cmux-available-work`, `ns-cmux-branch-triage`, and
      `ns-cmux-stack-map` to consume the manifest; drop the reserved
      "Future cmux exec helper boundary" section once live.
      Evidence: `just` green, `areg check` OK, retrofitted skills verified via
      `areg skill show <name>`.

## Parked

- (none)
