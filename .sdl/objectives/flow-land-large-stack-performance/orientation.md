**Direction: Flow land performance work is evidence-led through shared external-call telemetry.**

Getting to: `/sdl:flow:land` emits structured timing/count/quota facts for Graphite, `gh`, and direct GitHub API interactions, with lightweight XDG/state JSON diagnostics and concise verbose summaries.

What you see now: telemetry events, per-run XDG/state JSON diagnostics, and verbose summaries exist (`ts/packages/capabilities/flow/src/land/stack/external-call-telemetry*.ts`); a fake-backed call-count/quota baseline is asserted in `land-stack-command-scenarios.test.ts`, so call-volume optimization rows are actionable — wall-time evidence still needs a human-driven real run.

Avoid: ad-hoc one-off timers, durable metrics databases, speculative restack/merge rewrites, or dropping safety gates to save subprocesses.

Active slice: see this objective's roadmap.md.
