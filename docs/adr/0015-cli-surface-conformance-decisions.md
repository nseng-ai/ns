# ADR 0015: CLI-Surface Conformance Decisions

## Status

Accepted

## Context

ADRs 0010–0014 established the Clinkr CLI contract: coarse process exit codes
(`ok=0`, `negative=1`, `failure`/`usageError=2`), a TS-native camelCase
discriminated machine envelope with published `--json-schema`, command-local
output-volume bounding, `negative(...)` as shell-visible non-success, and four
authoring danger tiers with the `--yes`/`-y` (Tier 2 confirm) vs `--force`/`-f`
(Tier 3 precondition override) verb split.

The framework-enforced gates of that contract are conformant by construction, but
the four **command-local discipline** areas the framework does not enforce —
(a) danger-tier classification, (b) output-volume bounding, (c) `errorType`
discipline, (d) `negative(...)` semantic correctness — were only spot-applied
across the 15 sdl CLI packages. The point-in-time audit
(`docs/cli-surface-conformance-audit.md`) classified every command against the
`sdl-cli-design` pre-ship checklist with file:line evidence and is the agreed
source of truth seeding the `cli-surface-conformance-remediation` Objective
(`.sdl/objectives/cli-surface-conformance-remediation/`).

That audit surfaced six contested design calls that each gate dependent
remediation rows. Several remediation classifications cannot be resolved as
`land-now-fix`, conformant, or parked until these calls are made, so the audit
left them `ADR-needed`. This ADR records all six decisions as a single
remediation-gating set so the gate is auditable as a unit rather than scattered
across five ADRs. Each decision refines, and cross-references, the ADR that
governs its area.

## Decision

### 1. `rawCommand` / raw-exit envelope policy — narrow exemption (refines ADR 0011)

Raw-exit handlers (`rawCommand` / `isRawExit`) are a **sanctioned but narrow**
exemption from the envelope / `resultSchema` / `--json-schema` pre-ship items,
**only when** the command's core contract is a TUI, a streaming protocol, or
process-control / third-party command passthrough. For those genuinely-raw
surfaces, fabricating a Clinkr envelope would misrepresent the command, so raw
exit is the honest contract.

Raw exit is **not** a general escape hatch. Ordinary agent-facing, finite-result
commands must use the Clinkr envelope (`ok`/`negative`/`failure`/`usageError`,
`resultSchema`, published `--json-schema`). Even raw commands must map genuine
backend failures to exit `2`, never exit `1` (exit `1` is reserved for semantic
non-success).

Applying this rule to today's raw commands: `packagechk` (`NAME` check,
`claim-pypi`, `claim-npm`), `sdlcc cmux report`, `vibechk run`,
`roaster exec publish-findings`, and `ccc exec autobranch` are all
finite-result commands rather than TUI/streaming/passthrough surfaces, so none of
them qualify for the exemption: each should migrate onto the envelope
(`land-now-fix`). The exemption text remains durable policy for future
genuinely-raw commands.

### 2. Hidden `exec` destructive/external writes — operation arguments are sufficient intent (lower-friction exception; refines ADR 0014)

For hidden `exec` commands that write destructive or external state — examples
include `branch-context exec delete`, `sdl address exec reply-review-thread`, and
`sdl address exec resolve-review-thread` — the explicit command name plus its
required operation arguments constitute sufficient explicit intent. These commands
do **not** require an added `--yes`/confirmation flag or interactive gate.

This is a **deliberate lower-friction exception** to a conservative reading of the
Tier 2 human-confirm model, made because the `exec` surface is agent-only, never
prompts, and already encodes intent through the required payload arguments. It is
the `agent-exec-tier.md` "required flag, fail fast non-interactively" rule read
as: the required operation arguments themselves are the explicit authorization.
Future work must not silently "fix" these into confirmation-gated commands; doing
so would re-open a decided question.

This exception is scoped to agent-only hidden `exec` destructive/external writes.
It does not relax the Tier 2 `--yes`/`-y` requirement for human-facing destructive
commands.

### 3. `ccc land` single-PR fast path — auto-merge is intentional (lower-friction exception)

The `ccc land` single-PR fast path may merge to trunk without the confirmation
the stack paths require. This is a **deliberate lower-friction workflow choice**
and is recorded here as an accepted exception with rationale: the single-PR path
is the common, low-ambiguity case, and requiring a confirmation step there would
add friction without materially reducing risk for an operator who invoked land on
one PR.

`ccc land`/`land-stack` is a Pi slash-command surface on the bespoke
`LandStackResult` framework, not a Clinkr CLI, so this is a product-safety
decision rather than an envelope decision; the rest of that surface's
envelope/`errorType`/`negative` rubric remains parked as framework-mismatched.

### 4. Query-miss vs action-miss semantics — predicate `ok`, dereference/action `negative` (refines ADR 0013)

Pure presence/query/predicate/list commands MAY answer a miss with `ok(...)`
(exit 0) — `ok(found:false)`, `ok(present:false)`, or an explicit empty result —
because absence is a normal answer to the question asked.

Commands that dereference or act on a **specific requested target** (fetch this
object in order to use it, or mutate this named thing) return `negative(...)`
(exit 1) on a miss, because the requested operation did not succeed.

This resolves the `pr-address` inconsistency by rule rather than by forcing
uniformity: lookup primitives (`pr-details`, `branch-pr`, `pr-checks`) keep
`ok(found:false)`; feedback/action-target misses (`download-feedback`,
`map-branch-prs`) keep `negative`.

### 5. Empty-success and presence-query `ok` — ratified (refines ADR 0013)

Harmless empty success and presence predicates are ratified as `ok(...)` (exit 0)
carrying explicit empty/false data, distinct from semantic `negative`. Concretely:
`brmem export` with zero entries returns `ok`; `branch-context exec check` and
`brmem check` return `ok(present:false)` for an absent entry.

This is the standard for query/no-op outcomes. It is consistent with decision 4:
where a command represents a requested **action** that found nothing to act on
(for example `brmem copy` with an empty source selection), the miss is a
`negative`, not an `ok` and not a `failure`.

### 6. Dotfile / user-environment external writes — Tier 2, except explicit output paths (refines ADR 0014)

Idempotent writes that mutate the **user environment outside the repo** (dotfiles,
shell configuration, external tool state) are **Tier 2**: they should expose
`--yes`/`-y` with TTY-gated confirmation and fail fast non-interactively with a
`usageError` naming the flag. Explicit user-requested output-path writes
(`--output <path>`) remain Tier 1.

Applying this: `sdl shell install` writes a managed marker block to a user
dotfile, so it is **Tier 2**. By contrast, `sdlcc cmux report` writes reversible
external cmux surface metadata keyed by environment-provided IDs rather than
mutating a user dotfile, so it stays **Tier 1** on the danger dimension; its real
remediation is the envelope migration from decision 1, not a confirmation gate.
The dotfile rule should not be over-applied to environment-driven metadata writes.

## Consequences

- Every previously `ADR-needed` row in `docs/cli-surface-conformance-audit.md` is
  now classifiable. Specifically:
  - `branch-context exec delete`, `sdl address exec reply-review-thread`, and
    `sdl address exec resolve-review-thread` (a): conformant by decision 2.
  - `pr-address` query-miss vs action-miss (d): conformant by decision 4.
  - `branch-context exec check` empty/absent (d): conformant by decision 5.
  - `ccc land` single-PR fast path (a): conformant by decision 3 (rest of the Pi
    surface stays parked).
  - raw-exit envelope opt-out (`packagechk`, `sdlcc cmux report`, `vibechk run`,
    `roaster publish-findings`, `ccc autobranch`): `land-now-fix`
    envelope-migration by decision 1.
  - `sdl shell install` (a): `land-now-fix` (add `--yes`/`-y` +
    `requireInteractiveOrUsageError`) by decision 6.
- `sdl-cli-design` gains durable authoring guidance for three points: the raw-exit
  narrow exemption (decision 1), hidden-`exec` write intent (decision 2), and the
  dotfile/user-environment Tier 2 rule (decision 6).
- Decisions 2 and 3 are accepted lower-friction exceptions. They are durable
  policy, not drift; reversing them requires a new decision.
- The remediation rows in the Objective's roadmap (areas a/d/c/b) can now proceed,
  because none of them is blocked on an unresolved design question.

## Rejected Alternatives

- **No raw-exit exemption; migrate every raw command to the envelope (decision
  1).** Cleaner uniformity, but it would force a fabricated envelope onto genuine
  TUI/streaming/passthrough surfaces where exit-code-and-stream is the honest
  contract. The narrow exemption keeps the strong default while leaving an honest
  path for true raw surfaces.
- **Apply the human-tier Tier 2 prompt/`--yes` model to hidden `exec` writes
  (decision 2).** Safer in the abstract, but agents never see a prompt and already
  pass explicit operation arguments, so a confirmation layer adds ceremony without
  adding intent on an agent-only surface.
- **Require confirmation on the `ccc land` single-PR fast path (decision 3).**
  Consistent with the stack paths, but it adds friction to the common,
  low-ambiguity case for an operator who explicitly invoked land on one PR.
- **Force uniform miss semantics — make all misses `negative`, or all `ok`
  (decision 4).** Either is simpler to state but wrong for half the cases: pure
  predicates should answer normally, while requested-target dereferences should be
  shell-visible non-success.
- **Treat all idempotent external writes as Tier 1 (decision 6).** Simpler, but a
  write that mutates the user's shell/dotfiles outside the repo is exactly the
  scoped-external-mutation case Tier 2 exists for; explicit output-path writes are
  the right Tier 1 carve-out.
