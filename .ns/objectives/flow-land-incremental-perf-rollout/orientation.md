**Direction: Flow land performance changes land only as small, individually dogfooded, git-revertible slices through this Objective.**

Getting to: each improvement prototyped in the unmerged `flow-land-perf-baselines` reference stack is freshly re-derived as its own revertible PR, gated by real-use dogfooding and an explicit user declaration before the next risky slice; telemetry and the fake-backed scenario counts stay the evidence backbone.

What you see now: telemetry, per-run XDG/state diagnostics, and four landed conservative optimizations exist in trunk (`ts/packages/capabilities/flow/src/land/stack/external-call-telemetry*.ts`); the risky primitive changes (lease-based push/retarget, GraphQL merge) exist only on the unmerged reference stack ending at `flow-land-perf-baselines`.

Avoid: landing, rebasing, cherry-picking from, or building on the reference stack branches; changing flow-land merge/push primitives or safety gates outside this Objective; runtime feature flags or dual code paths in flow land; ad-hoc timers or metrics databases.

Active slice: see this objective's roadmap.md.
