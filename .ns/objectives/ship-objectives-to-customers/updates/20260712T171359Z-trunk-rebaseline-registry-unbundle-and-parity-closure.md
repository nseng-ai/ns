# Trunk rebaseline: registry at 0.1.2, source-side unbundle landed, update migration complete, cross-harness-parity closed

## Summary

A verified trunk rebaseline corrected several claims that had drifted from ground truth:

- **Registry state.** npm latest for the public `@nseng-ai/*` set is `0.1.2` (published 2026-07-07T19:18Z), not `0.1.1`. The `0.1.2` release also added `@nseng-ai/harness-artifacts` and a **standalone `@nseng-ai/kernel`** to the public package set — kernel is no longer `"private": true`, superseding the permanently-private fold-in-only posture recorded in the thesis.
- **Source-side unbundle landed; registry shape still bundled.** Commit `4c8498216` (2026-07-07, ~3h after the `0.1.2` publish) removed Objective commands from the default `@nseng-ai/ns` host; `ts/packages/hosts/ns/package.json` no longer depends on `@nseng-ai/objectives`, and the checkout-free smoke asserts Objective commands are absent from default help. Because the publish predates that commit, the npm artifact remains batteries-included: the unbundle row moves `[ ]` → `[~]`, with republish + acquisition-path re-verify remaining.
- **Top-level update migration is complete.** Top-level `ns update` is the reserved self-update stub ("Use ns extension update <source>"), and the host test suite rejects the retired `--extensions` flags with a usage error. The extension-verbs row's remaining scope narrows to `ns extension list` (plus a sweep of stale `ns update --extensions` strings in `ts/packages/kernel/docs/writing-an-ns-extension.md` and the harness-artifacts reconcile message).
- **`cross-harness-parity` closed 2026-07-11**, intentionally concluded rather than completed; its residual verification (per-harness pointer-following on Codex/Pi) folds into this Objective's docs/onboarding thread.
- **Skill provisioning mechanism corrected.** The `SkillMaterializer`/`RealSkillMaterializer` seam no longer exists in `@nseng-ai/ns-init`; provisioning flows through `RealArtifactActivationGateway` → `@nseng-ai/harness-artifacts` `prepareDeclaredArtifactActivation`/`applyPreparedDeclaredArtifactActivation`, with `@nseng-ai/objectives` declaring `activation.instructions` + `consumerDirs: [".ns/objectives"]` in its descriptor.
- **Path/naming drift.** The published CLI host relocated to `ts/packages/hosts/ns` (from `ts/packages/hosts/ns-cli`); CLI composition moved into the host, and the kernel package no longer carries a `bin`. `instruction-block.ts` now renders the `<!-- ns:begin -->` pointer stanza; no `ns:objectives:*` markers remain in ns-init source/tests. Docs installation/quickstart still carry the stale "Coming with the first release" gate copy.

Provenance: objective-refresh basis target=c1cb8d5d3 from=trunk-HEAD

## Objective Impact

- objective.md and roadmap.md were rewritten against the verified contract: registry/version facts, kernel publish posture, unbundle progress (`[ ]` → `[~]`), extension-verbs remaining scope (`list` only), provisioning mechanism, host package path, and sequencing status for the closed `cross-harness-parity`.
- The happy-path/verification rows now state the 2026-07-10 init-before-install order.
- No completion criterion is newly met; the record stays open. Remaining spine: `ns extension list`, bare-core republish + acquisition-path re-verify, docs happy-path rewrite and un-gating, and the Claude Code zero-improvisation onboarding verification.

## Follow-Ups

- Implement `ns extension list`; sweep the stale `ns update --extensions` doc/message strings.
- Republish the bare core and run the foreign-repo smoke through `ns extension install npm:@nseng-ai/objectives`.
- Rewrite the docs happy path and drop the stale "Coming with the first release" gate copy once the republished shape is verified.
