# Reconcile primitive and `ji update` hook decision

## Summary

Design-session continuation of `20260702T035321Z-harness-artifact-vocabulary-and-layering.md`; resolves the extension-install hook-point open question. No implementation yet.

Decision: **reconcile is the core primitive, and `ji update` is the primary commanded hook that invokes it.** The framing "unifying install command vs per-surface hooks" was discarded — neither is the architecture. The core operation is reconcile: compare declared catalogs (first-party plus installed extensions' static manifests) against the install manifest, produce a deterministic provision plan, apply it. Idempotent and manifest-driven. Any install/update command is sugar over reconcile.

Pi is the inspiration, not the mechanism: in Pi's model, drift is introduced by commands (`pi install` / `pi update`), not by ambient processes — the moment drift is created is a moment of explicit user intent where convergence can run. SDL adopts the same shape with a `ji update` surface serving the analogous function. Contrast recorded from the pup research: pup's drift arrives via `brew upgrade`, which knows nothing about skills, so every release silently invalidates every prior install with no detection — the closed catalog removes multi-source drift but not time-axis drift.

Drift channels and policy tiers:

1. **Commanded** (`ji update`, install/enable of an extension through an SDL-owned surface): reconcile runs and applies, with reported output. Consent is inherent in invoking the command; refreshed artifacts are part of what "update" means.
2. **Ambient** (project-local checked-in extensions updated via `git pull`; upstream `pi update` which does not call our provisioner): a cheap fingerprint check — declared-catalog fingerprint vs install manifest, a few stats and hashes — detects staleness at extension load or `ji` invocation and nudges toward `ji update`; no silent writes into harness directories from ambient triggers.
3. **User-edited provisioned files**: reconcile blocks, never converges over local edits without `--force` (manifest content hashes make the distinction decidable).

Because the manifest records which source version provisioned each file, reconcile can distinguish "stale because the extension updated" from "changed because the user edited it" — the two cases that pup's design conflates into silent overwrite.

Boundary note: this Objective owns the reconcile primitive, provision planning, and the manifest. The `ji update` command surface is broader extension-lifecycle work; it consumes the primitive. Where that command lands (this Objective's steel thread vs the kernel/extension-lifecycle area) is a small open placement question, not a design blocker.

## Objective Impact

- `objective.md`: the extension-install hook-point open question is resolved and removed; scope now names reconcile as the core operation; the "install an extension is not one flow" risk is marked addressed by this decision; a narrow placement question for the `ji update` command surface is added.
- `roadmap.md`: the design row now names the reconcile operation explicitly; the extension-carried provisioning row's "decide the hook point" clause is replaced with the decided architecture (reconcile primitive, `ji update` commanded hook, load-time fingerprint backstop with nudge).

## Follow-Ups

- Decide where the `ji update` command surface lives (this Objective vs extension-lifecycle work); this Objective ships the primitive either way.
- Package name confirmation still pending (leading `@ji/harness-artifacts`, harness specs as a subpath export rather than a separate package per design discussion).
- First harness set confirmation still pending (lean: `pi` + `claude-code`).
