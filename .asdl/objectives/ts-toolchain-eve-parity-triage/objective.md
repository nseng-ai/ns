# TS Toolchain Parity Triage (vs Eve)

## Thesis

A reference report on the Eve monorepo's TypeScript toolchain
(`/tmp/eve-toolchain-and-norms-report.md`, dated 2026-06-17) surfaced a set of
concrete differences between Eve's `packages/eve` workspace and this repo's
`ts/` subtree. Eve and `ts/` share DNA — ESM-only, NodeNext, a strict
`tsconfig`, a pnpm workspace, Vitest, and zod — but differ sharply in toolchain
maturity. This Objective exists to **decide, gap by gap, whether each Eve
practice should be adopted, deferred, or rejected** for `ts/`, with rationale,
rather than to silently inherit Eve's choices or to leave the gaps untracked.

Deliverable is a **triage decision record**, not implementation. Each gap gets
an adopt-now / defer / reject verdict; adopted items are carved into concrete
follow-ups (separate roadmap rows or new Objectives). No tooling is installed
under this Objective.

## Scope

TypeScript-only. The `ts/` subtree (`packages/*`, root `tsconfig.json`,
`package.json`, `pnpm-workspace.yaml`, `vitest.config.ts`) is the subject;
asdl's Python toolchain is explicitly out of scope.

Gaps to triage, drawn from the Eve report:

- **Linter** — Eve runs oxlint (`--fix`); `ts/` has no TS linter at all.
- **Formatter** — Eve runs oxfmt + a pre-commit hook; `ts/` has no TS formatter
  (dprint covers only Markdown/TOML).
- **`tsconfig` strictness delta** — Eve sets flags the `ts/` subtree omitted
  when this Objective was created: `moduleDetection: force`,
  `noImplicitOverride`, `noUnusedLocals`, `noUnusedParameters`,
  `noFallthroughCasesInSwitch`, `useUnknownInCatchVariables`,
  `noUncheckedSideEffectImports`, `forceConsistentCasingInFileNames`,
  `resolveJsonModule`. This gap is now decision-complete: keep the six
  already-landed explicit flags in `ts/tsconfig.json`; rely on TypeScript's
  current `strict`/NodeNext defaults for `useUnknownInCatchVariables` and
  `resolveJsonModule`; and adopt `forceConsistentCasingInFileNames` explicitly
  in a separate follow-up because cross-filesystem casing safety is worth the
  small config cost. (`ts/` is conversely stricter on one axis Eve does not
  list: `exactOptionalPropertyTypes`.)
- **Dependency governance** — Eve uses a pnpm `catalog:` version
  source-of-truth, syncpack lint/fix, `minimumReleaseAge` supply-chain aging,
  and an `allowBuilds` install-script allowlist; `ts/` has plain per-package
  semver ranges and none of this.
- **Mechanical invariant guard** — Eve's `guard-invariants.mjs` (30+ numbered,
  ratcheting rules) enforces conventions a linter can't; `ts/` has no
  equivalent and relies on AGENTS.md prose + code review.
- **Compiler & target** — Eve uses `tsgo` (`@typescript/native-preview`) and
  targets ES2024; when this Objective was created, `ts/` used stock
  `tsc ^5.9.0` and targeted ES2022.
- **Test tiering** — Eve has four Vitest tiers (unit/integration/scenario/e2e)
  with per-tier configs; `ts/` has a single flat `vitest.config.ts`.

## Non-Goals

- Installing, configuring, or rolling out any tool. Implementation of any
  adopted decision is follow-up work, not part of this Objective.
- Triaging Eve machinery that exists only to **publish** `packages/eve` — the
  rolldown build, `#compiled/*` vendoring, the source-vs-dist `eve-source`
  condition, and Changesets. These are presumptively rejected because `ts/` is
  an unpublished, run-from-source workspace; this Objective records that
  rejection once with rationale rather than re-litigating each piece.
- Any change to the Python toolchain.
- Changing the run-from-source model of `ts/` (exports point at `./src/*.ts`,
  CLIs run via `just install-*` shims, no `dist`).

## Completion Criteria

- Every gap listed in Scope has a recorded **adopt-now / defer / reject**
  verdict with a one-paragraph rationale (captured in Semantic Updates and/or
  reflected in roadmap row status).
- Each **adopt-now** verdict names a concrete landing spot — a new Objective
  slug, or a follow-up roadmap row — so a decision cannot rot without an owner.
- The presumptively-rejected publish machinery (see Non-Goals) has its rejection
  recorded once with rationale.
- No tooling is installed or configured under this Objective.

## Assumptions and Risks

**Assumptions**

- The `ts/` subtree stays unpublished and run-from-source for the foreseeable
  future. This is what makes the build/vendoring/Changesets rejection safe; if
  `ts/` ever needs to publish npm packages, those rejected items reopen.
- The Eve report accurately reflects Eve's toolchain as of 2026-06-17. Decisions
  that lean on a specific Eve detail should be re-checked against Eve directly if
  that detail is challenged.
- The linter and formatter decisions intentionally adopt Eve's Oxc-family split:
  oxlint for linting and oxfmt for formatting.

**Risks**

- *Decision rot* — triage produces verdicts but adopted items never get
  implemented. Mitigated by the completion criterion that every adopt-now
  verdict must name a landing spot.
- *Noisy first-pass diff* — introducing a formatter/linter onto a currently
  unformatted, unlinted TS tree produces a large mechanical diff. Triage of the
  linter/formatter gaps must weigh this rollout cost, not just the end state.
- *Cargo-culting Eve* — Eve's choices are tuned for a published framework with a
  large public API surface; adopting them wholesale could add ceremony that an
  internal toolkit does not need. The default posture is skeptical adoption,
  not parity for its own sake.
- *Implementation-before-decision drift* — part of the `tsconfig` strictness
  delta landed before this triage record captured a verdict. This is reconciled
  for the `tsconfig` gap by the 2026-06-18 strictness verdict update; keep the
  risk active for other gaps so future implementation does not substitute for a
  recorded adopt/defer/reject decision.

## Open Questions

Resolved by the 2026-06-18 bulk verdict update:

- Linter and formatter: oxlint + oxfmt, not Biome.
- Compiler: adopt `tsgo` / `@typescript/native-preview` as the primary check,
  while keeping stock `tsc` as an explicit fallback command.
- Mechanical invariant guard: defer Eve-scale bespoke guard work; retain and
  grow the existing narrow `just ts-guard` pattern only after more urgent
  toolchain governance lands.
- Adopted-item landing spot: consolidate implementable adopt-now decisions into
  a single follow-up Objective/branch named `ts-toolchain-governance-rollout`.

## Closure

Outcome: completed. Every Eve parity gap listed in Scope now has an adopt-now,
defer, or reject verdict recorded in the roadmap and Semantic Updates.

Adopt-now decisions were intentionally consolidated into one implementation
landing spot, `ts-toolchain-governance-rollout`: oxlint/oxfmt for `ts/`, pnpm
catalog + syncpack enforcement, `@typescript/native-preview` / `tsgo` as the
primary typechecker with stock `tsc` retained as a fallback, `forceConsistentCasingInFileNames:
true`, and an ES2024 `target`/`lib` bump. A later user correction changed the
posture from conservative to aggressive, so the rollout was implemented in this
branch rather than left as only a parked follow-up.

Deferred decisions are `minimumReleaseAge`, build-script allowlisting, Eve-scale
bespoke invariant guards, and pre-commit hooks. Rejected decisions are Eve's
multi-tier Vitest config split and publish-only machinery such as rolldown
builds, `#compiled/*` vendoring, the `eve-source` condition, Changesets, and
Eve's single-runtime-dependency policy. These can be reopened by a future
Objective only if the `ts/` subtree stops being unpublished/run-from-source or
concrete rollout evidence invalidates the assumptions above.
