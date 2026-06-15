# Pure Core Spec (Slice 1 + config)

Four pure concerns. All become exported TS functions with direct Vitest unit tests. The Python
tests listed at the end of each section are the port checklist.

---

## 1. Diff parsing — `diff_parsing.py` → `diff-parsing.ts`

### `estimate_tokens(text) -> int` (`diff_parsing.py:44-48`)
```
text === "" ? 0 : Math.ceil([...text].length / 4)
```
**Count code points** (`[...text].length`), not `text.length`. Drives diff-cap inclusion (Slice 4).

### `DiffFile` (`diff_parsing.py:15-28`)
Fields: `path: string`, `oldPath: string | null` (set only for `renamed`/`copied`, else null),
`changeKind: "added"|"modified"|"deleted"|"renamed"|"copied"`, `rawText: string` (exact segment,
round-trips), `isBinary: boolean`, `addedLines`, `removedLines`, `hunkCount`, `byteSize`
(**UTF-8 byte length** — `Buffer.byteLength`/`TextEncoder`, not string length), `estimatedTokens`.

### `parseUnifiedDiff(diffText) -> DiffFile[]`
- Empty/whitespace `diffText` → `[]` (`:51-56`).
- **Segmentation** (`_diff_segments`, `:59-73`): `splitlines(keepends=True)` (preserve line
  terminators); a new segment starts at every line beginning with `"diff --git "` **only when a
  segment is already accumulating** (so the first file's header doesn't prematurely flush). Trailing
  lines flush as the final segment. Text before any `diff --git` (or with none) → one degraded
  segment.
- **Per-segment** (`_parse_segment`, `:76-116`): path resolution order = patch headers
  (`--- `/`+++ ` lines; `/dev/null` → null) → fallback `diff --git` line tokens → rename/copy
  metadata override → if new path still null use `old_path or ""` → force `old_path = null` unless
  renamed/copied. Path prefix normalization strips leading `a/`/`b/` (`/dev/null` & null pass
  through).
- **change kind** (`_change_kind`, `:119-136`), first match wins: `"new file mode "`→added;
  `"deleted file mode "`→deleted; presence of `rename from `/`rename to `→renamed; `copy from `/
  `copy to `→copied; else modified.
- **binary** (`:102`): any line `startswith("Binary files ") and endswith(" differ")`.
- **hunk metrics** (`_hunk_metrics`, `:177-200`): binary → (0,0,0). Hunk header regex
  `^@@ -\d+(?:,\d+)? \+(?P<start>\d+)(?:,\d+)? @@`. Each header → `hunkCount++`, `inHunk=true`.
  Inside a hunk, skip `+++`/`---` lines; `+`→added++, `-`→removed++. Lines before first hunk header
  ignored.
- **Git C-quoted path decoding** (`_decode_git_quoted_path`, `:256-293`): un-escape `"..."` tokens
  at the **byte** level — simple escapes (`\a=7 \b=8 \t=9 \n=10 \v=11 \f=12 \r=13 \\=92 \"=34`),
  octal `\NNN` (≤255), assemble a byte buffer, decode UTF-8 with replacement. E.g.
  `"a/spaced/\303\251 file.txt"` → `spaced/é file.txt`.

### TS test checklist (`tests/unit/test_diff_parsing.py`)
Single-file fixtures asserting all `DiffFile` fields + `rawText == input`: modified, added, deleted,
pure-rename, rename-with-content, copy, binary (`image.png`, isBinary), quoted-path
(`spaced/é file.txt`). Plus: multi-file ordering; round-trip (concat of all `rawText` == original);
empty `""`/`"\n"`/`"  \n\t"` → `[]`; degraded segment (`"not a git diff\n+but still text\n"` → 1
file, modified, `path=""`, 0/0); `estimate_tokens`: `""`→0, `"a"`→1, `"abcd"`→1, `"abcde"`→2,
`"x"*41`→11, monotonic.

---

## 2. Review-definition frontmatter — `review_definition.py` → `review-definition.ts`

`parseReviewDefinition(source, { name }) -> ReviewDefinition` (`:18-59`).
`ReviewDefinition` = `{ name, description, instructions, defaultModel: string | null, applicability }`.

- **YAML lib**: PyYAML `safe_load`; TS use `yaml` (eemeli) `parse`, then validate with Zod. YAML 1.1
  coercion matters: `123`→number, `[]`→array — these must fail the "non-empty string" checks.
- **Frontmatter split** (`_split_frontmatter`, `:136-155`): fence `---`. First non-blank line
  (stripped) must equal `---` else error "must begin with a `---` frontmatter fence." (empty source
  → "Review definition is empty."). Next stripped-`---` closes it; none → "missing a closing `---`
  fence." Frontmatter = lines between, joined `\n`; body = lines after, joined `\n`.
- **Allowed top-level keys**: `{applies_to, description, default_model}` — unknown keys → error
  listing them sorted + "Allowed fields: …".
- **Validation**: parsed frontmatter must be non-null + a mapping. `description` required, non-empty
  after trim (stored trimmed). `default_model` optional → null if absent; if present must be
  non-empty trimmed string (so `[]`/`123` fail). `name` arg required non-empty trimmed.
  `instructions = body.trim()`, must be non-empty.
- **Applicability** (`_parse_applicability`, `:74-94`): absent `applies_to` → empty
  applicability. Must be a mapping; allowed sub-keys `{include, exclude}`. `include` **required &
  non-empty**; `exclude` optional, may be empty, default `[]`. Each pattern via
  `_validate_applicability_pattern` (`:118-133`): must be non-empty string; normalize
  `trim().replace(/\\/g, "/")`; reject `:(`-prefix ("globs, not git pathspecs"), leading `/`
  ("repo-relative"), `..` segment ("no `..` segments"); return normalized.
- **Model resolution**: none here — `default_model` stored verbatim (trimmed); accepts any non-empty
  string (`sonnet`, `claude-sonnet-4-6`, `gpt-5-mini`). Effective model chosen in `workflow.ts`.

### TS test checklist (`tests/unit/test_review_definition.py`)
Real `reviews/*.md` fixtures (dignified-python: `default_model=haiku`, include `["**/*.py"]`, exclude
`["**/tests/**/*.py"]`; typescript-style; duplicative-abstractions). Plus: full applicability OK; no
`default_model`→null; missing instructions / missing open fence / missing close fence / missing
description / blank name → respective errors; unknown key `severity` (and multiple keys listed +
"Allowed fields:"); accepts varied non-empty models; rejects `default_model` `""`/`"   "`/`"[]"`/
`"123"`; applicability matrix: `applies_to: []`; unknown sub-key; missing/empty `include`; scalar
`include`; `include: [123]`; `include: ['']`; `/src/**/*.py` (repo-relative); `../src/**/*.py`
(`..`); `:(glob)**/*.py` (pathspecs).

---

## 3. Path-applicability globs — `review_applicability.py` → `review-applicability.ts`

**Hand-rolled gitignore-style segment matcher** — NOT a glob library, NOT git pathspec (that is a
different engine; see §4). Keep them distinct.

- `applicableReviewKeys(definitionsByKey, { changedPaths }) -> string[]` (`:10-20`): keys whose
  applicability matches any changed path.
- `reviewAppliesToPaths(applicability, changedPaths) -> boolean` (`:23-31`): empty `include` → always
  true (even with no paths); else true iff **any** changed path "contributes".
- `pathMatchesPattern(path, pattern) -> boolean` (`:34-40`): split both into segments; false if
  either invalid; else recursive match.
- **Split** (`_split_path`, `:50-59`): `replace(/\\/g,"/").trim()`; invalid (→null/non-match) if
  empty or starts with `/`; strip leading `./`; split on `/` dropping empties; invalid if no
  segments or any segment is `..`.
- **Segment match** (`_segments_match`, `:62-81`, recursive): empty pattern → match iff no path
  segments left. `**` head matches zero-or-more path segments (try consume `**`, else consume one
  path segment keeping `**`). Otherwise require a path segment and match
  `fnmatchcase(pathSeg, patternSeg)` then recurse tails.
- **Case-sensitive** (`fnmatchcase`) on all OSes. Within a segment: `*` = any chars **not crossing
  `/`**, `?` = one char, `[seq]`/`[!seq]` classes. Only `**` crosses directory boundaries.
- **Contribution** (`_path_contributes`, `:43-47`): matches some `include` AND no `exclude`.

### TS test checklist (`tests/unit/test_review_applicability.py`)
`**/*.py` matches `app.py` (zero dirs) & `packages/pkg/src/app.py`; `**/tests/**/*.py` matches
`tests/test_x.py` & deep; non-matches: `**/*.py` vs `README.md`, `*.py` vs `packages/pkg/src/app.py`
(single `*` doesn't cross `/`), `**/*.ts` vs `app.tsx`; empty include → all incl. empty; test-only
py excluded by dignified-python pair; source py applies; mixed paths (one included makes applicable);
non-empty include + no changed paths → not applicable.

---

## 4. `asdl.toml [roaster.diff]` config + git-pathspec conversion

Config schema lives in **shared** `packages/asdl-core/src/asdl_core/project_config.py`. The
glob→pathspec conversion lives in the **diff gateway** (`gateways/local_diff/real.py`).

### Config parsing (`project_config.py`)
- `[roaster.diff].exclude` → `tuple[str,...]` (default `()` when `[roaster]`/`exclude` absent).
- `exclude` must be a TOML array of non-empty strings (else "must be a TOML array of non-empty
  strings" / "must contain only non-empty strings").
- Per-pattern validation (`_validate_roaster_exclude_pattern`, `:163-185`): `:(`-prefix → "plain
  glob patterns, not raw Git pathspecs"; absolute path (leading `/`) → "repo-relative"; `..` segment
  → "must not contain '..' path segments".
- This repo's `asdl.toml`: `exclude = [".agents/skills/**/*.py", ".claude/skills/**/*.py"]`.
- TS: parse with `smol-toml`, validate with the same rules. Decide during Slice 3 whether to port
  this into asdl-core TS or keep a roaster-local `project-config.ts` (the Python config is shared,
  but no TS consumer exists yet — a roaster-local module is the lower-risk default).

### glob → git-pathspec conversion (STATED RISK) — `gateways/local_diff/real.py:51-56`
```python
cmd = ["git", "diff", "--no-ext-diff", f"origin/{base_ref}...HEAD"]
if exclude_globs:
    exclude_pathspecs = tuple(f":(exclude,glob){pattern}" for pattern in exclude_globs)
    cmd.extend(["--", ".", *exclude_pathspecs])
```
Each repo-relative glob `P` → `:(exclude,glob)P`; diff scoped with `-- . <pathspecs…>`. Range is
**three-dot** `origin/<base>...HEAD` with `--no-ext-diff`. Notes:
- `origin/` prefix is added here (the trunk resolver does not add it).
- `:(…,glob)` enables `**`-aware git globbing — this is git's engine, **not** the §3 matcher.
- The validator guarantees inputs are plain globs, so string-concat is safe.

### TS test checklist (`asdl-core tests/unit/test_project_config.py`)
Missing file → `()`; empty TOML → `()`; areg-only → `()`; parses two excludes; parses areg+roaster;
rejects scalar `exclude`, `["*.py", 1]`, `[""]`, `["/tmp/*.py"]`, `["skills/../*.py"]`,
`[":(exclude,glob)vendor/**/*.py"]`; unrelated sections ignored; non-table known sections rejected;
non-file config path rejected. Plus a direct test of the glob→pathspec command builder.

---

## Cross-cutting gotchas
1. `estimate_tokens` uses code points (`[...text].length`), `byteSize` uses UTF-8 bytes.
2. **Two distinct glob engines**: §3 custom segment matcher (case-sensitive, `*` no cross `/`) vs §4
   git `:(exclude,glob)`. Do not unify.
3. Git C-quoted path decoding is byte-level with UTF-8 replacement.
4. YAML type coercion (`123`→num, `[]`→arr) is load-bearing for validation branches.
</content>
