# Validation gates + recovery — implementation plan

Working plan for the roadmap's validation-gates, `flow validate`, and recovery slices.
The README (`README-draft.md`) is the contract; this file is execution detail and loses
any conflict with it. Verified against the codebase 2026-07-09.

## Verified mechanics

- Point definitions are duplicated: kernel `builtInPointDefinitions`
  (`ts/packages/kernel/src/project-config/points.ts:37-57`) AND flow's descriptor
  (`ts/packages/capabilities/flow/src/ns/extension.ts:6-19`). Runtime consumption uses
  the sync `loadPointCatalog` (built-ins only); descriptor points surface only through
  `loadPointCatalogWithDescriptors` (the `ns extension points` commands) and only for
  ns.toml-declared extensions. **Every point change edits both places.**
- Migration-diagnostic precedent: `LEGACY_FLOW_HOOKS_SETTING_SCHEMA` +
  `formatCatalogDiagnostic` (`flow/src/submit/submit-hooks.ts:41-45,167-172`). The old
  point id will surface as `point_installation_undefined` (error, `path:
  "points.<id>"`); special-case its message flow-side, keyed on code + path.
- Default-prompt fallback precedent: `resolvePrDescriptionPrompt`
  (`flow/src/submit/pr-description.ts:263-300`) — default `.md` loaded via
  `import.meta.url`.
- Submit runs hooks on two paths: non-TTY phase-stream
  (`flow/src/ns/commands/submit.ts:154-174`) and TTY matrix (`:283-306`). Marker
  survives because gate failures use `failurePresentation: "deterministic"`
  (stderr verbatim, `submit.ts:490-492`) — guard with a test.
- Pi bridge sees only `CliCommandOutputDetails` (exit code + text); `cwd` is present.
  Repo-root discovery needs a walk-up (pattern: `resolveSkillLookupProjectRoot`,
  `pi/src/kit/skills/lookup.ts:100+`).
- Command runner seam: `createNsCommandRunner(ctx)` (`flow/src/submit/ns-runtime.ts:31`).
- Pi parity is derived from `NS_FLOW_COMMANDS` (`flow/src/pi/ns-extension.ts:35-76`);
  only the hand-written list in `test/pi/ns-extension.test.ts` needs a manual edit.
- Scenario tests use `runFlowCommandWithFakes` (`test/scenario/flow-command-fakes.ts`)
  with scripted exec fakes; help coverage is host-level, not per-command.

## Steps

1. **Point rename + recovery point** (kernel built-ins + flow descriptor + repo
   `ns.toml`): `flow.submit.pre` → `flow.validation.pre-submit`; add
   `flow.validation.recovery` (prompt, override). Migration message for the old id.
   Update `ts/packages/kernel/test/scenario/extension-points-cli.test.ts`,
   `ts/packages/capabilities/harness-artifacts/test/ns-toml.test.ts:19` (inert
   fixture), user-facing strings (`submit.ts:73,83-97`, `phase-stream-specs.ts:69-76`,
   `submit-matrix-progress.ts:112-115` — keep phase key `"hooks"`), and
   `docs/guides/points.md` examples.
2. **Gates module**: `flow/src/validation/gates.ts` supersedes `submit-hooks.ts`
   (delete old; no dual paths). Fixed registry `VALIDATION_GATES = { "pre-submit": ... }`;
   ports of load/run/parse/exit-code helpers; exported
   `FLOW_VALIDATION_FAILURE_MARKER` as the failure heading prefix (built via
   `formatCommandResultFailure` title, includes gate name); submit-specific trailer
   lines ("Submission was not attempted.", `--no-hooks` hint) appended by the caller.
   Rewire both submit paths. Tests: port `test/unit/submit-hooks.test.ts` →
   `validation-gates.test.ts`; update `test/scenario/submit-command.test.ts` fixtures
   and failure assertions.
3. **Recovery resolution**: `flow/src/validation/recovery.ts` —
   `resolveValidationRecoveryPrompt({cwd})`: walk up to repo root, `loadPointCatalog` +
   `resolvePromptPointSource`/`resolvePromptPointPath`, read file, fall back to the
   built-in default prompt (`flow/src/validation/prompts/validation-recovery-default.md`).
   Keep the default fallback an isolated branch (opt-in flip = two lines). New unit
   test: conventional path, ns.toml path, default fallback, subdirectory walk-up.
4. **`ns flow validate [gate]`**: new `flow/src/ns/commands/validate.ts` (read
   `skills/ns-cli-design/SKILL.md` first); positional optional `gate`; no-arg → list
   gates + installed commands; unknown gate → negative with available gates; run →
   stream output, fail via `exitCodeToFlowCommandExit` with marker-formatted stderr.
   Register in descriptor entries + package.json export; add to `NS_FLOW_COMMANDS`.
   New `test/scenario/validate-command.test.ts`.
5. **Pi bridge rework** (`flow/src/pi/ns-extension.ts`): drop `expandRepoSkillBlock`,
   the `code-just-fix` constant, and prose sniffing. Detect
   `exitCode !== 0 && stderr.includes(FLOW_VALIDATION_FAILURE_MARKER)`; resolve recovery
   prompt; `sendUserMessage(prompt + context block)` (command, cwd, exit code,
   24k tail-truncated output — keep `truncateOutputTail`). Rewrite bridge tests:
   default prompt, conventional override, non-marker negative, exit-0 negative.
6. **Consumer artifact**: `.ns/prompts/flow.validation.recovery.md` in this repo —
   points the agent at `code-just-fix`, forbids `--no-hooks`, rerun the failed command.
7. **Docs**: points-guide implementer section + `cardinality`↔`semantics` mapping;
   root `AGENTS.md` routing line to the guide.

## Validation

`pnpm --dir ts run check` / `run lint`, targeted vitest (flow, kernel,
harness-artifacts), full `just`. Smoke: `ns flow validate`, `ns flow validate
pre-submit`, `ns extension points`, `ns extension point flow.validation.recovery`,
old-id migration message in a scratch config. End-to-end: `ns flow submit` exercises
the renamed gate itself.
