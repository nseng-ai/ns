# Stack-view promoted through a process-owning Pi host

## Summary

Stack-view is promoted from `@internal/pi-tools` into Flow with its behavior tests, `/stack:view` name, enrichment, compose side-session, and summarize behavior intact. Its parity record is now FULL through `ns flow stack`.

The new Flow-local Pi Command Host runs only caller-supplied extension factories in Pi's real interactive runtime while suppressing ambient extensions, skills, prompts, and context files. The host is deliberately unexported incubation infrastructure. Upstream Pi owns successful terminal shutdown and calls `process.exit(0)`, so `ns flow stack` uses the sanctioned raw/process-owning command path; pre-ownership failures still map to exit 2.

## Objective Impact

The promotion plan and execution rows are complete. The command name remains `/stack:view` by decision, so namespace normalization for this surface is no longer open. The existing GraphQL loader is an accepted residual because `stack-repair-loop-hardening`, which owned the intended enriched backend, was abandoned.

The Objective remains open for the separate `gt:squash-stack` normalization work and for evidence from a second Pi Command Host consumer before promotion toward `@nseng-ai/pi`.

## Follow-Ups

- Validate `ns flow stack` manually in a real TTY: panel opens, `q` exits, snapshot remains in scrollback, and terminal state is restored.
- Add a second consumer before promoting Pi Command Host out of Flow.
- Keep the sanctioned-primitive data-backend migration separate from this accepted GraphQL residual.
