# Human tier (clig.dev-grounded)

Human output is a text UI. It may evolve freely (unlike the machine envelope),
but it must stay honest and low-noise. Source: clig.dev, summarized in
`docs/research/agent-era-cli-design-survey.md`.

## Rules

- **Help is boring and complete.** Concise default help; full `-h`/`--help` with
  a one-line synopsis, the common flags, and at least one realistic example.
  Clinkr generates structure from schemas — keep descriptions tight and accurate.
- **State changes are visible.** A command that mutates state must say what it
  did, so a human never wonders whether it hung or silently did something
  surprising. Keep success output brief but not silent.
- **Errors are rewritten for humans.** Catch expected errors, restate them in
  plain language, cut noise, and suggest the next action. Raw stack traces are
  debug-only, never the primary error surface.
- **stderr vs stdout.** Human status, progress, and negative/error messaging go
  to stderr; the primary result goes to stdout. In human mode a `negative(...)`
  message renders to stderr while still exiting 1 (ADR 0013).
- **TTY, color, pager.** Rich formatting, color, and paging are for interactive
  TTYs only. Degrade to plain line-oriented output when stdout is not a TTY so
  pipes and captures stay clean. Never auto-switch the *machine* contract on TTY —
  only the *human* presentation (see the agent tier on explicit formats).
- **Prompts are TTY-only.** Confirmation prompts may appear only when stdin is a
  TTY (`ClinkrInteraction.isInteractive()`); otherwise fail fast with guidance.

## Anti-patterns

- Silent success on a destructive or state-changing command.
- Dumping raw JSON or tracebacks as the human default.
- Color/pager codes leaking into piped output.
- Asking an interactive question with no non-interactive escape hatch.
