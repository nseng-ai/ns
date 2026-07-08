# Upstream Skill Melding

How ns tracks upstream skill repositories whose content is not just *vendored* but
*melded* — semantically merged into first-party skills, host prompts, or `.ns/*`
artifacts. Plain vendoring mechanics live in the `skill-management` skill and
`docs/conventions/skill-conventions.md`; this document owns the process for everything
an upstream refresh cannot mechanically overwrite.

## Vendor vs meld

- **Vendored**: an upstream skill installed as-shipped under `.agents/skills/<name>/`.
  Refreshes are mechanical (`npx skills add ... --skill <name>`); review agents treat
  the content as third-party code and only look at integration boundaries.
- **Melded**: upstream *content* re-expressed inside an ns-owned surface — a first-party
  skill, a host prompt constant, a `.ns/reviews` prompt, or a documented conceptual
  adaptation. A refresh can never overwrite a melded surface; someone must semantically
  merge the upstream change. Melding is invisible to `skills-lock.json`, which is why it
  needs the explicit contract below.

## Single-source pin

Each upstream repo has exactly one commit-level provenance record: a prose pin in that
upstream's *instance doc* (see below). Nothing else — no melded surface, no lineage
block, no lockfile — duplicates the hash. `skills-lock.json` records source, upstream
`skillPath`, and a content hash, but no commit; the prose pin is deliberately the only
commit-level truth. Surfaces that need provenance record their upstream skill *path*
and point at the instance doc by name.

## The registry/lineage contract

Melding is tracked from both ends:

- **Registry** (instance doc): a "Melded surfaces" table mapping upstream skill → ns
  surface → nature of melding → sync action. On every refresh, walk the table and apply
  each row's sync action. Inspired-by entries are listed with sync action
  **none (credit only)**.
- **Lineage block** (each melded surface): a short standardized prose block naming the
  upstream skill path, the nature of the melding, and the instance doc — never the
  commit hash. Code surfaces use a comment; skills use a prose paragraph near the top.

Finer-grained inline source markers (e.g. `src: <upstream>` HTML comments per section)
are a permitted supplement to the lineage block, not a replacement for the registry row.

## Rename-on-import

`npx skills` has no rename flag. To import an upstream skill under a different ns name:
install with `--skill <upstream-name>`, then rename the vendored dir, the lockfile key,
and the frontmatter `name:` line per the `skill-management` rename flow, and verify with
`areg check`. The lock **key** is the local name; the `skillPath` field keeps recording
the upstream in-repo path. Record every rename in the instance doc's rename table with
its rationale (usually a name collision with a first-party or harness surface).

## Minimal forks

Vendored dirs stay byte-identical to upstream except:

- areg-owned invocation overlays (`disable-model-invocation` frontmatter,
  `agents/openai.yaml`), which are re-derived with `areg skill apply`, never hand-merged;
- recorded forks: the smallest possible edit (ideally one line), recorded in the
  instance doc with its rationale, and re-applied after every refresh.

If a change wants to be bigger than a minimal fork, it is a meld: move the content into
an ns-owned surface and register it.

## Update procedure

When an upstream repo moves:

1. Read the upstream changelog and diff the vendored skills against upstream HEAD.
2. Refresh vendored skills with targeted `npx skills add <source> --skill <name>`
   commands (never a broad update), then re-apply recorded forks and re-derive
   invocation overlays via `areg skill apply`.
3. Import or reject new upstream skills deliberately; record rejections and renames in
   the instance doc.
4. Walk the melded-surfaces registry and apply each row's sync action. Semantic-merge
   rows get a real merge in the upstream author's intent, re-expressed in the surface's
   own vocabulary; LM-sync rows follow their named adaptation doc.
5. For upstream skills with real content changes, run a **semantic sweep**: one
   read-only scout per changed skill over first-party skills and host prompts, looking
   for unattributed embeddings. Verified hits get a lineage block and a registry row;
   near-misses are dismissed in writing in the instance doc.
6. Bump the pin in the instance doc.
7. Validate: `areg check` and `areg doctor skills`; byte-diff every refreshed vendored
   dir against upstream (only recorded forks and overlays may differ); inspect
   `skills-lock.json` for unrelated churn; run repo validation (`just`).

## Conflict classes

Recurring upstream/ns conflicts are resolved by standing policy, recorded once in the
instance doc and inherited by every registry row, so refreshes do not relitigate them:

- **Durable state: tickets → Objectives.** The canonical example. Wherever an upstream
  skill uses tickets or an issue tracker for durable state, ns uses Objectives. This is
  the recorded reason for rejecting upstream ticket-workflow skills and for adapting
  (not adopting) tracker-backed planning skills.
- **Workflow ownership.** Branch Memory, branch-context, handoffs, Graphite stacks, CCC,
  and other ns-native workflows are never replaced by upstream workflow skills without a
  separate product decision.
- **Harness invocation semantics.** Upstream invocation intent is mapped onto ns
  invocation kinds via `areg skill apply`, taking harness caveats
  (`docs/research/harness-skill-invocation.md`) into account.

## Instance docs

Each upstream repo with melded content gets one instance doc under `docs/agents/`
holding its pin, import/rejection/rename tables, recorded forks, melded-surfaces
registry, deferred follow-ups, and any upstream-specific steps. Instance docs are
created lazily — only when an upstream's first meld or nontrivial update lands.
Current instance docs:

- [`docs/agents/matt-pocock-skills.md`](../agents/matt-pocock-skills.md) —
  `mattpocock/skills`.
