# ADR 0014: Clinkr Confirmation and Danger Tiers

## Status

Accepted

## Context

Human-facing commands may use confirmation to guard dangerous writes, but agents and scripts must never block on a prompt. Command authors need a consistent severity model and explicit non-interactive authorization without prematurely encoding every policy as a Clinkr framework type.

## Decision

Command authoring recognizes four danger tiers:

- **Tier 0 — read-only or inspect:** no mutation and no confirmation.
- **Tier 1 — scoped, reversible mutation:** bounded writes such as a generated file at an explicit user-supplied output path; no confirmation by default.
- **Tier 2 — destructive or external mutation:** a scoped destructive write or mutation of user or remote state; human-facing commands use `--yes`/`-y` as explicit non-interactive confirmation.
- **Tier 3 — high-blast-radius, irreversible, or hard-to-review mutation:** bulk or computed-target operations use `--force`/`-f` to relax the strong default guard, and should offer a preview or dry-run.

`--yes` means answer a confirmation affirmatively without prompting. `--force` means bypass or relax a safety precondition. They are not synonyms. A Tier 3 command may require stronger typed confirmation in addition to `--force` when its risk warrants it.

Prompts are permitted only with interactive TTY input. Non-TTY execution never prompts. Missing required authorization is a `usageError` that identifies the required flag or value. A valid invocation refused because its computed impact is unsafe is `negative` with structured impact data. A dry-run is successful inspection and returns `ok` with the intended impact.

Hidden agent-only `exec` commands are an explicit exception for scoped destructive or external writes: the operation name plus its required target and payload arguments constitute authorization. They do not add `--yes` or an interactive gate. This exception does not apply to human-facing commands.

Mutation of the user's environment outside the repository, including dotfiles and shell configuration, is Tier 2 even when idempotent. Writing to an explicit user-requested output path is Tier 1. Environment-provided identifiers alone do not automatically turn an otherwise scoped metadata write into user-environment mutation; classification follows the state actually changed.

The tiers remain an authoring and review discipline. Clinkr keeps low-level interaction plumbing, but does not add tier enums, policy metadata, or universal confirmation and preview types until repeated commands demonstrate a reusable shape.

## Consequences

- Agents and scripts either provide explicit authorization or receive an actionable non-blocking result.
- Human-facing scoped destruction and high-blast-radius overrides use different verbs that preserve intent.
- Hidden `exec` mutation remains low-friction but explicit through its operation arguments.
- User-environment writes receive stronger protection than explicit output-path writes.
- Tier correctness remains command-local and review-enforced until extraction is justified.

## Alternatives

- **Use `--yes` for every dangerous operation:** rejected because confirmation and safety-precondition override express different intent.
- **Require interactive confirmation everywhere:** rejected because non-TTY callers would block or become unusable.
- **Require `--yes` on hidden `exec` writes:** rejected because explicit agent-only operation arguments already carry the authorization signal.
- **Classify all idempotent or external writes as Tier 1:** rejected because mutating user configuration deserves scoped destructive/external protection.
- **Add first-class Clinkr danger types now:** rejected until repeated command evidence establishes the right abstraction.
