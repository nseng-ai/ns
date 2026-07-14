# Roadmap

## Work

- [x] Implement `ns slot gt exec restack-preflight [--scope downstack|full] --format
      json` with a downstack default and tests, resolving its overlap with existing
      quiescence fact mechanics without changing quiescence behavior; retrofit
      `code-gt-restack-resolve` and the Pi smart-restack wrapper with explicit full scope
      where plain `gt restack` semantics are required. Evidence: focused Slot and Pi
      tests plus `just` pass.
- [x] Implement `ns slot gt exec descendants-report <branch> --format json` with
      complete-subtree, fixed-concurrency local evidence and one best-effort PR batch;
      retrofit `code-gt-linearize-descendants`' matching evidence loop. Evidence: `just`
      green, `areg check` OK, both retrofitted skills pass `areg skill show`, and both
      commands publish their schemas through `--json-schema`.

## Parked

- (none)
