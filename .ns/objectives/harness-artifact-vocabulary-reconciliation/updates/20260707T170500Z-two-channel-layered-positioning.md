# Semantic Update: two-channel positioning landed as a layered-management story

## Summary

Roadmap row 3 (two-channel positioning) is done, told as a layer/overlay story rather than a flat channel list (user-confirmed framing):

- `docs/conventions/skill-conventions.md`: the "Managing Skills With `npx skills`" section is retitled **"Skill Management Channels"** and now presents the four-layer stack — (1) first-party npm-module-bundled provisioning via `ns skills` / `ns update` with the `.ns-harness-artifacts-manifest.json` install manifest, (2) repo-local first-party skills (`skills/<name>/` + symlink layout, `skills-lock.json` `sourceType: "local"`), (3) third-party acquisition via `npx skills` (vendored real directories, `sourceType: "github"`), (4) `areg` as whole-project inspector over both complementary records and harness-overlay manager. The Skill Invocation Kinds section gains one sentence naming the **overlay seam** invariant for externally sourced skills: upstream owns skill content, the repo owns invocation policy, overlays are re-derived (not hand-merged) on upstream refresh. No other restructuring; no dangling section-anchor references found outside preserve-historical retros.
- `skills/skill-management/SKILL.md`: new "Positioning: which tool manages what" section — this skill owns the `npx skills` channels (layers 2–3); `ns skills` / `ns update` provisioning and areg invocation-kind/overlay management are named adjacent out-of-scope surfaces; the two records are complementary by decision, not convergence candidates.
- `docs/research/harness-skill-invocation.md`: one-sentence "Since researched" pointer that first-party provisioning now materializes npm-module-bundled skills into the same harness read roots the document describes, linking to the managed taxonomy. No harness-behavior claims added (Runner Policy steer-first boundary respected — the provisioning fact is steelthread-verified).
- `skills/skill-management/references/commands.md`: deliberately left unchanged — it is a pure `npx skills` command reference and makes no claim that `npx skills` is the only management surface; the SKILL.md positioning note covers the boundary.

Validation: `just dprint-check` green; docs/skill-Markdown-only change, no TypeScript touched, no provisioning behavior change, no machine-facing names changed.

## Objective Impact

- Roadmap row 3 is complete: `skill-conventions.md` and the `skill-management` skill now tell the additive two-channel story with the decided vocabulary (harness artifact / provision / harness / harness overlays).
- The "verify additivity in prose" scope item for `docs/research/harness-skill-invocation.md` (inventory item C) is satisfied with the minimal pointer disposition.
- A proposed full rewrite of `skill-management` as an "areg companion" was considered and deliberately **not** done: it would brush against the retired no-`npx skills`-replacement disposition and the Runner Policy restructure boundary. The layered positioning delivers the coherence without the restructure. If a unified companion skill is later wanted, it is a new deliverable for the `skill-management-subsystem` umbrella, not this sweep.
- Architecture side-finding recorded for the umbrella, not acted on here: the "areg-core" shared layer already exists as `@nseng-ai/harness-artifacts` (areg depends on it; ~10 source files import it). areg stays in `tools/` (zero inbound dependents) rather than moving to `infra/` alongside brmem; any future sharing is another push-down into `harness-artifacts`.

## Follow-Ups

- Next roadmap rows in order: residual `skillx` reference sweep, then CONTEXT.md / CONTEXT-MAP.md vocabulary alignment (kept small to avoid the `repo-ontology` objective's planned-context authoring).
- Optionally record the areg-layering note on the `skill-management-subsystem` umbrella if that architecture question should stay visible there.
