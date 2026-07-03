# Semantic Update: slot TS cd-directive + clipboard primitives

Implemented primitive-only TypeScript support for the parent-shell cd directive and clipboard copying.

Preserved contracts:

- The cd-directive env var is exactly `SLOT_CD_DIRECTIVE_FILE`.
- `activeCdDirectivePath` treats unset and empty values as inactive.
- `writeCdDirectiveIfActive` reports `inactive`, `written`, or `failed`; writes the bare destination path string; fails when the parent directory is missing or writing fails.
- The API accepts `enabled=false` so later navigation commands can suppress parent-shell cd writes in JSON/schema modes.
- Clipboard copying preserves tri-state semantics at the primitive level: copied/skipped-by-caller capability plus failure reasons `backend_missing` and `subprocess_error`.
- Clipboard implementation is over an injected runner/fakeable gateway; tests do not touch the real clipboard.

Validation:

- `pnpm --dir ts/packages/slot run test` — pass.
- `pnpm --dir ts/packages/slot run check` — pass.

Scope note:

- This update intentionally covers only the primitive subset. It does not implement `slot shell show|install`, `slot completion show|install`, navigation commands, rc-file mutation, or the later real-shell wrapper parity check. The OS-coupled roadmap row remains unchecked.
