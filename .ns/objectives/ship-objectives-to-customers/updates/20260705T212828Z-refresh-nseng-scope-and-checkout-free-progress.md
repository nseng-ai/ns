# Refresh: correct `@ns/*` → `@nseng-ai/*` scope; checkout-free bundle nearly landed

## Summary

A verified trunk refresh (basis HEAD `141ac24df`) found two stale claim clusters and
corrected them; no scope, criteria, or roadmap-status change.

Package scope was wrong. The ji→ns rebaseline (`bd7fb64d9`) rewrote `@ji/*` → `@ns/*`,
and the follow-on rename commit (`423bcdce4`, "fold kernel into @nseng-ai/ns") updated
the package *paths* in this record but left the `@ns/*` scope prose. The actual workspace
scope is bare `@nseng-ai/*` (ADR 0028 `docs/adr/0028-bare-nseng-ai-workspace-scope.md`,
amending ADR 0026's interim `@ns/*` plan). Verified against workspace `package.json` names:
`@nseng-ai/kernel` (`ts/packages/kernel`), `@nseng-ai/objectives`
(`ts/packages/capabilities/objectives`), `@nseng-ai/foundation` (`ts/packages/infra/foundation`,
`./managed-region` export). No `@ns/`-scoped (non-`@nseng-ai`) package names exist in the
workspace. Corrected every `@ns/*` reference in `objective.md`/`roadmap.md` (kernel,
objectives, foundation, the future `@nseng-ai/init`, `@nseng-ai/foundation/managed-region`).

The checkout-free dependency has progressed far past what this record described, and the
"CLI is still run-from-source, so the checkout-free gap is unchanged" framing was stale —
the same rename commit folded kernel into a published `@nseng-ai/ns` bundle and removed
standalone kernel dist config. Verified: `ts/packages/hosts/ns-cli` is `@nseng-ai/ns`
v0.1.0 ("Checkout-free ns CLI package"), bin `ns` → `bin/ns.js`, with `build:bundle`
(esbuild), `pack:local`, `publish:dry-run`, and `smoke:checkout-free` (packs a tarball,
`npm install`s it into a foreign temp repo, runs `ns objective list`). The dependency's own
roadmap marks bundle strategy, runtime-dependency triage, the build/bundle+artifact step,
shim replacement, and the published-name decision `[x]`; the module-loader replacement is
`[~]`; only the actual npm publish + real global/`npx` install verification remain `[ ]`.

## Objective Impact

- Naming paragraph, Scope (npm-distribution bullet), the two long-pole risks, the derived-design
  line, and Open Questions in `objective.md` now state `@nseng-ai/*` names and the decided
  "kernel stays private, folded into published `@nseng-ai/ns`" mechanism (was the wrong "make
  `@ns/kernel` publishable").
- Roadmap `[~]` dependency row now reflects that the checkout-free bundle/pack/dry-run/smoke
  have landed and only npm publish + real-install verification remain; `@ns/*` names corrected.
- Blocked Sentence and the four Objective Edges are unchanged and still correct: no npm publish
  has occurred (`bin/ns.js` is not on disk; no published artifact; no real install verified),
  so external shipment remains gated on `checkout-free-sdl-distribution`. `ns objective check
  ship-objectives-to-customers` passes (edge mirrors intact).
- No completion criterion is met. Still-open verified: `ns --help` lists only `objective`
  (no `ns init`/`ns skills`), no `@nseng-ai/init` package exists, and all four docs pages
  (`retired website files`, `get-started/quickstart.mdx`,
  `concepts/objectives.mdx`, `tools/objective.mdx`) are still Lorum-ipsum placeholders.

## Follow-Ups

- When `checkout-free-sdl-distribution` publishes `@nseng-ai/ns` and verifies a real install,
  re-judge this record's Blocked Sentence and advance the dependency roadmap row to `[x]`.
- Scaffolding `@nseng-ai/init` (`ns init`) remains the next unblocked build slice this record owns.

Provenance: objective-refresh basis target=8fdc6f50661d8df81024bbcce3c722fb7411441d from=trunk-HEAD
