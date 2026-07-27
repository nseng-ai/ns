# Progressively Disclosed Objectives

## Thesis

Reshape Objectives into one progressively disclosed product whose portable foundation is seven canonical, independently installable skills, whose `ns` extension adds deterministic mechanics and Autoobjective automation, and whose separately installable Pi integration adds interactive presentation and orchestration. The same checked-in Markdown records and Objective semantics must work at every layer: installing an enhancement adds guarantees and affordances without creating a second Objective system.

The portable skill family is `objective`, `objective-create`, `objective-list`, `objective-next`, `objective-update`, `objective-refresh`, and `objective-close`. It is installed through `npx skills`, requires no Objective CLI, and remains incubating while this Objective gathers portability evidence. The `@nseng-ai/objectives` extension progressively enhances those skills and provisions the separate incubating `objective-runner-step` and `objective-autorun` automation skills. The Pi layer is a required-`ns` host integration named `@nseng-ai/pi-ns-objectives`, not part of the portable foundation and not an Objective domain owner.

## Scope

- Record the portable-skills → `ns` enhancement → Pi integration architecture in a new ADR and reconcile the Objective, skill, package, and host-integration documentation with it.
- Establish one canonical, capability-adaptive seven-skill family under `skills/incubating/objectives/`, independently installable through `npx skills` without an npm package dedicated only to skills. The tutorial acquisition form scopes discovery to the family subpath and installs every skill found there: `npx skills add nseng-ai/ns/skills/incubating/objectives --skill '*' --agent codex claude-code -y`.
- Add `objective-list` with a deliberately small portable contract: list direct open records by slug and lifecycle only; include blocked-open records labeled `blocked`; omit closed records, titles, summaries, recency, dirty state, and branch attribution.
- Delete `objective-critique` with a clean breaking cutover and remove its package, Pi, documentation, parity, and overlay references. Keep the name `objective-refresh`.
- Give each of the seven portable skills a complete CLI-free procedure plus look-before-use capability adaptation. When the relevant `ns objective` capability exists, use it for deterministic acceleration or stronger guarantees; otherwise complete the portable workflow without pretending those guarantees exist.
- Keep the Objective record format and semantics identical across layers. Portable skills may author `blocked` and mirrored `edges` with an explicit best-effort two-record inspection; `ns objective check` adds deterministic verification when installed.
- Keep portable `objective-next` record-only: it recommends from Objective Markdown without claiming Git freshness. The canonical Tracking Gate and Git-aware freshness are `ns` enhancements.
- Keep Objective patterns available in portable creation, including prose that can shape an Autoobjective or orienting Objective. Runner execution and automatic orientation loading require `ns`; portable installation does not promise automatic orientation loading.
- Make `@nseng-ai/objectives` the harness-independent enhancement: structured list/show facts, checks, canonical Git and Tracking Gate facts, orientation loading, machine-readable interfaces, runner bookends, recovery, provenance commits, bounded parent-only publication mechanics, and provisioning of `objective-runner-step` plus `objective-autorun`.
- Extract all Pi-owned Objective integration into incubating package `@nseng-ai/pi-ns-objectives` at the Pi host extension boundary. It requires `@nseng-ai/objectives`, consumes only its curated extension package API plus neutral Pi-runtime interfaces, and owns slash commands, picker/completion presentation, skill expansion, and Objective Runner orchestration.
- Define collision-free installation ownership between `npx skills` and `ns`: canonical content is shared; existing `npx skills`-owned portable artifacts remain owned by that channel; the Objective extension installs only missing portable artifacts and its enhanced skills. Removing Pi removes only Pi integration; removing the Objective extension preserves portable skills owned by `npx skills`.
- Prove three checkout-independent scenarios: portable skills through `npx skills` without `ns`; the `@nseng-ai/objectives` enhancement over the same records with runner/autorun; and `@nseng-ai/pi-ns-objectives` on top with Pi interaction and orchestration.

## Non-Goals

- Adding or designing CI workflows.
- Changing the Markdown Objective record model, adding hidden lifecycle state, or making installation level part of record semantics.
- Publishing a standalone npm module that contains only the seven portable skills.
- Promoting Objective skills to `skills/public/` during this Objective. Portability and installation evidence prepare a later support-warrant decision but do not make it here.
- Preserving `objective-critique`, old Pi ownership, compatibility aliases, deprecation shims, or generated portable/enhanced variants.
- Reimplementing rich `ns objective list` metadata in portable `objective-list`.
- Making Pi usable directly over skill-only Objectives; the Pi integration requires the `ns` Objectives extension.
- Making this Objective itself execution-friendly or autonomous.

## Completion Criteria

- A new accepted ADR and aligned canonical documentation state the three layers, their dependency direction, ownership, installation channels, and invariant record semantics.
- Exactly seven canonical portable workflow skills exist for ordinary Objective use: `objective`, create, list, next, update, refresh, and close. They have complete CLI-free behavior, use `ns` only after look-before-use capability detection, and clearly distinguish portable behavior from enhanced guarantees.
- `objective-list` lists only direct open Objective slugs with lifecycle `open` or `blocked`; `objective-critique` and every live reference to it are removed; no compatibility alias remains.
- The seven portable skills remain under the incubating Objectives family, are independently installable with `npx skills`, and are not duplicated into a skills-only npm package or divergent enhanced variants.
- `@nseng-ai/objectives` remains harness-independent, exposes the deterministic and automation capabilities needed by enhanced workflows, and provisions runner/autorun separately from the portable family without taking ownership of existing `npx skills` artifacts.
- `@nseng-ai/pi-ns-objectives` exists under the Pi host's extension ownership, requires `@nseng-ai/objectives`, consumes its curated package API rather than private source, and owns all Objective-specific Pi presentation and orchestration formerly embedded in the Objective extension.
- Installation, update, and removal behavior preserves single ownership of installed skill artifacts and leaves `npx skills`-owned portable skills intact when enhanced layers are removed.
- Checkout-independent evidence demonstrates all three installation scenarios and confirms that the same Objective records pass unchanged from skill-only use through `ns` enhancement and Pi integration.
- Relevant package tests, skill exposure checks, topology/dependency guards, and repository validation pass, recorded as evidence under the semantic slices they verify.

## Assumptions and Risks

Assumptions:

- `npx skills` supports a repository subpath as its source: `nseng-ai/ns/skills/incubating/objectives` scopes discovery to the canonical Objective family, and `--skill '*'` selects all seven flat skill identities without enumerating them. This behavior is confirmed in the upstream CLI's source parser and scoped discovery implementation; checkout-independent end-to-end acquisition evidence remains open.
- Capability-adaptive instructions can reliably detect the specific `ns objective` operation before using it and can remain understandable without duplicating excessive shell machinery.
- The harness-artifact ownership model can distinguish `npx skills`-owned artifacts from extension-provisioned artifacts and can preserve ownership across install, update, and removal.
- The curated `@nseng-ai/objectives/api` surface can support the extracted Pi integration without private imports; any missing interface can be added without moving Objective domain semantics into the host package.
- ADR 0045's `pi-ns-<domain>` convention makes `@nseng-ai/pi-ns-objectives` the correct package identity and host-owned destination.

Risks:

- **Portable-procedure drift.** A CLI-free fallback and an enhanced path can become two subtly different workflows. Keep one semantic contract and vary only deterministic mechanics and guarantees.
- **Shallow capability detection.** Detecting `ns` globally rather than the required operation could route into unavailable or incompatible behavior. Probe the concrete capability before use and preserve a complete portable path.
- **Artifact ownership conflict.** `npx skills` and `ns` may overwrite or remove each other's files unless ownership and uninstall semantics are proven against the real manifests and update flows.
- **Public-sounding portability without support warrant.** Independent installation is evidence, not promotion. Keep all Objective skills incubating and defer the explicit public-support decision.
- **Pi extraction leakage.** The new host package may be tempted to deep-import Objective internals or retain duplicate domain behavior. Block extraction until the curated package API is sufficient.
- **Automation trust regression.** Repackaging runner/autorun must preserve ADR 0024's fail-closed begin/finish boundary and ADR 0037's parent-only publication authorization; do not replace those safeguards with prose or Pi-local logic.
- **Oversized skill payloads.** Complete CLI-free procedures may make the portable skills noisy or shell-heavy. Prefer small record operations and reserve rich deterministic facts for the enhancement layer.

## Open Questions

- What exact capability probe should the seven portable skills use for each optional `ns objective` operation across supported harnesses?
- What existing artifact manifest or installation metadata is sufficient to preserve `npx skills` ownership, and what extension installer change is needed when a portable skill is missing?
- Which additions, if any, are required in `@nseng-ai/objectives/api` before `@nseng-ai/pi-ns-objectives` can consume only curated interfaces?
- What checkout-independent fixture or smoke harness should prove the documented family-subpath `npx skills` command, `ns`, and Pi installation/removal without coupling the evidence to this repository checkout?
- After portability evidence lands, what separate review should decide whether the seven skills warrant promotion to `skills/public/objectives/`?
