# Managing ns extensions — `ns extension` (README draft)

> Status: README-driven design draft for the `ns extension install` / `remove` / `update`
> acquisition surface (roadmap row: "Design the `ns install` / `ns remove` / `ns update`
> surface"). The main body is written as the future customer-facing doc, as if shipped.
> Open decisions and migration notes are at the end. Settled inputs: bare core (no
> extensions bundled in `@nseng-ai/ns`), explicit `npm:` source-spec grammar (Pi parity),
> admin verbs under the `ns extension` group.

The `ns` CLI ships bare: installing `@nseng-ai/ns` gives you the kernel — `ns init`,
`ns extension …`, `ns skills …`, `ns update`, shell integration — and no capabilities.
Every capability, including first-party ones like Objectives, arrives as an **extension**:
an npm package that exposes a typed descriptor at `exports["./ns-extension"]` declaring
its commands, extension points, and bundled harness artifacts (see
"Writing an ns extension").

`ns extension` is where extensions are administered:

```
ns extension install <source>          Install an extension and record it in ns.toml
ns extension uninstall <source>        Uninstall an extension and its provisioned artifacts
ns extension update <source>           Update one installed extension (floating specs only)
ns extension list                      Show declared extensions and their status
ns extension point <id>                Show one extension point definition (inspection)
ns extension points                    List extension points (inspection)
```

## Quick start

```bash
npm install -g @nseng-ai/ns
cd your-repo
ns init --harness claude-code
ns extension install npm:@nseng-ai/objectives
```

After this, `ns objective …` commands work in the repo, the objective skills are
provisioned into your harness, and your agents are instructed to use them.

## Source specs

The argument to `install`/`uninstall`/`update` is a **source spec** — the same string that
is recorded in `ns.toml`, verbatim. There is no separate command-line grammar.

| Form                    | Example                             | Meaning                                     |
| ----------------------- | ----------------------------------- | ------------------------------------------- |
| `npm:<name>`            | `npm:@nseng-ai/objectives`          | npm package, **floating** (updates move it) |
| `npm:<name>@<version>`  | `npm:@nseng-ai/objectives@0.2.0`    | npm package, **pinned** (updates skip it)   |
| local path (unprefixed) | `./tools/my-extension`, `/abs/path` | local package directory, no copy            |
| `git:…` / URL           | —                                   | reserved, not supported yet                 |

A bare package name without `npm:` is a local path, never an npm lookup — the spec is
explicit so that `ns.toml`, the CLI, and the loader share one unambiguous grammar.

## Where things live

- **`ns.toml` (committed).** `install` appends the source spec to `extensions = [...]`;
  `uninstall` deletes it. This file is the single durable record — there is no
  user-global extension state.
- **`.ns/managed-extensions/` (ignored).** npm sources are installed here into a managed
  npm project (`npm install --no-save --ignore-scripts`); local paths resolve in place
  and are never copied. `ns init` ensures the ignore rule.

Because the record is repo-level and committed, teammates share the intended extension
set. In a fresh clone, initialize the project's harness configuration and run the exact
recorded install spec to restore a missing managed npm package.

## Commands

### `ns extension install <source>`

The repository must already have valid top-level `harnesses = [...]` configuration from
`ns init`. Missing or invalid harness configuration fails before acquisition or writes and
directs the customer to `ns init --harness <claude-code|codex|pi>`.

1. Parses the explicit source grammar and checks the prospective `ns.toml` edit. An exact
   spec is idempotent; the same canonical npm package or normalized local path under a
   different spec is an identity conflict and is rejected before acquisition.
2. Acquires the package (npm → managed storage; local → resolved and validated in place,
   never copied).
3. Imports `exports["./ns-extension"]` and fully validates package identity/version,
   export resolution, the descriptor module, and the complete descriptor schema together
   with the prospective declared-descriptor set. Any diagnostic fails preflight and no
   durable declaration or activation file is written.
4. Records the exact requested spec in `ns.toml` `extensions = [...]` (appended
   idempotently, with no unrelated reformatting) and runs full descriptor-driven
   activation using the persisted harnesses.

Re-running the exact spec reports `isRecorded: false`, restores a missing managed npm
package, and reconciles activation drift. It does **not** refresh an already-present
floating npm package; refresh belongs to `ns extension update`. If apply fails after some
writes, the command preserves completed writes and reports the failed phase plus completed
duties. Re-running performs forward recovery and converges safely rather than rolling
back. Danger tier 1 — scoped, reversible writes; no confirmation, output states exactly
what changed.

> **Trust warning:** npm acquisition uses `--ignore-scripts`, but that only disables npm
> lifecycle scripts. It does not sandbox imported descriptor code or selected command
> modules. Install only extensions you trust.

### `ns extension uninstall <source>`

The inverse of `install`, matched by **identity**, not literal string: npm specs match by
package name (any version), local specs by resolved absolute path. Removes the `ns.toml`
entry, deletes the managed install (npm sources only), and deprovisions the harness
artifacts this extension provisioned (manifest-tracked — only files ns placed are
touched). The extension's own consumer data (for example `.ns/objectives/`) is **never**
deleted. Reversible by reinstalling.

### `ns extension update <source> [--dry-run|-n]`

Updates exactly one declared extension; the source spec is required. Bare
`ns extension update` is a usage error naming the missing target. (A fleet-wide `--all`
is deliberately deferred.)

- A floating npm spec (`npm:name`) is reinstalled at the registry latest.
- A pinned npm spec (`npm:name@version`) is never moved — only reconciled if the managed
  install is missing or corrupt. Move a pin by running `install` with the new version.
- A local-path spec has nothing to update (it resolves in place) and reports as such.
- After package changes, bundled harness artifacts are re-reconciled.

`--dry-run` reports what would change and exits `ok`. Updating never edits `ns.toml`.

### `ns extension list`

One row per declared spec: source kind, resolved package name/version, installed vs
missing, artifact provisioning state. The machine shape (`--format json`) is the
canonical way agents inspect extension status.

### `ns extension point <id>` / `points`

Unchanged inspection commands over descriptor-declared extension points.

## Relationship to neighboring commands

- **`ns init`** stays the repo-activation orchestrator (core built-in — it must work on a
  bare install). Its duties are extension-agnostic: verify git posture, select and
  persist harnesses to `ns.toml`, write the managed `AGENTS.md` block (with the
  `CLAUDE.md → @AGENTS.md` import) and ensure `.ns/` ignore rules, and provision the
  artifacts of whatever extensions are installed. Extension-specific content —
  instruction-block sections, consumer dirs like `.ns/objectives/` — comes from the
  extensions themselves, not from `init`. Initialization comes first: extension install
  consumes the harnesses already persisted by `ns init` and fails without them.
- **`ns skills …`** remains the harness-artifact machinery (`list`/`path`/`install`);
  `ns extension install/update/remove` drive it internally rather than duplicating it.
- **`ns update`** (top-level) narrows to ns **self-update** (reserved; owned by the
  self-update initiative). Its current `--extensions` harness-artifact mode migrates into
  `ns extension update`.

All commands follow the standard ns machine contract: `--format json`, `--json-schema`,
stable camelCase envelopes with kebab-case `errorType` values, exit codes `0/1/2`.

---

## Design notes and open decisions (not part of the shipped doc)

**Positions taken above, for confirmation:**

1. **Repo-level `ns.toml` is the only settings home in v1.** This amends the 2026-07-05
   "user-level settings only" note: the descriptor-contract work deliberately deleted the
   user-global extension root, the landed `ns install` writes `ns.toml`, and repo-level
   is git-native and team-shareable (Pi's project-scope auto-install behavior, made the
   default). A user scope (Pi's actual default, `-l` inverse) can be added later without
   breaking this grammar.
2. **Top-level `ns install` is retired** in favor of `ns extension install`. Breaking
   change, allowed pre-release. `ns update --extensions` migrates likewise.
3. **`ns init` owns harness selection and must run before `install`.** Install consumes
   persisted harnesses and fails before acquisition or writes when they are absent or
   invalid; it never accepts or infers a harness.
4. **The removal verb is `uninstall`, mirroring `install`** (owner call, 2026-07-09).
   Pi's canonical verb is `remove` (with an `uninstall` alias); ns makes the mirror name
   canonical and ships no alias. Tier 1 (no `--yes`): it touches only ns-managed state
   and is reversible by reinstall.
5. **`ns extension update` takes exactly one required source target** (owner call,
   2026-07-09): no bare invocation, no `--all` fleet mode in v1.

**Open, needing decisions or their own slices:**

- **Generic `ns init` (settled direction, needs its own design slice).** `ns init`
  itself is justified and stays a core built-in — its generic duties (git posture,
  harness selection/persistence, managed `AGENTS.md` block mechanics, `.ns/` scaffolding
  and ignore rules, provisioning installed extensions' artifacts) exist regardless of
  which extensions are present. The mistake (owner, 2026-07-09) was baking
  extension-specific behavior into it: the objectives instruction-block content and
  `.ns/objectives/` creation. Direction: extensions contribute their activation content
  (instruction-block sections, consumer dirs) through the descriptor, and `init`
  orchestrates. This resolves the standing "where does `ns init` live" open question —
  core owns the orchestrator, extensions own the content — but the descriptor activation
  surface needs a design slice, and the bare core cannot republish with the current
  objectives-flavored `ns-init` in it.
- **Unbundling slice.** `@nseng-ai/ns@0.1.1` ships objectives preinstalled; bare core
  requires removing bundled first-party descriptors from the host, republishing, and
  re-running the checkout-free smoke against the `extension install` path
  (`npx @nseng-ai/ns … objective list` after install).
- **Registry trust (settled for this slice).** `--ignore-scripts` guards npm lifecycle
  scripts, but descriptor code executes during validation/catalog build and is not
  sandboxed. The customer guidance above states this bluntly; v1 adds no consent gate.
- **Parked (recorded, not designed):** `ns extension update --all` fleet mode; `git:`/URL
  sources; per-extension resource filtering and enable/disable (`pi config` parity);
  user/global scope; bare-name npm sugar; `ns extension update` moving pinned refs.
