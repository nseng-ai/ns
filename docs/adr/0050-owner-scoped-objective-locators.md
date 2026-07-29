# ADR 0050: Owner-Scoped Objective Locators

## Status

Accepted

Supersedes the Record Frontmatter schema and edge-identity decisions of [ADR 0025](0025-zero-kind-mirrored-objective-edges.md). ADR 0025's kind-less mirrored-edge model — one unordered pair per record pair, mirrored annotations, structural lint only — remains in force; only the identity an edge endpoint carries and the closed frontmatter key set change here.

## Context

Objective records were identified by a bare flat slug and stored directly under the Active Objective Root (`.ns/objectives/<slug>/`). That model has no notion of who stewards a record: every slug shares one global namespace, edges reference bare slugs, and there is no durable way for two people (or one person and an experimental agent identity) to hold same-named Objectives in one repository. The `objective-ownership` Objective settled a product direction: Objectives get a required singular owner, records nest under the owner, and the durable identity becomes a two-segment locator.

At migration time this repository held 181 records (7 open, 174 closed), all naturally stewarded by `schrockn`. Moving every closed record was judged unnecessary churn; leaving open records flat was judged an unacceptable second model.

## Decision

- **Objective Locator.** The durable Objective identity is `<owner>/<slug>`. Durable records, Objective Edges, machine output, candidate values, commit trailers, and scripts always use full locators. Slugs are owner-local: uniqueness is required only within one owner's namespace.
- **Required owner frontmatter.** Record Frontmatter is a closed schema of required `owner` plus optional/defaulted `blocked` and `edges`. Owner validation is offline and deterministic: lowercase ASCII alphanumerics with single internal hyphens, no leading/trailing hyphen, no leading `@`, at most 39 characters. Structural validation never verifies a handle against GitHub.
- **Owner-nested canonical storage.** Canonical records live at `.ns/objectives/<owner>/<slug>/`. A nested record's frontmatter owner must equal its owner path segment. Flat open records are invalid and are surfaced by `ns objective check --all` as structural errors.
- **Narrow legacy-flat-closed exception.** A flat directory directly under the root is tolerated only while it contains `closed.md`; its owner comes from valid frontmatter and its identity is the full locator. Only storage nesting is exempt — identity, owner syntax, and edge rules are not. The exception retires when the parked closed-record migration moves closed records under their owners and the dual-layout discovery code is deleted.
- **Full-locator mirrored edges.** Edge endpoints are full locator strings; edge identity is the unordered pair of locators. Mirror lookup, duplicate/self/dangling checks, and closure propagation resolve endpoints through discovered inventory across every owner, including legacy flat closed records.
- **Current-owner shorthand.** A bare slug in command input means exactly `<current-owner>/<slug>`, where the current owner is the authenticated GitHub login. Bare slugs never fall back to another owner's namespace, unique or not. Full locators, explicit `--owner`, and `--all-owners` work without authentication; default `ns objective list` and bare-slug resolution fail with actionable locator guidance when no login is available. A later per-user configuration system may replace GitHub-login defaulting behind the Objective-owned owner gateway without changing storage or command semantics.
- **Creation owner resolution.** Creation remains skill-owned. The hidden, read-only `ns objective exec resolve-owner` resolves the owner deterministically: explicit `--owner` wins and is validated offline; otherwise the authenticated GitHub login is used; with neither, creation stops and requires explicit `--owner`. The creation confirmation displays the resolved owner and full locator before files are written.
- **Immutable identity.** Owner and slug are immutable identity components. Renames and ownership transfer use close-and-replace, not in-place mutation.
- **Ownership is stewardship, not access control.** The owner names who stewards the record's direction; it grants no permissions and gates no reads or edits.

## Consequences

- The implementation package carries first-class identity values (`ObjectiveLocator`, owner/slug parsers) and an `ObjectiveOwnerGateway`; discovery returns record locations (owner, slug, locator, path, layout, status) and structural hygiene findings instead of reconstructing paths from slugs.
- `ns objective check --all` expands from an edge-only sweep into a repository structural sweep: root hygiene, owner-directory validity, duplicate locators, flat-open rejection, required-owner and owner/path-agreement checks, and full-locator edge lint.
- This repository's 7 open records moved to `.ns/objectives/schrockn/<slug>/`; all 181 records received `owner: schrockn`; every edge endpoint was rewritten to a full locator with mirrors preserved.
- Until the legacy exception retires, discovery reads closed flat records' frontmatter to learn their owner, and changed-path attribution must intersect path-shape candidates with discovered inventory because path shape alone cannot distinguish `<owner>/<slug>` from a flat record's subdirectory.
