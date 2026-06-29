# Update: kebab-case serialized machine values + camelCase property names

## Convention decided (ADR 0010)

SDL-owned serialized machine-contract values use a single, breaking convention:

- **JSON property names are camelCase** (`errorType`, `exitCode`, `slotName`, `projectDir`).
- **Enum-like serialized values are kebab-case** (`registry-check-failed`,
  `branch-context-error`, `dry-run`, `prompt-not-found`) — this covers Clinkr
  `errorType` values and command-local `code` / `type` / `status` / `kind`
  discriminants that cross an SDL CLI/API JSON boundary.
- Direct breaking migration: emit the new spelling only. No dual spellings, no
  backward-compatibility alias layer (SDL is private/unreleased).

This reverses the polarity of the original `cli-surface-conformance-audit.md`,
which had treated snake_case as expected and kebab-case as a violation. The audit
now carries a banner noting the supersession; ADR 0010, `skills/sdl-cli-design`
(SKILL + `clinkr-api-map` + `checklist`), and this roadmap agree on the rule.

## Scope and exclusions

- **In scope:** Clinkr `failure(...)` / `errorType` values, CLI JSON/result
  discriminants, and gateway/API `code` values that are serialized through SDL
  CLI/API/persisted-JSON boundaries — plus the property names of those contracts.
- **Excluded (preserved):** external wire formats modeled as TypeScript literal
  unions where practical — GitHub REST/GraphQL fields (`pr_number`,
  `head_ref_name`, check-kind values, …), Anthropic usage counters
  (`input_tokens`, `cache_read_tokens`, …), Pi transcript/runtime-event shapes
  (`tool_call_id`, `turn_end`, …), Graphite/git plumbing, and Node error codes.
- **Excluded (left as-is):** purely internal TypeScript discriminated-union tags
  that are never serialized across an SDL boundary (e.g. autobranch result
  `kind`s, kernel extension-diagnostic `code`s, slot planning discriminants).

## Work landed

- **Values → kebab-case** across: Clinkr `failure(...)` error types and
  `errorType` literals (all packages); packagechk (`registry-check-failed`,
  `dry-run`); slot lifecycle/gc/clipboard/redirect discriminants; address
  (`github-pr`, `repo-context-required`); aretro PayloadError codes and evidence
  kinds; areg check issue codes + operation type/status + skillx format; ccc cmux
  report codes; sdlcc cmux report codes; objective storage statuses; brmem/plans/
  branch-context/handoff error types.
- **Property names → camelCase** across the same SDL-owned contracts (e.g.
  `slot_name`→`slotName`, `error_type`→`errorType`, `project_dir`→`projectDir`,
  `rc_path`→`rcPath`, `is_already_installed`→`isAlreadyInstalled`,
  address summary counts, sdlcc cmux-report fields).
- **Cross-package consumer reconciliation:** consumers that re-parse another
  package's CLI JSON were realigned to the new shape (address output consumed by
  `hosts/pi`, `local-pi-tools/pr-previews`, `local-pi-tools/pr-feedback-watch`;
  slot stack-map output consumed by `hosts/sdlcc`; brmem output consumed by
  `infra/core`).

## Guard added

`SDL_TS_BAN_SNAKE_CASE_CLI_MACHINE_VALUE` in the TypeScript style guard
(`ts/packages/infra/core/test/support/typescript-style-guard/source-rules.ts`)
flags snake_case string-literal first arguments to Clinkr `failure(...)` and
snake_case `errorType` property values. It is intentionally narrow (high-confidence
Clinkr surfaces only) and does not police arbitrary `code`/`type`/`status` values,
which require per-call classification.

## Deferred / follow-up

- Deeper modeling of the generic Branch Context / Plans error wrappers (replace
  opaque collapse with modeled kebab-case `errorType` + structured recovery
  `data`). The casing migration is complete; the modeling expansion remains
  Area (c) follow-up and is intentionally bounded out of this slice.
- External value sets left as `string` where the complete known set could not be
  safely enumerated from outside the owning gateway (e.g. Graphite
  `validationResult`, GitHub `state`/`status`/`conclusion`).
