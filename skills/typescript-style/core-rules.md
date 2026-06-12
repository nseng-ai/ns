# TypeScript Style — Core Rules

Default rules for strict, maintainable TypeScript. Apply them unless the repository's existing tooling,
runtime, or public API contract says otherwise. Do not churn a project just to match this guide; improve
new or touched code while preserving local conventions.

---

## 1. Precedence

- **Project instructions and tooling win.** Check package scripts, `tsconfig`, formatter config, lint
  rules, and nearby code before applying a rule mechanically.
- **Public API compatibility is a product decision.** Do not break it unless the task asks for that.
- **Avoid style-only rewrites.** Use this guide to shape the code you are already touching.

---

## 2. Language constraints

- **Write erasable / strip-only TypeScript.** Type syntax should be removable without changing runtime
  behavior. Avoid TypeScript constructs that require JS emit: `enum`, `namespace`/`module`, parameter
  properties, `import =`, and `export =`. Do not add parameter properties to new code; if an existing
  project already depends on emit-time features, contain local consistency exceptions instead of mixing
  styles casually.
  ```ts
  // Good: erasable fields + constructor assignment.
  class RetryTimer {
    private timeoutMs: number;
    private onTick: (remainingMs: number) => void;

    constructor(timeoutMs: number, onTick: (remainingMs: number) => void) {
      this.timeoutMs = timeoutMs;
      this.onTick = onTick;
    }
  }

  // Avoid in strip-only projects: parameter properties require transformation.
  class RetryTimer {
    constructor(private timeoutMs: number, private onTick: (remainingMs: number) => void) {}
  }
  ```
- **No `enum` by default.** Use string-literal unions for closed sets. When a schema needs runtime
  validation, derive the runtime values and static type from the same literal list.
- **No `any` in ordinary code.** Use `unknown` at untyped boundaries, then narrow with guards. If a
  library type truly forces `any`, isolate it at the smallest wrapper or alias, comment why it is
  unavoidable, and never let it leak into project-owned types.
- **Prefer top-level type imports.** Avoid `await import()` or `import("pkg").Type` for types. Runtime
  lazy `import()` is fine when it reduces startup cost or optional dependencies.
- **Follow the project's import suffix convention.** Strip-only Node/Bun projects often use `.ts` in
  relative imports; compiled ESM projects may require `.js`; bundled projects may omit suffixes. Do not
  mix conventions within a package.
- **Use explicit package exports for internal monorepo boundaries.** Consumers should not deep-import
  another package's `src/` files; enforce the boundary with a package `exports` map. Prefer curated
  subpath exports such as `pkg/checkpoint-flow` when path-level greppability matters. Avoid collapsing a
  package into one root barrel if it would make every consumer look like `from "pkg"`, load unrelated
  modules, hide circular edges, or make `rg` navigation fuzzy. In agent-heavy codebases, grep-able import
  paths are an architectural property. Package self-reference through exported subpaths is appropriate
  for tests of public primitives; use relative imports only for truly private internals.
- **Read external types from `node_modules` or docs.** Do not guess library shapes, and do not weaken
  your code to satisfy stale dependency types without checking whether an upgrade is the right fix.

Full reasoning: `references/type-system.md`.

---

## 3. Type design

- **`interface` for object shapes and contracts; `type` for unions, function types, mapped types, and
  simple aliases.** Prefer `extends` for interface composition.
- **Closed sets are string-literal unions.** Keep runtime lists and types synchronized with `as const`
  arrays when both are needed.
- **Runtime variants are discriminated unions.** Prefer `type` as the literal tag for ordinary internal
  variants; use domain or external-contract tags such as `role` or `status` when that is the honest
  model. Consume variants with an exhaustive `switch`.
- **Extensible registries use open unions:** `type BackendId = KnownBackendId | (string & {})`. Known
  values keep autocomplete while custom plugins can still register new values.
- **Push tags through generics.** If a value has a backend/type tag, carry that tag through helper
  signatures and use conditional types to expose only legal config for that tag.
- **Use `satisfies` for object literals.** It checks shape without widening away useful literal
  inference. Use `as const satisfies T` for config tables.
- **Use Zod-first validation at external boundaries.** External, HTTP, model, tool, and config input
  should be parsed by a Zod schema. Derive static types from schemas with `z.infer`; do not hand-write
  duplicate mirror types for values that already have a schema.
- **Model state machines as explicit unions.** Prefer one field like
  `mode: { type: "search"; query: string } | { type: "replace"; pattern: string } | null` over several
  booleans that can drift into impossible combinations.
- **Expose deliberate extension points.** Empty interfaces plus declaration merging can let apps extend
  a core event/message union without forking it.

Full reasoning + examples: `references/type-system.md`.

---

## 4. Architecture and layering

- **Keep the core minimal.** Optional behavior belongs in plugins, adapters, registries, or feature
  modules. Built-in features should travel through the same public path as third-party features when
  practical.
- **Put code in the layer that owns the concept.** A workflow loop should not know UI/editor details;
  a UI should not know backend serialization quirks; domain logic should not know shell or filesystem
  details unless those are its domain.
- **Prefer declarative capability flags over runtime sniffing.** Resolve `*Compat` / `*Capabilities`
  once, then read flags. Avoid scattered name checks like `if (backend.includes("x"))`.
- **Use dependency injection at boundaries.** Pass collaborators (`Clock`, `FileSystem`, `Shell`,
  `Logger`, `Transport`, `Renderer`) as interfaces or option objects instead of reaching for globals.
- **Cast generic to concrete once, behind a runtime assertion.** Registry storage often erases generic
  detail; recover it in one wrapper that first checks the tag.
- **Separate planning from execution.** Pure planning functions return a plan that can be tested and
  intercepted; execution performs I/O from that plan.

Full reasoning: `references/philosophy.md`. Worked examples: `references/case-study-*.md`.

---

## 5. Errors and cancellation

- **Expected failures at async/system boundaries are values.** Return `Result<T,E>`, a terminal error
  event, or a structured failure object. Do not make callers catch exceptions for normal request,
  validation, cancellation, or backend failures.
- **Use an explicit `Result<T,E>` for fallible synchronous logic.** Keep success and failure shapes
  discriminated and easy to switch on.
- **Typed errors are for layer seams and programmer errors.** If throwing, use stable `code` values,
  optional `cause`, and an error normalizer at the boundary.
- **Thread `AbortSignal` through long-running work.** Cancellation is a normal outcome; distinguish it
  from failure in the returned data.
- **Isolate plugin/handler failures.** One callback, extension, or listener should not crash the host
  loop unless that is the explicit contract.
- **Throw loudly for broken invariants.** Programmer errors, impossible states, and data corruption
  should fail fast with actionable messages.

Full reasoning: `references/error-handling.md`.

---

## 6. Functions, classes, and state

- **Use `function` declarations for top-level module logic.** Exported APIs, async helpers, React
  components, and named module-level logic should be declared with `function`. Use arrow functions for
  callbacks, event handlers, inline higher-order expressions, and factory shapes that are naturally
  expression-valued.
- **Pure functions for logic; classes for stateful coordination.** Parsing, selection, estimation,
  matching, normalization, and conversion should be functions over plain data. Classes coordinate
  lifecycle, caches, subscriptions, and mutable state.
- **Prefer guard clauses and early returns.** Validate preconditions and edge cases up front, then keep
  the main path linear. A single-line `if (condition) return value;` is fine when it reads clearly.
- **Use `??` and `?.` for nullish semantics.** Do not use `||` for defaults when `""`, `0`, or `false`
  are valid values that must be preserved.
- **Use options objects for several or optional inputs.** Prefer a named `*Options` object over long
  positional parameter lists when call sites need defaults, flags, or optional values.
- **Keep engine functions readable.** A top-level dispatcher can be large if it is linear and names the
  phases; move real sub-work into small private helpers when it improves the narrative.
- **Inline one-use helpers.** A new module for one tiny function is usually needless indirection.
  Prefer a local closure that captures local state over a public helper with a long parameter list.
- **Respect ownership-boundary immutability.** Do not mutate inputs, returned values, or shared/public
  state in place. Return copies from public getters and copy caller-owned arrays/objects on assign. Use
  `readonly`, `ReadonlyArray<T>`, `ReadonlyMap<K,V>`, or `ReadonlySet<T>` in public contracts where the
  callee must not mutate. Local owned mutation inside a function or stateful class is fine when clear
  and tested.
- **Keep lifecycle state coherent.** Prefer one source of truth over parallel flags, duplicated caches,
  or shadow state that must be manually synchronized.

Full reasoning: `references/philosophy.md` plus the case studies.

---

## 7. Naming and modules

- **Name by role.** `create*` for factories, `build*` for derivations, `prepare*`/`execute*`/`finalize*`
  for pipelines, `normalize*` for boundary cleanup, `is*` for type guards.
- **Name booleans by predicate.** Prefer `is*`, `has*`, `should*`, or `can*` so conditions read as
  assertions. Type guards should be named `isX(value): value is X`.
- **Use meaningful suffixes.** `*Options` for caller inputs, `*Config` for stable configuration,
  `*Event`, `*Result`, `*State`, `*Capabilities`/`*Compat`, `*Function` for callable aliases, and
  `<noun>Schema` for Zod schemas.
- **Include units in measured constants.** Prefer names such as `TIMEOUT_MS`, `MAX_BYTES`, and
  `RETRY_DELAY_MS` over unitless constants.
- **Concrete classes are plain nouns.** Reserve `Component`, `Provider`, `Adapter`, `Manager`, etc. for
  real abstractions, not decoration.
- **Event names are stable strings.** Use a consistent casing convention (`snake_case` is a good
  default) and treat them as API.
- **Barrels are curated.** Prefer explicit named exports and `export type {}`. Avoid `export *` from
  public package roots unless the project intentionally exposes the whole subtree.

---

## 8. Formatting, comments, and review tone

- **Follow the project formatter.** If establishing a new project, choose one formatter and one lint
  command, make them cheap to run, and avoid formatting churn outside touched lines.
- **Generated files are generated.** Change the generator and regenerate; do not hand-edit generated
  output.
- **Avoid TODOs in source unless the repo tracks them deliberately.** Prefer an issue, test, or clear
  follow-up task.
- **Comments explain why, contracts, and edge cases.** Do not narrate mechanics that the code already
  states.
- **Suppressions and empty catches explain why.** Use `@ts-expect-error` with a one-line reason; avoid
  `@ts-ignore`. An empty `catch` must say why ignoring the failure is safe. Repeated suppressions in one
  file usually mean the types or boundary are wrong.
- **Review directly.** Start with agreement/disagreement or the required change, then give the reason.
  Avoid cheerleading, emojis, and filler in technical review.

Review rubric: `references/review-taste-and-process.md`. Pre-finish checklist: `checklist.md`.
