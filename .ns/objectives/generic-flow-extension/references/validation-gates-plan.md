# Submit pre-check marker + recovery — implementation plan

Implementation plan for the roadmap's submit pre-check contract and recovery slices. The
canonical contract is `README-draft.md`; this file is execution detail and loses any
conflict with that README. Reverified against the codebase on 2026-07-12.

## Settled boundary

- Retain the existing `flow.submit.pre` hook point and submit-specific implementation.
- Use the user-facing term **pre-submit checks**. Rename `--no-hooks` to `--no-checks`;
  ns is unreleased, so do not preserve a compatibility alias.
- Export `FLOW_SUBMIT_CHECK_FAILURE_MARKER` as the stable public harness contract. Its
  raw value is `NS_FLOW_SUBMIT_CHECK_FAILURE`. Clinkr's exact first human stderr line is
  the raw marker for a negative result and `error: NS_FLOW_SUBMIT_CHECK_FAILURE` for a
  failure result. A harness detects either complete rendered line, never surrounding error
  prose.
- Add the override prompt point `flow.submit.pre.recovery`, default-on with a generic
  built-in prompt and overridable through `.ns/prompts/flow.submit.pre.recovery.md` or
  `ns.toml`.
- Recovery is Pi submit-only: only a failed `/ns:flow:submit` whose stderr contains the
  marker triggers it.
- Do not add `ns flow validate`/`check`, a `flow.validation.*` taxonomy, a general gates
  registry/module, wildcard point definitions, or a structured CLI failure envelope.

## Reverified current mechanics

- Pre-submit check mechanics are still in
  `ts/packages/capabilities/flow/src/submit/submit-hooks.ts`:
  `loadFlowSubmitHooks`, `runFlowSubmitHooks`, `flowSubmitHookFailureExitCode`, and
  `formatFlowSubmitHookFailure`. The point mechanism may keep its internal hook-oriented
  symbols; user-facing CLI/help/progress/failure text changes to checks.
- `ts/packages/capabilities/flow/src/ns/commands/submit.ts` runs the same check loader and
  runner on two presentation paths: the non-TTY settled phase stream and the TTY matrix.
  Both return deterministic failure presentation, so marker-bearing stderr bypasses model
  interpretation and survives verbatim. Preserve the internal phase key `"hooks"` unless
  a typed progress-contract migration is separately justified.
- Before this slice, the schema property was `hooks`, producing `--no-hooks`; the
  implementation rename is the schema/request property `checks`, producing `--no-checks`
  and gating repo root/check loading in the same place.
- Point definitions are duplicated in
  `ts/packages/capabilities/flow/src/ns/extension.ts` (descriptor vocabulary:
  `cardinality`) and `ts/packages/sdk/src/project-config/points.ts` (catalog vocabulary:
  `semantics`). The recovery point must be added to both in one slice. Consolidating that
  duplication remains parked.
- The generic Pi mirror at `ts/packages/capabilities/flow/src/pi/ns-extension.ts` has no
  recovery behavior, skill expansion, `code-just-fix` reference, or stderr prose
  heuristic today. `registerCliCommandExtension` already provides an awaited
  `afterCommandComplete(details)` seam after output emission; details include the Pi
  command name, argv, cwd, exit code, stdout, and stderr.
- Prompt resolution is already centralized in
  `@nseng-ai/sdk/project-config/points`: `loadPointCatalog`,
  `resolvePromptPointSource`, and `resolvePromptPointPath` implement `ns.toml`,
  conventional-file, and descriptor-default sources. Because the synchronous built-in
  catalog cannot derive another package's descriptor path, keep the generic built-in
  recovery prompt as an isolated Flow fallback after normal repo point resolution. Do
  not broaden this slice into first-party descriptor consolidation.
- This repo currently installs only `[points]."flow.submit.pre" = ["just"]` in
  `ns.toml`. Its recovery policy belongs in the consumer artifact
  `.ns/prompts/flow.submit.pre.recovery.md`, not in Flow package code.

## Slice 1 — submit pre-check contract

1. **Marker and public API**
   - Define `FLOW_SUBMIT_CHECK_FAILURE_MARKER` beside the submit-check failure formatter
     in `submit-hooks.ts`.
   - Make the marker the exact first non-empty line of the deterministic failure message.
     Clinkr renders a check-exit-`1` negative result with that raw first line and adds its
     framework-owned `error:` prefix for other nonzero check exits, making their exact
     first process-stderr line `error: NS_FLOW_SUBMIT_CHECK_FAILURE`. Keep the existing
     bounded command failure details and exit-code mapping after it.
   - Re-export the constant through the deliberate cross-package public door,
     `@nseng-ai/flow/api`; do not expose the whole private submit barrel.
2. **Checks vocabulary and skip flag**
   - Rename the submit schema/request property from `hooks` to `checks`, yielding
     `--no-checks`.
   - Update command help, description, progress labels, failure headings/trailers, and
     tests from “hooks” to “checks” where user-visible. Keep `flow.submit.pre`'s point
     kind as `hook` and retain internal hook symbols/phase key where they avoid churn.
   - Update the existing points-guide execution-control example from `--no-hooks` to
     `--no-checks`; the broader implementer-guide expansion remains the separate docs
     roadmap slice.
3. **Preserve both submit paths**
   - Keep check execution before checkpoint mutation on the non-TTY phase-stream and TTY
     matrix paths.
   - Both failure branches must use the same marker-bearing formatter and
     `failurePresentation: "deterministic"`. Do not route these failures through
     `maybeFormatSubmitFailureWithModel`.
4. **Tests**
   - Extend `test/unit/submit-hooks.test.ts` to assert exact first-line raw marker
     identity, bounded failure output, check vocabulary, and existing exit-code behavior.
   - Update `test/scenario/submit-command.test.ts` for `checks: false`/`--no-checks`, the
     exact Clinkr-rendered first stderr line, marker-bearing deterministic output, no
     checkpoint/submit after failure, and check ordering. Cover both presentation paths at
     the command boundary or add the narrowest handler-level test needed to prove both
     branches preserve the marker.
   - Add/adjust a small public-surface assertion for the `@nseng-ai/flow/api` marker
     export if no existing API allowlist test covers it.

## Slice 2 — submit-check recovery

1. **Define the recovery prompt point**
   - Add `flow.submit.pre.recovery` to both the Flow descriptor and SDK built-in point
     definitions as prompt/one (descriptor) and prompt/override (catalog).
   - In the Flow descriptor, declare the package-relative default prompt path. Add the
     generic Markdown default under `src/submit/prompts/`; it instructs the agent to fix
     the root cause, never bypass checks, rerun the failing check, then rerun
     `ns flow submit`.
   - Update SDK point catalog/introspection tests so the point appears with matching kind,
     semantics, description, and descriptor default source.
2. **Resolve prompt content without Pi policy**
   - Add a small Flow-owned resolver (for example
     `src/submit/submit-check-recovery.ts`) that accepts an explicit repo root plus
     injected/readable file dependencies, resolves `ns.toml` and conventional prompt
     sources through the point catalog, and otherwise returns the built-in generic
     prompt.
   - Keep the built-in fallback isolated so default-on recovery can later become opt-in
     without changing marker detection or Pi registration.
   - An unreadable/empty repo override must not strand recovery: fall back to the generic
     prompt and include a concise warning in the generated recovery message. Do not
     execute prompt content or invoke a model here.
3. **Wire the Pi completion hook**
   - Extend the Flow-specific Pi API type only with the `sendUserMessage` capability it
     needs; keep `@nseng-ai/pi` an optional peer and the CLI implementation Pi-free.
   - Supply `afterCommandComplete` from `src/pi/ns-extension.ts`. Trigger only when all
     are true: the registered command is `ns:flow:submit`, exit code is nonzero, and
     stderr contains a line exactly equal to either `FLOW_SUBMIT_CHECK_FAILURE_MARKER` or
     `` `error: ${FLOW_SUBMIT_CHECK_FAILURE_MARKER}` ``.
   - Resolve the repository root from `details.cwd` with an injected/testable filesystem
     walk-up that accepts both `.git` directories and worktree `.git` files. This is
     repository discovery only; do not import skill lookup policy or shell out.
   - Send the resolved prompt followed by a bounded context block containing the
     `ns flow submit` invocation, cwd, exit code, and tail of deterministic failure
     stderr. The failure report already names the failing check command. Recovery sends
     guidance only; it runs no command itself.
   - Non-submit commands, successful submit, failed submit without the exact marker, and
     a marker-like prose substring must not trigger recovery.
4. **Consumer policy**
   - Add `.ns/prompts/flow.submit.pre.recovery.md` in this repository. It may direct the
     agent to the repo-owned `code-just-fix` skill, must forbid bypassing checks, and must
     require rerunning the failed check followed by `ns flow submit`.
   - Do not mention `code-just-fix`, repo-relative skill paths, or this repo's `just`
     policy anywhere under `ts/packages/capabilities/flow`.
5. **Tests**
   - Add resolver tests for explicit `ns.toml`, conventional prompt, generic fallback,
     unreadable/empty override fallback, and nested-cwd repository discovery using
     injected fakes rather than ambient cwd/process mutation.
   - Extend `test/pi/ns-extension.test.ts` with default prompt, repo override, exact
     marker positive, non-marker negative, success negative, non-submit negative, and
     bounded context assertions.
   - Update descriptor/catalog tests in `ts/packages/sdk` and Flow parity tests as needed;
     no new Flow command is added.

## Files expected to change

Submit contract:

- `ts/packages/capabilities/flow/src/submit/submit-hooks.ts`
- `ts/packages/capabilities/flow/src/ns/commands/submit.ts`
- `ts/packages/capabilities/flow/src/api/index.ts`
- `ts/packages/capabilities/flow/src/phase-stream/phase-stream-specs.ts`
- `ts/packages/capabilities/flow/src/submit/submit-matrix-progress.ts`
- `ts/packages/capabilities/flow/test/unit/submit-hooks.test.ts`
- `ts/packages/capabilities/flow/test/scenario/submit-command.test.ts`
- `docs/guides/points.md` (only the flag/vocabulary alignment in this slice)

Recovery:

- `ts/packages/capabilities/flow/src/ns/extension.ts`
- `ts/packages/sdk/src/project-config/points.ts`
- `ts/packages/capabilities/flow/src/submit/submit-check-recovery.ts` (new)
- `ts/packages/capabilities/flow/src/submit/prompts/submit-check-recovery-default.md` (new)
- `ts/packages/capabilities/flow/src/pi/ns-extension.ts`
- `ts/packages/capabilities/flow/test/pi/ns-extension.test.ts`
- focused Flow resolver tests and SDK point catalog/scenario tests
- `.ns/prompts/flow.submit.pre.recovery.md` (new consumer override)

Treat this as a likely-area map, not permission to touch unrelated genericization clusters.
Implementation evidence may simplify filenames, but it must not change the settled public
contract without steering.

## Validation and completion evidence

Run targeted tests while iterating, then the repository defaults:

```sh
pnpm --dir ts exec vitest run --config vitest.config.ts \
  packages/capabilities/flow/test/unit/submit-hooks.test.ts \
  packages/capabilities/flow/test/scenario/submit-command.test.ts \
  packages/capabilities/flow/test/pi/ns-extension.test.ts \
  packages/sdk/test/unit/project-config-points.test.ts \
  packages/sdk/test/scenario/extension-points-cli.test.ts
pnpm --dir ts run check
pnpm --dir ts run lint
just
```

Completion evidence for the two slices:

- `ns flow submit --help` exposes `--no-checks` and no `--no-hooks`.
- `ns extension point flow.submit.pre` still reports the installed checks.
- `ns extension point flow.submit.pre.recovery` reports the prompt point and active
  default/override source.
- A failing configured check follows Clinkr's coarse process-exit mapping, retains the
  check code in structured `data.exitCode`, emits the raw marker as the exact first human
  stderr line for a negative result or `error: NS_FLOW_SUBMIT_CHECK_FAILURE` for a failure
  result, and performs no checkpoint or submit mutation on either presentation path.
- Pi sends recovery only for marker-bearing `ns flow submit` check failures and uses the
  generic default unless consumer prompt config overrides it.
- `rg` confirms no planned `ns flow validate`, `flow.validation.*`, general gates module,
  or Flow-package `code-just-fix` reference was introduced.
