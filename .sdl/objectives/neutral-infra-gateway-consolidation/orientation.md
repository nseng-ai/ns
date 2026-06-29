# Orientation — Neutral-Infra Gateway Consolidation

Direction: `@sdl/core` is being decomposed by a four-bucket rule so each tier means one
thing — neutral-infra is pure utilities; real-world / external-tool gateways (`git`,
`github-*`, `exec`, `graphite`, `cmux`) live in `@sdl/capability-kit` as per-domain subpaths
co-locating interface + real + fake; intrinsic host services (`command-io`, `progress-phase`)
are SDK-provided (interface in `sdl-sdk`, implementation hidden in the kernel, reached via
`ctx`); and program-boot harness (`cli-entry`) lives in the kernel.

Getting to: read this objective's `objective.md` for the classification rule and the
"reached-through-`ctx` ⇒ SDK-provided" test; the umbrella `sdl-extension-architecture` ADRs
0009 / 0012 / 0016 for the layering; `CONTEXT.md` for Capability Kit and SDK vocabulary.

What you see now: `@sdl/core` still exports `exec`, `git`, and `github-*`, and capabilities
import them directly (~112 `exec`, ~45 `git` sites); gateway code is split across `@sdl/core`,
`@sdl/graphite`, `@sdl/cmux`, and partially `@sdl/capability-kit`.

Avoid: adding any new real-world-I/O or external-tool surface to `@sdl/core`; importing
`@sdl/core/exec` or `@sdl/core/git` from a new or edited capability — route I/O through a
`@sdl/capability-kit/<domain>` gateway, or through `ctx` for an SDK-provided service; and
relocating `@sdl/brmem`, which is the named exception handled by a separate follow-up.

Active slice: see this objective's roadmap.md.
