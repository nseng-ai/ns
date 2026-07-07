# Roadmap

## Work

Design decisions (steer-first; record each as a Semantic Update before implementing):

- [x] Decide the source-spec grammar and first-slice source kinds.
      **Decided 2026-07-07** (see `updates/20260707T182049Z-source-spec-grammar-decision.md`): adopt pi's grammar shape verbatim as the durable grammar (`npm:pkg[@ver]` / `git:host/user/repo@ref` / local path); slice one ships **npm-only**, with git and local-path reserved until the storage and gateway decisions land. Pinning semantics adopted with the grammar: versioned npm specs pinned/skipped, unversioned reconciled, git refs reconciled-not-advanced. Malformed/unknown specs are per-entry diagnostics. The local-path acquisition-vs-pointer question stays open.
- [ ] Decide the fetched-module storage location and its explicit, inspectable record (git-native; no hidden database), plus how discovery reads it.
- [ ] Decide fetch mechanics and the acquisition gateway seam (registry access, git transport, fake-driven tests; no real network in tests).
- [ ] Decide how acquisition composes with `ns update` (inside unconditionally, flagged, or a separate composed verb) and the per-source update/pinning semantics (pinned skipped; unpinned reconciled to spec).
- [ ] Re-judge the carried trust-posture risk acceptance with real fetch semantics on the table; record the outcome (continue accepting under the trusted-repo contract, or escalate to the umbrella).

Implementation (after the decisions above):

- [ ] `ns.toml` declaration list (working name `artifact-packages`): schema, parsing, and diagnostics in the ns-toml layer.
- [ ] Acquisition slice one: fetch + resolve declared specs of the first-slice source kind(s) into the decided storage root behind the gateway, with per-module failure diagnostics that do not block provisioning of present modules.
- [ ] Wire acquired modules into existing static-declaration discovery and the `ns update` reconcile flow; prove idempotence on unchanged specs and reconcile-to-spec on changed specs.
- [ ] End-to-end evidence: one real remote module declared, fetched, and provisioned into `pi`/`claude-code`/`codex` roots with manifest hashes; existing arrival paths verified unchanged; full `just` green.

## Parked

- (none)
