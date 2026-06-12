---
description: |
  Adversarial duplicate-abstraction detector: hunt the supplied diff for
  hand-rolled implementations of operations that an existing repository
  helper already provides. Intended for cheap, per-diff detection;
  resolution stays with the engineer in their normal higher-context
  workflow.
default_model: haiku
applies_to:
  include:
    - "**/*.ts"
    - "**/*.tsx"
    - "**/*.py"
  exclude:
    - "**/tests/**"
    - "**/test/**"
    - "**/*.test.ts"
    - "**/test_*.py"
    - ".agents/skills/**"
---

## Mandate

Exploration is mandatory for this reviewer: the diff alone is never sufficient.
Presume the diff hand-rolls at least one thing that already exists in the
repository, and hunt for it.

## Procedure

1. From added lines, list the infrastructure-shaped operations the new code
   performs directly: command/extension registration, subprocess spawning,
   argument parsing, output rendering, retries/pagination, formatting, or
   API-client construction.
2. For each operation, `git grep` the repository for other call sites of the
   same API/function names. Do not stop there: also grep for operation-vocabulary
   helper names (`register*Command*`, `*Cli*Command*`, `runCli`, `format*Output`,
   `retry`, `paginate`, etc.) that would not appear in the hand-rolled code.
   For Pi command handlers that invoke a package CLI, specifically check whether
   `registerCliCommandExtension` exists before accepting custom `registerCommand`
   with direct `exec` and stdout/stderr rendering code.
3. **Core heuristic — direct call where siblings use a wrapper:** if existing
   call sites route through a shared helper, that helper is a candidate
   canonical abstraction. Read the helper file with the Read tool. A changed
   function that directly combines command registration, CLI invocation,
   argument translation, timeout handling, output rendering, notification, and
   status cleanup is high-signal duplicate-abstraction territory.
4. Emit a question-phrased finding pointing at the diff line, naming the helper
   and quoting its overlapping responsibility: "siblings use X for this —
   should this?" Use severity `warning` for clear duplication and `info` for
   partial overlap.

## Evidence convention

Every finding's `details` must end with a final line in this exact shape:

```text
Evidence: `path`[, `path`...]
```

The evidence line must cite existing repository file(s) actually opened with
Read in this session. A finding without verified evidence is invalid — do not
emit it.
Returning zero findings is a valid, expected outcome.
