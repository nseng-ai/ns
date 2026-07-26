# ADR 0014: Clinkr Confirmation and Danger Tiers

## Status

Accepted

## Context

Human-facing commands may use confirmation to guard dangerous writes. Agents and scripts must never block on prompt. Command authors need consistent severity model and explicit non-interactive authorization without prematurely encoding every policy as Clinkr framework type.

## Decision

Command authoring recognizes four danger tiers:

- **Tier 0 — read-only or inspect:** no mutation, no confirmation.
- **Tier 1 — scoped, reversible mutation:** bounded writes such as generated file at explicit user-supplied output path; no confirmation by default.
- **Tier 2 — destructive or external mutation:** scoped destructive write or mutation of user or remote state; human-facing commands use `--yes`/`-y` as explicit non-interactive confirmation.
- **Tier 3 — high-blast-radius, irreversible, or hard-to-review mutation:** bulk or computed-target operations use `--force`/`-f` to relax strong default guard; should offer preview or dry-run.

`--yes` means answer confirmation affirmatively without prompting. `--force` means bypass or relax safety precondition. Not synonyms. Tier 3 command may need stronger typed confirmation beyond `--force` when its risk warrants it.

Prompts permitted only with interactive TTY input. Non-TTY execution never prompts. Missing required authorization is `usageError` naming required flag or value. Valid invocation refused for unsafe computed impact is `negative` with structured impact data. Dry-run is successful inspection, returns `ok` with intended impact.

Hidden agent-only `exec` commands are explicit exception for scoped destructive or external writes: operation name plus its required target and payload arguments constitute authorization. No `--yes`, no interactive gate. Exception does not apply to human-facing commands.

Mutation of user's environment outside repository, including dotfiles and shell configuration, is Tier 2 even when idempotent. Writing to explicit user-requested output path is Tier 1. Environment-provided identifiers alone do not automatically turn otherwise scoped metadata write into user-environment mutation; classification follows what state changes.

Tiers stay authoring and review discipline. Clinkr keeps low-level interaction plumbing; no tier enums, policy metadata, universal confirmation and preview types until repeated commands show reusable shape.

## Consequences

- Agents and scripts either provide explicit authorization or get actionable non-blocking result.
- Human-facing scoped destruction and high-blast-radius overrides use different verbs that preserve intent.
- Hidden `exec` mutation stays low-friction, explicit through its operation arguments.
- User-environment writes get stronger protection than explicit output-path writes.
- Tier correctness stays command-local, review-enforced until extraction justified.

## Alternatives

- **Use `--yes` for every dangerous operation:** rejected because confirmation and safety-precondition override express different intent.
- **Require interactive confirmation everywhere:** rejected because non-TTY callers would block or become unusable.
- **Require `--yes` on hidden `exec` writes:** rejected because explicit agent-only operation arguments already carry authorization signal.
- **Classify all idempotent or external writes as Tier 1:** rejected because mutating user configuration deserves scoped destructive/external protection.
- **Add first-class Clinkr danger types now:** rejected until repeated command evidence establishes right abstraction.
