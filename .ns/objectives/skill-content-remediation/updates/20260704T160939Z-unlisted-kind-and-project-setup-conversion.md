# `unlisted` invocation kind lands; project-setup family converted and routed

## Summary

A fifth areg invocation kind, `unlisted`, was added and used to move the eight
one-shot project-bootstrap skills off their command-backed surface, landing across
three PRs.

1. **The `unlisted` kind (commit `44612a600`, PR #2867).** areg gained an
   `unlisted` invocation kind: the invoke-only artifact bundle
   (`disable-model-invocation: true` + Codex `agents/openai.yaml`) plus the Pi
   `-skills/<name>` exclusion, and additionally **removes both mirror symlinks**
   (`.agents/skills/<name>`, `.claude/skills/<name>`). Mirror removal is the only
   lever that hides a skill from the Codex `$name` / Claude Code `/name` typeahead /
   Pi `/skill:name` surfaces — the flags alone only drop it from ambient *model*
   context. Unlike `command-backed`, `unlisted` has no Pi replacement command and is
   exempt from the verified-replacement precondition on the Pi exclusion. Verified via
   `areg skill list`: the eight leaves show `KIND unlisted`, `NATIVE hidden`,
   `PI excluded`.

2. **Eight bootstrap skills converted command-backed → unlisted (commit
   `695ea59bd`, PR #2869).** `setup-dprint`, `setup-dprint-gh-ci`, `setup-graphite`,
   `setup-pypi-publish`, `setup-python-gh-ci`, `create-python-package`,
   `create-python-dev-cli`, and `create-bun-typescript-project` had their registry
   entries and both mirror symlinks removed; Pi exclusions, Codex sidecars, and
   `disable-model-invocation` retained; real descriptions restored with a
   `metadata.category: project-setup` tag on each leaf. Verified: no
   `.agents/skills/<name>` or `.claude/skills/<name>` for any of the eight.

3. **This PR — `project-setup` router + docs.** Added the ambient router skill
   `skills/project-setup/SKILL.md` (kind `normal`; no `disable-model-invocation`, no
   Pi exclusion; it is the family's only ambient surface) with a routes table of the
   eight leaves' scope contracts and instructions to read each leaf's canonical
   `skills/<name>/SKILL.md` directly (`areg skill find` fallback). Installed via the
   standard local-skill flow: `.agents/skills/project-setup` and
   `.claude/skills/project-setup` symlinks, one normalized `skills-lock.json` entry.
   Documented the kind in ADR 0016 (Status amended, kind enumeration, decision bullet,
   consequences incl. the `unlisted-mirrors-present` drift signal, rejected
   alternatives), `docs/conventions/skill-conventions.md` (kind table row, 2×2 → five
   kinds, mirror-exception carve-outs, Pi-exclusion carve-out, policy bucket 6), and
   `docs/research/harness-skill-invocation.md` (kind enumeration + implications item 6
   on mirror removal). `areg check` clean; `project-setup` shows kind `normal`.

Provenance: manual update; evidence commits 44612a600 (PR #2867), 695ea59bd (PR #2869), and this PR's working tree.

## Objective Impact

- The Objective's systemic #1 framing — invocation governed by "areg's four kinds"
  (`normal` / `ambient-only` / `invoke-only` / `command-backed`) in both `objective.md`
  (~line 45) and `roadmap.md` (~line 7) — is now **five kinds**, with `unlisted` added
  as the no-ambient / no-human-invocation quadrant. The systemic #1 deliverable still
  holds; this is an additive taxonomy extension, not a reversal of the recorded decision.
- The `setup-*` / `create-*` skills, previously recorded as the `invoke-only` (later
  `command-backed`) set, are now `unlisted` with a single ambient router — a further
  ambient-budget reduction consistent with the Objective's thesis.
- No status flips and nothing closed; this records an invocation-mechanics extension the
  remaining per-skill remediation queue should account for.

## Follow-Ups

- Update the systemic #1 "four kinds" phrasing to "five kinds" in `objective.md` and
  `roadmap.md` on the next objective-refresh (logged here rather than rewritten inline).
- If family-level validation of `metadata.category` is later wanted, teach `areg` to read
  the tag rather than adding a parallel registry (the tag is declarative-only today).
