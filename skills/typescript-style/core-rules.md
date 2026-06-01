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
  properties, `import =`, and `export =`. If the project already depends on emit-time features, do not
  mix styles casually; follow the local pattern.
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
- **Avoid `any`.** Use `unknown` at untyped boundaries, then narrow with guards. If a library forces
  `any`, isolate it behind an alias or a narrow wrapper with a comment.
- **Prefer top-level type imports.** Avoid `await import()` or `import("pkg").Type` for types. Runtime
  lazy `import()` is fine when it reduces startup cost or optional dependencies.
- **Follow the project's import suffix convention.** Strip-only Node/Bun projects often use `.ts` in
  relative imports; compiled ESM projects may require `.js`; bundled projects may omit suffixes. Do not
  mix conventions within a package.
- **Read external types from `node_modules` or docs.** Do not guess library shapes, and do not weaken
  your code to satisfy stale dependency types without checking whether an upgrade is the right fix.

Full reasoning: `references/type-system.md`.

---

## 3. Type design

- **`interface` for object shapes and contracts; `type` for unions, function types, mapped types, and
  simple aliases.** Prefer `extends` for interface composition.
- **Closed sets are string-literal unions.** Keep runtime lists and types synchronized with `as const`
  arrays when both are needed.
- **Runtime variants are discriminated unions.** Use a domain field such as `type`, `kind`, `role`, or
  `status`; consume with an exhaustive `switch`.
- **Extensible registries use open unions:** `type BackendId = KnownBackendId | (string & {})`. Known
  values keep autocomplete while custom plugins can still register new values.
- **Push tags through generics.** If a value has a backend/type tag, carry that tag through helper
  signatures and use conditional types to expose only legal config for that tag.
- **Use `satisfies` for object literals.** It checks shape without widening away useful literal
  inference. Use `as const satisfies T` for config tables.
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

- **Pure functions for logic; classes for stateful coordination.** Parsing, selection, estimation,
  matching, normalization, and conversion should be functions over plain data. Classes coordinate
  lifecycle, caches, subscriptions, and mutable state.
- **Keep engine functions readable.** A top-level dispatcher can be large if it is linear and names the
  phases; move real sub-work into small private helpers when it improves the narrative.
- **Inline one-use helpers.** A new module for one tiny function is usually needless indirection.
  Prefer a local closure that captures local state over a public helper with a long parameter list.
- **Use defensive copies at API boundaries.** Return copies from public getters and copy caller-owned
  arrays/objects on assign. Mutate internally where it is local, hot, and tested.
- **Keep lifecycle state coherent.** Prefer one source of truth over parallel flags, duplicated caches,
  or shadow state that must be manually synchronized.

Full reasoning: `references/philosophy.md` plus the case studies.

---

## 7. Naming and modules

- **Name by role.** `create*` for factories, `build*` for derivations, `prepare*`/`execute*`/`finalize*`
  for pipelines, `normalize*` for boundary cleanup, `is*` for type guards.
- **Use meaningful suffixes.** `*Options` for caller inputs, `*Config` for stable configuration,
  `*Event`, `*Result`, `*State`, `*Capabilities`/`*Compat`, `*Function` for callable aliases.
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
- **Review directly.** Start with agreement/disagreement or the required change, then give the reason.
  Avoid cheerleading, emojis, and filler in technical review.

Review rubric: `references/review-taste-and-process.md`. Pre-finish checklist: `checklist.md`.
