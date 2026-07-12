# Retire "kernel" from product-vision branding

Status: accepted (2026-07-12)

ADR 0035 retired the kernel brand at the package/SDK altitude and made "kernel"
anti-vocabulary in live prose, but explicitly did not ratify the product-vision
branding — `docs/north-star.md` and the docs-site still branded ns itself as "the
kernel for nonslop engineering". The kernel-sdk-rename execution parked that surface
as a separate product decision (spec "Parked and out of scope"; handoff
`decide-parked-kernel-naming-follow-ups`). Decided 2026-07-12: the product framing
retires too. One word carrying two altitudes (retired package concept, live product
brand) invites exactly the drift the rename removed, and the OS analogy was already
judged unearned at the package level.

## The decision

"Kernel" leaves all live product-vision prose. Replacements follow the north star's
own established language, split by altitude:

1. **Product/tagline altitude → "substrate".** The north star already argues "ns is
   *substrate*, a meta-harness is *orchestration*" and "bet on the substrate". The
   one-liner becomes "ns is the substrate for nonslop engineering"; the wedge becomes
   "a substrate you embed — not a harness you adopt". Docs-site title, hero, og-image
   fallback, and assistant prompt/category follow.
2. **Core-vs-extensions altitude → "core".** The old definition already glossed
   kernel as "the core part of the system that everything else is built on"; the
   section is now "The ns core", and extensions build on "the core".

Immutable history (ADRs ≤ 0035, `docs/wayfinding/**`, `.ns/objectives/**`,
`docs/retros/**`) keeps kernel wording, per the ADR 0035 boundary.

## Considered options

- **Keep the product brand, document the two altitudes**: rejected — the coexistence
  costs a standing "which kernel?" disambiguation in every glossary and review, for a
  brand the team was already skeptical of.
- **A single replacement word for both altitudes**: rejected — "substrate of the
  substrate" and "extensions built on the substrate" blur the storage-substrate
  argument the north star leans on; "core" is the natural in-document term for the
  core-vs-extensions cut.

## Consequences

- `docs/north-star.md`, docs-site home page, ai-assistant prompt/metadata, and
  og-image fallback drop kernel wording.
- Root `CONTEXT.md` needs no change: its *Avoid* entries already list kernel as
  anti-vocabulary, and no glossary entry defined the product-brand sense.
