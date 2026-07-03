# Roadmap

## Work

- [x] ADR: zero-kind mirrored Objective Edges with prompting-owned semantics — capture the
      rejected alternatives (typed edge taxonomy, formal `to:`/`from:` directionality,
      single-sided storage) and the linter-enforced-symmetry argument that makes mirroring safe.
      Evidence: `docs/adr/0025-zero-kind-mirrored-objective-edges.md` on branch
      `adr-zero-kind-objective-edges` (runner step commit); open spellings (sweep CLI form,
      blocked glyph) deliberately left to the linter and list-rendering slices.
- [x] Record Frontmatter parsing: a shared frontmatter reader in the `@sdl/objective` storage
      layer, with every `objective.md` reader (check heading lints, `read-objective`, `list`,
      `load-orientations`) stripping or parsing the block identically for records with and
      without frontmatter.
      Evidence: `src/core/record-frontmatter.ts` + `ObjectiveStorage.readObjectiveRecordDocument`
      on branch `objective-record-frontmatter-reader` (runner step commit); fake-driven contract
      tests across all four readers; full `just` + ts-test green. Malformed-frontmatter policy is
      deliberately minimal and documented in the module for the linter row to harden.
- [x] Edge and Blocked Sentence linter in `sdl objective check`: structural violations as
      errors (dangling slug, missing mirror side, empty annotation, duplicate pair, malformed
      frontmatter, empty blocked sentence), per-slug check validating mirror lookups, repo-wide
      sweep wired into `just`/CI, slug resolution across active and archive roots.
      Evidence: repo-wide sweep passes in CI on a checkout with seeded edges.
      Evidence: `src/core/operations/edge-lint.ts` on branch `objective-edges-linter` (runner
      step commit); sweep spelling resolved as `sdl objective check --all` scoped to edge/blocked
      structural lint (41/120 legacy records fail old update-heading lints, so a full-check sweep
      cannot gate CI); wired into `just check` and a CI job; sweep passes on the current
      120-record checkout — seeded-edge CI evidence completes with the seed row.
- [x] `sdl objective list` rendering: EDGES count column to the right of LATEST UPDATE (blank
      when zero) and a distinct blocked indicator in STATUS (blocked as sub-state of open).
      Evidence: branch `objective-list-edges-rendering` (runner step commit); EDGES column on
      pretty/table/markdown surfaces, blocked glyph resolved as `⊘` (ascii `!`, warn intent)
      keeping the STATUS word "open" with a footer legend; `--minimal` shows both facts;
      no-frontmatter records render byte-identically; full `just` green. Live before/after
      output for the two seed records lands with the seed row.
- [x] Skill updates: objective-create, objective-update, and objective-close own edge
      mutation and blocked judgment — close flows re-judge edge counterparts' Blocked Sentences,
      update flows re-judge the record's own sentence; add hidden `sdl objective exec` helpers
      only where a skill needs a deterministic assist.
      Evidence: branch `objective-edges-skill-updates` (runner step commit); umbrella `objective`
      skill gained a Record Frontmatter grounding section; the three step skills document the
      mirrored two-file edit, own-sentence and counterpart re-judgment, and post-edit
      `sdl objective check`; "No YAML/frontmatter" non-goals now carry the blocked+edges
      exception. No hidden exec helper added — per-slug check already gives the deterministic
      mirror verification; the parked mutation-CLI row stays the escalation path.
- [x] Seed the live instances: encode the `checkout-free-sdl-distribution ↔
  ship-objectives-to-customers` edge with perspective-correct annotations on both sides and a
      Blocked Sentence on `ship-objectives-to-customers`.
      Evidence: `sdl objective check` repo-wide sweep passes; both records render the edge count
      and blocked status in `sdl objective list`.
      Evidence: branch `objective-edges-seed-records` (runner step commit); both per-slug checks
      and the 120-record `--all` sweep pass with the live frontmatter; list renders EDGES 1 on
      both records and `⊘ open (blocked)` on `ship-objectives-to-customers`. The motivating
      drift case is now machine-checked — the feature's acceptance test is met.
- [x] Vocabulary: root `CONTEXT.md` system terms (Objective Edge, Edge Annotation, Blocked
      Sentence, Record Frontmatter, State/status-cluster line for blocked-as-substate-of-open)
      and `@sdl/objective` `CONTEXT.md` surface terms (edge linting in check, EDGES column).
      Evidence: branch `objective-edges-vocabulary` (runner step commit); exactly the enumerated
      terms added in each file's entry format, plus the state-cluster line; the objective-next
      confirmed-execution reference gained the same blocked+edges clarifier as the other
      Objective skills. Reported drift (not fixed, per repo context rules): CONTEXT-MAP.md's
      root-context description line now lags the four new terms.

## Parked

- Public mutation CLI (`sdl objective edge add`/`remove`) — deferred until an automation
  consumer exists or there is evidence agents fumble the two-file edit despite the linter.
- Typed edge kinds or any machine-readable edge semantics — only if real automation needs to
  distinguish edge meaning without reading prose; would be informed by the corpus of real
  annotations by then.
- `rename-sdl-to-ji ↔ checkout-free-sdl-distribution` edge — encode opportunistically when
  the rename Objective record is minted (it does not exist yet).
