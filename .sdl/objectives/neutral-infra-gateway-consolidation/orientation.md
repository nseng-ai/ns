# Orientation — Neutral-Infra Gateway Consolidation

Direction: `@sdl/core` is being decomposed by a four-bucket rule so each tier means one
thing — neutral-infra is pure utilities; real-world / external-tool gateways (`git`,
`github-*`, `exec`, `graphite`, `cmux`) expose capability-facing seams through
`@sdl/capability-kit` per-domain subpaths, while ADR 0019's placement gate decides whether large
real implementations stay standalone; intrinsic host services (`command-io`, `progress-phase`) are
SDK-provided (interface in `sdl-sdk`, implementation hidden in the kernel, reached via `ctx`); and
program-boot harness (`cli-entry`) lives in the kernel.

Getting to: ADR 0018 records the classification rule and per-`@sdl/core` export disposition;
ADR 0019 records the package-placement gate for large real gateway implementations; read this
objective's `objective.md` for the migration scope and `CONTEXT.md` for Capability Kit and SDK
vocabulary; keep ADRs 0009 / 0012 / 0016 in mind for the layering history.

What you see now: `@sdl/core` still exports `exec` and `github-*`, and capabilities still
import those doors directly; the `git` seam/fake has moved to `@sdl/capability-kit/git`, while
`RealGitGateway` lives in standalone `@sdl/git`; other gateway code is still split across
`@sdl/core`, `@sdl/graphite`, `@sdl/cmux`, and partially `@sdl/capability-kit`.

Avoid: adding any new real-world-I/O or external-tool surface to `@sdl/core`; importing
`@sdl/core/exec`, `@sdl/core/git`, or `@sdl/core/git/testing` from new or edited code — route I/O
through a `@sdl/capability-kit/<domain>` gateway, `@sdl/git` for the real git adapter, or through
`ctx` for an SDK-provided service; and relocating `@sdl/brmem`, which is the named exception handled
by a separate follow-up.

Active slice: see this objective's roadmap.md.
