# ADR 0014: Clinkr Confirmation and Danger Tiers

## Status

Accepted

## Context

The agent-era CLI survey (`docs/agent-era-cli-design-survey.md`) lists
confirmation and danger tiers as an unresolved decision. clig.dev gives
human-first guidance: confirm dangerous operations, escalate confirmation
strength with severity, provide scriptable alternatives such as `--force` or
explicit confirmation values, and support `--dry-run` so users can inspect
intended changes. Agent-era guidance starts from a different consumer: an LLM or
script that must never block on an interactive prompt, that reads output back
into a bounded context window, and that needs explicit, recoverable signals
instead of a hung TTY.

The Clinkr gap audit
(`.sdl/objectives/agent-cli-design-discipline/references/clinkr-agent-era-gap-audit.md`)
found that Clinkr has an interactive yes/no seam only:
`ClinkrInteraction.confirm` takes a `message` plus `defaultAnswer` and returns
`confirmed` / `declined` / `aborted` (`ts/packages/infra/clinkr/src/confirmation.ts`).
That seam is useful plumbing, but it does not by itself express destructive
severity, typed previews, required confirmation phrases, `--force` semantics,
dry-run requirements, or non-interactive fail-fast behavior. The audit
classified this as ADR-needed before any framework API work, and predicted a
hybrid outcome: keep `confirm` as the low-level primitive, define
command-authoring rules now, and add framework metadata only if repeated
commands need it.

ADR 0010, 0011, and 0013 already settled the surrounding contract this ADR builds
on. Process exit codes are coarse (`ok=0`, `negative=1`, `failure/usageError=2`)
and detailed semantics live in a camelCase discriminated machine envelope with
`status`, `exitCode`, optional `errorType`, `message`, and `data`. This ADR must
fit confirmation and danger behavior into that existing envelope rather than
inventing a parallel failure channel.

The subobjective driving this decision is
`.sdl/objectives/clinkr-confirmation-danger-tiers`: decide the policy, then make
the minimal Clinkr changes needed so framework behavior matches the policy.

## Decision

### Danger tiers

SDL/Clinkr command authoring recognizes four danger tiers. Tiers are an authoring
and review discipline taught by `sdl-cli-design`; they are not yet a Clinkr
framework type.

- **Tier 0 — read-only / inspect.** No mutation. No confirmation. Must be safe to
  run unattended by agents and scripts.
- **Tier 1 — scoped, reversible mutation.** Bounded, easily reversible writes such
  as updating a local cache or writing a generated file to an explicit output
  path. No confirmation by default. Human output should state what changed;
  machine output should identify changed targets.
- **Tier 2 — destructive or external mutation.** Deleting a named resource,
  closing a named issue, mutating a remote/Branch Memory record, or other
  non-trivial but scoped destructive writes. Interactive humans may be prompted;
  non-interactive callers must supply explicit intent and must not be prompted.
  Prefer offering a preview/dry-run or a typed summary before acting when
  practical.
- **Tier 3 — high blast radius / irreversible / hard to review.** Bulk deletion or
  archival, irreversible remote mutation, destructive Git/Graphite operations
  across many branches, or any operation whose computed target set could be much
  larger than the caller intended. Strongly prefer a dry-run/preview first.

### Tier 3 standardizes on `--force` / `-f`

Tier 3 operations standardize on `--force` (short `-f`) as the required explicit
authorization. By default a Tier 3 command refuses to perform a
high-blast-radius or computed-target-set operation; `--force` is what relaxes
that default guard, so it is the correct verb rather than a generic confirmation.
This matches the established local convention: `-f` is already the short alias
for `--force` on the existing Tier 3 destructive/bulk commands (`brmem put`,
`handoff gc`, `slot gc`). `handoff delete` was later audited as Tier 2 scoped
deletion and moved to `--yes`/`-y`.

`--force` / `-f` is the non-interactive authorization for Tier 3: when it is
present the command proceeds without prompting; when it is absent in a
non-interactive context the command fails fast as a `usageError` naming the
missing flag. Tier 3 commands should not rely on a bare interactive `y/N` prompt
as their only guard, because a single keystroke is too weak for a computed,
potentially large target set. Commands should still offer a dry-run/preview and
describe the computed impact in human and machine output.

Individual commands remain free to require stronger confirmation on top of
`--force` — a typed target name, an exact count token, or a `--confirm <value>`
phrase — when their blast radius or irreversibility warrants it. The standard
floor is `--force`/`-f`; the command-local rule may be stricter, and that
stricter choice should be documented in help text and the command's design notes.

### `--yes` versus `--force`

These are different options with different meanings and must not be treated as
synonyms:

- `--yes` (short `-y`) means "answer the confirmation affirmatively without
  prompting." It is the non-interactive equivalent of a human typing `y`, and is
  the standard authorization for Tier 2 scoped destructive operations.
- `--force` (short `-f`) means "bypass or relax a safety precondition" — for
  example, overwriting an existing target, acting despite a dirty state, or
  proceeding past the default Tier 3 guard. It is the standard authorization for
  Tier 3 high-blast-radius operations.

The danger tiers therefore escalate the verb as well as the severity: Tier 2 uses
`--yes`/`-y` to confirm a scoped destructive write, and Tier 3 uses `--force`/`-f`
to override the strong default guard on a high-blast-radius or computed-set
operation. A command may need neither, either, or both flags; `--force` should be
rarer, more command-specific, and more conservative than `--yes`.

### Non-interactive behavior

Non-interactive contexts (agents, `exec` subgroups, scripts, any non-TTY stdin)
must never block on a confirmation prompt. Interactive prompting via
`ClinkrInteraction.confirm` is permitted only when stdin is an interactive TTY.

When a destructive command runs non-interactively without the required
authorization:

- If the missing authorization is an invocation problem — a required `--yes`
  (Tier 2), `--force`/`-f` (Tier 3), or a command-specific `--confirm` value was
  not supplied — the command fails as a `usageError` (exit `2`) whose machine
  `data` names the missing flag or confirmation value and how to supply it.
- If the command ran with valid invocation but deliberately refused because the
  computed impact is unsafe to proceed with (for example, the target set is larger
  than an allowed bound), that is a semantic `negative(...)` (exit `1`) carrying
  structured impact data, not a usage error.

### Dry-run and preview

`--dry-run` describes the intended changes without performing them and should be
offered for Tier 2 and Tier 3 operations where a caller benefits from inspecting
impact first. A dry-run is a successful inspection: it returns `ok(...)` with the
computed plan/impact as structured data, not `negative(...)`.

### Framework scope for this slice

`ClinkrInteraction.confirm` remains the only confirmation primitive Clinkr ships
in this slice. This ADR does not add danger-tier enums, a confirmation-policy
metadata field, a `--yes`/`--force`/`--dry-run` framework convention, or typed
preview types to Clinkr now. Those are authoring rules in `sdl-cli-design` and
command-local options.

The follow-up audit for `clinkr-confirmation-danger-tiers` should make the
smallest changes needed for Clinkr behavior to match this policy — most plausibly
confirming that interactive prompting is correctly TTY-gated and that
non-interactive callers fail fast rather than block. First-class danger-tier
framework APIs are extracted only when repeated real commands prove the same
shape is needed.

## Consequences

- `sdl-cli-design` can teach a concrete four-tier model with hard rules for
  prompts, non-interactive failure, `--yes`/`--force` distinction, and dry-run,
  each mapped to existing Clinkr exit/envelope semantics.
- Agents get a predictable contract: destructive commands either accept explicit
  non-interactive authorization or fail fast with actionable envelope data; they
  never hang on a prompt.
- The verb-per-tier standard (`--yes`/`-y` for Tier 2, `--force`/`-f` for Tier 3)
  must be reflected consistently in command options and docs; commands that
  conflated confirmation with precondition override need cleanup as they are
  touched. Existing `-f`/`--force` Tier 3 commands (`brmem put`, `handoff gc`,
  `slot gc`) match the Tier 3 standard; scoped deletion commands such as
  `handoff delete` use `--yes`/`-y`.
- Because tiers stay command-local discipline rather than framework type, tier
  correctness depends on authoring and review until repeated patterns justify a
  shared Clinkr surface.
- Refusal-by-impact maps to `negative(...)` and missing-authorization maps to
  `usageError`, keeping process exit semantics consistent with ADR 0010/0013.

## Rejected Alternatives

- **Require typed/target-specific confirmation for all Tier 3 operations.** This
  is safer for the worst cases but over-constrains many severe-but-routine
  operations and pushes ceremony onto agents; the accepted floor is `--force`/`-f`
  and commands that need more can still layer a typed `--confirm` on top.
- **Authorize Tier 3 with a generic `--yes` instead of `--force`.** This keeps a
  single confirmation verb across tiers, but it conflates "confirm a scoped
  write" with "override the strong guard on a high-blast-radius operation," and
  ignores the existing local convention that already exposes `-f`/`--force` on the
  bulk/destructive commands.
- **Add a first-class Clinkr danger-tier API now** (tier enum, confirmation-policy
  metadata, framework `--yes`/`--force`/`--dry-run`, typed previews). This would
  improve consistency and discoverability, but freezes an abstraction before
  enough commands demonstrate the right shape; deferred until evidence appears.
- **Treat `--yes` and `--force` as one flag.** Simpler surface, but it conflates
  "confirm the prompt" with "override a safety precondition," which hides intent
  and makes forceful behavior too easy to trigger accidentally.
- **Allow interactive prompts to block in any context.** Matches naive human-first
  CLIs, but a prompt that blocks an agent or script is a broken tool contract;
  prompting must be TTY-gated.
- **Leave confirmation entirely command-local with no written policy.** Avoids
  premature framework policy, but ignores the survey finding that dangerous writes
  need visible, consistent intent. The accepted compromise is written tier policy
  now, framework extraction later.
