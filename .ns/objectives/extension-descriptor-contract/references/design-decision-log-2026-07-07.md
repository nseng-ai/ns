# Design decision log — contract revision session, 2026-07-07

> Reference record of the second structured grilling session and follow-on design discussion
> that revised the extension descriptor contract. The settled outcomes live in
> `README-draft.md` (canonical) and are folded into `objective.md` / `roadmap.md`; this log
> preserves the reasoning, the paths not taken, and the reversals, so future sessions do not
> relitigate them blind.

## How this session started

An `objective-next` run surfaced README feedback on four contract points (the `src/ns/` folder,
`load` thunks vs strings, `renderHuman`/clinkr replication, `exec` modeling, plus a
`harnessArtifacts` naming suggestion), which escalated into a full structured grilling session
because each touched the Runner Policy's "steer or ask first" zone (contract public shape).

## Decisions, with reasoning

### 1. Neutral kernel command contract; clinkr convenient, not required

The pivotal reframe. The grill initially settled on "expose clinkr directly"
(`ClinkrCommandSpec` as the authoring type), but a later instinct — "we should be much more
loosely coupled to clinkr; clinkr should be extremely convenient to use but not required" —
superseded it. Final shape:

- The kernel's per-command contract is a **neutral interface**: `name`, `summary`,
  `description`, `run(ctx, invocation) → machine envelope`.
- The **machine envelope** (`ok`/`negative`/`failure`/`usage-error` + result schema) is a
  product invariant of agent-first ns, *not* a clinkr detail. It is mandatory for every command
  however built. Envelope schemas move out of clinkr-coupled code to the neutral layer.
- **`defineCommand(clinkrSpec)` adapts at authoring time** — the kernel loader/registry never
  sees clinkr. This dependency direction is what makes "not required" structurally true.
- **`defineRawCommand`** constructs the neutral object directly and is *public, documented
  contract surface* (see BYO section below), not an internal helper.

Evidence that fed this: the old `NsCommand` in `ts/packages/kernel/src/sdk/command.ts` was a
hand-maintained field-for-field mirror of `ClinkrCommandSpec`
(`ts/packages/infra/clinkr/src/group.ts`) — exactly the drift-prone duplication this objective
exists to kill. Rejected alternatives: keep the hand mirror (drift), structurally derive via
Omit/extend (still a maintained delta), expose clinkr raw (couples the contract to clinkr's
whole surface, incl. internals like `schemaDocument`).

### 2. Legacy `NsResult` deleted

The message-only `{ ok, message }` union in `sdk/result.ts` cannot feed
`resultSchema`/`--format json` and was a parallel result vocabulary. Deleted from the SDK;
stragglers migrate during the first-party conversion row.

### 3. Module-owned `summary`; eager help loads

Reversed the first session's descriptor-canonical-summary decision. `summary` lives on the
command object; descriptor entries carry only `name` + `load`. Consequence accepted with eyes
open: `ns <group> --help` must load every command module in the group to render one-line
summaries (help is human-paced; *invocation* stays lazy). Row 7's latency evidence covers this
path explicitly and is the escalation trigger if it regresses badly. Rejected alternatives:
descriptor-optional summary override (reintroduces drift), cached help metadata (hidden state).

### 4. Recursive `entries`; `exec` demoted from contract to convention

- The descriptor's array is **`entries`** (not `commands`) — honest naming since it holds a
  discriminated union of command entries (`{ name, load }`) and group entries
  (`{ group, description, hidden?, entries }`), recursively, same field name at every level.
- The first session's `exec: true` field was **deleted from the contract**: nested subgroups
  generalize it, and `ns <group> exec <name>` is now just the ns convention expressed as an
  ordinary `{ group: "exec", hidden: true }` entry. Grounding: clinkr's `ClinkrGroup` already
  supports nested subgroups with `isHidden`, so the kernel adapter maps one-to-one.
- Rejected: `exec-` name-prefix magic (stringly-typed), path arrays on flat entries (group
  metadata would need a separate map), `commands` at root + `entries` nested (two names, one
  concept).

### 5. `load` is a thunk, exclusively — decided three times

The most-relitigated point; final answer: **thunk only** (`() => import("./commands/x.ts")`),
string paths rejected.

- First raised: "can this just be a string and the framework does the import?" Grill initially
  landed on *both forms* (string resolved relative to the descriptor module; thunks mandatory
  in bundled contexts), and the README briefly made the string the prime example.
- Then reversed to thunk-only on legibility grounds: the thunk is ordinary import syntax —
  what happens is visible at the call site — plus typechecked against the command-module shape
  and bundler-visible. One form, one code path; no string resolver to build or spec.
- **The JS-bundler norms were decisive** (user-flagged as both interesting and the deciding
  factor). The worry behind preferring strings was that a thunk buries the import in a
  callback a bundler couldn't see. That worry is unfounded, and the ecosystem norm is the
  opposite:
  - Bundler discovery is *lexical, not clever*: bundlers parse each module to an AST and
    collect every `import("literal")` expression at parse time, regardless of how deeply it
    nests inside callbacks. The thunk is never invoked during bundling; the literal expression
    is simply found in the source.
  - `() => import("./x.ts")` is arguably the single most bundler-exercised idiom in modern JS
    — it is the lazy-loaded-route pattern every router ecosystem uses; webpack has code-split
    on it since v2. esbuild (which bundles first-party descriptors into the ns CLI) either
    code-splits dynamic imports (`splitting` on) or inlines them behind a resolved-promise
    wrapper (`splitting` off).
  - The real static/dynamic boundary is the *argument*, not the nesting:
    `import("./commands/hello.ts")` is discovered; `import(somePath)` or a template literal is
    opaque (esbuild leaves it as a runtime import and warns).
  - The thunk form *structurally encourages* literal specifiers because the path is written
    inline at the call site; a string-valued `load` field would invite computing paths and
    silently crossing that boundary.
  - Already empirically proven in-repo: existing preinstalled catalog entries carry
    `load: () => import(...)` thunks and are esbuild-bundled into the `ns` CLI today.
    Row 2 requires doc comments on the `load` types explaining this (lexical discovery,
    computed-specifier failure mode).

### 6. Extension points modernized: `id` + `cardinality`

Supersedes the original "field parity with JSON shapes" scope.

- `path: ["submit", "pre"]` → **`id: "submit.pre"`**. The array leaked a TOML-nesting
  implementation detail; the kernel's real identity is already a dotted `pointId` string (what
  `ns extension point <id>` takes; the array was `.join(".")`-ed anyway).
- `semantics: "additive" | "override"` → **`cardinality: "many" | "one"`**. Naming shortlist
  considered: `merge: "append" | "replace"` (recommended), `exclusive: true` boolean,
  `contributions`, `resolution`, list-vs-slot kind reframe; user picked `cardinality`.
- The "arbitrary constraints on points" ambition was **deliberately parked**: it implies a
  constraints vocabulary or author-supplied validation code (colliding with descriptor
  cheapness), and is a points-subsystem redesign beyond this objective's scope. Cardinality is
  explicitly the only per-point constraint today; the README records that richer constraints
  may arrive later.

### 7. `bundledArtifacts` — field-only rename, name litigated twice

- Renamed from `harnessArtifacts` for the extension author's POV; the harness-artifacts
  *subsystem* keeps its internal name (accepted vocabulary seam; full domain rename judged not
  worth a cross-cutting slice inside an already big-bang stack; neutral `artifacts` was the
  recommended middle path but `bundledArtifacts` won).
- Later challenged again ("should the key just be `bundled`?") and kept: adjectives dangle as
  keys (descriptor fields are nouns — `entries`, `points`), and "bundled" names where they live
  rather than what they are. Final: **`bundledArtifacts`**.

### 8. Naming: `defineRawCommand`, `renderHuman` kept

- The low-level constructor was `createCommand`; renamed **`defineRawCommand`** because
  create/define were too closely paired and "raw" says exactly what you get (raw argv, no
  parsing rim). Keeps the `define*` authoring family: `defineExtension` / `defineCommand` /
  `defineRawCommand`.
- **`renderHuman` kept** despite feeling odd: clinkr's formats are literally
  `"human" | "json" | "markdown"` (`--format human`), so renderer names are format-indexed —
  renderer-per-format, named-after-format is a coherent little system. Renaming at the SDK
  layer would recreate the hand-maintained translation-table problem one field at a time. If
  the itch persists, the honest fix is a clinkr-scoped *format-name* rename (e.g.
  `text`/`renderText`), explicitly out of scope here; note `human` deliberately marks audience
  (human eyes vs machine parse) in an agent-first CLI.

### 9. BYO CLI (bring-your-own command line) — the low-level contract's reason to exist

Theoretical stress-test: how would someone adopt an *existing* CLI (commander/yargs/whatever)
into this extension system? Two archetypes emerged:

- **Passthrough wrapper (cheap):** mount the foreign CLI as one leaf command via
  `defineRawCommand`; its `run` hands `invocation.argv` to the existing main and maps exit
  codes to envelope exits. Their parser/help stays theirs; ns sees one command. Costs:
  one-line ns help, no per-subcommand completion, generic envelope.
- **Native re-plumb (full):** re-declare the tree as `entries`, migrate per-command to
  `defineCommand`/Zod incrementally; a hidden `{ group: "legacy" }` passthrough can host the
  unmigrated remainder during transition.

**Contract consequence discovered here:** the neutral `run(ctx, invocation)` must carry the
**raw post-route argv tail** (`invocation.argv`) — if invocation were only clinkr-parsed
values, BYO would be structurally impossible. `defineCommand` is now understood as *consuming*
`invocation.argv` with the Zod schema, rather than argv being clinkr's private input. This also
exposed that the README under-documented the low-level layer (one vague sentence); the
"The command contract (low-level)" README section was added as a result, with the passthrough
wrapper as its motivating example. The envelope obligation is the deliberate, defended
adoption tax — it keeps the agent-facing `--format json` promise uniform.

### 10. Smaller settled items

- **Quick-start layout flattened** to `src/extension.ts` + `src/commands/`; the export map
  (`exports["./ns-extension"]`) is the *only* contract; multi-purpose packages (all first-party
  capability packages) may nest under `src/ns/`.
- **Export-subpath idiom validated**: `exports["./ns-extension"]` is the modern JS plugin
  pattern (precedents: Storybook's `./preset`/`./manager`/`./preview`; Node's own
  subpath-entry-point guidance) — standard resolution, statically detectable without executing
  code, doesn't claim the main export, typechecked entry, conditions available later. Caveat
  worth remembering: adding an `exports` map to a package that lacked one encapsulates all
  other subpaths — a third-party author retrofitting an existing package could break their own
  consumers.
- **`ns install <source>` framed as spec-shaped**: local directories now; `npm:` / `git:` / URL
  variants are the anticipated growth path, explicitly modeled on `pi install`'s source-spec
  surface (`npm:@foo/bar`, `git:github.com/...`, `https://...`, `ssh://...`, `./local/path`).
- **Quick-start command example shows real CLI input**: a positional argument
  (`positionals: { name: { position: 0 } }`) plus a boolean flag, with a note that the Zod
  schema is the single source of CLI inputs (fields become flags; `positionals` promotes).
- Points table description wording: "Extension point definitions"; the exec subgroup is
  presented as a motivating example, not a contract concept.

## Grill-session mechanics (for provenance)

Twelve structured questions were asked and answered. Notable non-recommended picks by the user:
clinkr-direct exposure (later superseded by the loose-coupling reframe), module-owned summary
(reversing session one), nested subgroups over the `exec` field, both-forms `load` (later
reversed to thunk-only), and `bundledArtifacts` field-only rename over neutral `artifacts`.
Recommended picks accepted: NsResult deletion, defineCommand-as-identity-helper (later evolved
into adapter), eager help loads, descriptor-relative string resolution (mooted by thunk-only),
flat layout, `entries` naming, neutral-envelope contract, adapt-in-helper dependency direction.

## Standing implications for implementers

- Row 2 resolves the neutral interface's exact home/field list — but `invocation.argv`,
  public `defineRawCommand`, mandatory envelope, and lexical-bundling doc comments are settled
  inputs, not open questions.
- The eager-help load path is a deliberate trade; row 7 must measure `ns <group> --help`
  specifically, not just root `--help`.
- Do not reintroduce: string `load`, a summary field on descriptor entries, an `exec` contract
  concept, `NsResult`, or kernel-side clinkr coupling in the loader/registry.
