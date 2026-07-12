# Roadmap

## Work

- [ ] Implement `ns slot gt exec restack-preflight [--downstack] --format json` with
      tests, resolving its overlap with the existing `quiescence` preflight; retrofit
      `objective-runner-step` and its Pi wrapper.
- [ ] Implement `ns slot gt exec descendants-report <branch> --format json` with tests;
      retrofit `code-thermostack` step 2 and `code-gt-linearize-descendants`' per-branch
      evidence gathering (the waiting consumer recorded by the T4 routing retrofit).
      Evidence: `just` green, `areg check` OK, retrofitted skills verified via
      `areg skill show <name>`.

## Parked

- (none)
