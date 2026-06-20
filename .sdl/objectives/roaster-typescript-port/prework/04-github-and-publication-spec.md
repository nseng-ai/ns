# GitHub Gateway, Publication & Inline-Commentability (Slices 5–6) + exec commands (7)

Roaster's GitHub surface is **5 operations**, funneled through one injected gateway. Build a fresh
roaster-local TS gateway (interface + real `gh`-CLI adapter + in-memory fake). Do **not** share or
extend asdl-core's 17-method `PRGateway`. The pure modules (`inline_commentability.py`,
`findings_publication.py`) have no GitHub dependency beyond the `PRChangedFile` shape.

## 1. The 5-method roaster-local GitHub gateway

Backing `gh` plumbing: `asdl-core/.../gh/real_gateway_helpers.py`. REST via `gh api --paginate`;
create-review POSTs JSON via `--input -`. The "discussion comment" ops are GitHub **issue comments**
(`issues/{n}/comments`), not review-thread comments.

| #  | Method                                                     | Used by               | gh / REST                                                                      | Inputs                                                                  | Output (only fields roaster reads)                                                                            |
| -- | ---------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1  | `getPrChangedFiles(pr)`                                    | post-inline-findings  | `GET pulls/{n}/files --paginate`                                               | `pr:int`                                                                | `PRChangedFile[] { path, status, patch: string \| null }`                                                     |
| 2  | `getPrReviewComments(pr)`                                  | post-inline-findings  | `GET pulls/{n}/comments --paginate`                                            | `pr:int`                                                                | `PRReviewComment[]` — reads only `author`, `body`                                                             |
| 3  | `createPrReview(pr, comments)`                             | post-inline-findings  | `POST pulls/{n}/reviews` body `{event:"COMMENT", comments:[{path,line,body}]}` | `pr:int`, `PRInlineCommentInput[] {path:string, line:int, body:string}` | return ignored (success/throw only) → can be `void`                                                           |
| 4  | `findPrDiscussionCommentByMarker(pr, marker, authorLogin)` | post-findings-comment | client-side filter over `GET issues/{n}/comments --paginate`                   | `pr:int`, `marker:string`, `authorLogin:string`                         | first comment where `author == authorLogin AND marker in body` → `PRDiscussionComment {id:int, body} \| null` |
| 5a | `addPrDiscussionComment(pr, body)`                         | post-findings-comment | `POST issues/{n}/comments -f body=…`                                           | `pr:int`, `body:string`                                                 | `PRDiscussionComment`                                                                                         |
| 5b | `updatePrDiscussionComment(commentId, body)`               | post-findings-comment | `PATCH issues/comments/{id} -f body=…`                                         | `commentId:int`, `body:string`                                          | `PRDiscussionComment`                                                                                         |

`PRChangedFile.patch` MUST stay `string | null` — GitHub omits `patch` for binary/too-large files
and the null is meaningful (→ `patch_unavailable`). `create_pr_review` is **one batched review**, not
N comment POSTs. Bot author login `"github-actions[bot]"` (consolidate; Python duplicates it).

## 2. Inline-commentability — `inline_commentability.py` → `inline-commentability.ts`

### `commentableRightSideLines(patch: string | null) -> Set<int>` (`:56-86`)

```
patch === null → ∅
rightLine = null
for each line in patch.split(/\r?\n/):
  m = /^@@ -\d+(?:,\d+)? \+(?P<start>\d+)(?:,\d+)? @@/.exec(line)
  if m: rightLine = int(m.start); continue
  if rightLine === null: continue          # ignore everything before first hunk (even '+' lines)
  if line.startsWith("\\"): continue       # "\ No newline at end of file"
  if line.startsWith("-"): continue        # left-side-only: skip WITHOUT advancing
  if line.startsWith("+") || line.startsWith(" "): add(rightLine); rightLine += 1
```

Load-bearing subtleties: `-` skips **without advancing**; pre-hunk gating; `+`/`` advance. Hunk
regex keeps optional counts on both sides (supports `@@ -7 +8 @@`).

### `classifyInlineFindings(findings, changedFiles) -> …` (`:89-134`)

Per finding, first match wins: `path == null` → `missing_path`; `line == null` → `missing_line`;
path not in changed files → `file_not_changed`; that file's `patch == null` → `patch_unavailable`;
`line` not in commentable set → `line_not_in_diff`; else inlineable with `{path, line}`.

### TS test checklist (`test_inline_commentability.py`)

added+context included / deleted excluded; new-file `@@ -0,0 +1,3 @@`→{1,2,3}; deleted-file
`@@ -1,3 +0,0 @@`→∅; single-line `@@ -7 +8 @@`→{8}; multi-hunk union; `\ No newline` ignored;
pre-hunk `+`-text ignored; null patch→∅; all four fallback reasons.

## 3. Findings publication — `findings_publication.py` → `findings-publication.ts`

Markers and envelope are a **clean break** — redesign freely as long as the producer/consumer pair
inside roaster agrees, with one caveat: if you ever read comments authored by the *Python* roaster
during migration, markers must stay compatible. The objective accepts orphaning Python-era inline
comments at cutover, so a fresh marker scheme is fine.

Python reference (for parity of *structure*, not bytes):

- **Summary marker**: `<!-- roaster:{review_name} -->` (must be the comment's first line; parse-back
  regex `^<!-- (roaster:[^ ]+) -->$`).
- **Inline marker**: `<!-- roaster-inline:{review_name}:{digest} -->`, `digest` = first 16 hex of
  SHA-256 over **NUL-joined** `(review_name, path, str(line) or "", severity, summary, details)`.
  This is the dedup key — internal run-to-run stability is all that matters.
- **Aggregate comment** (`render_findings_comment`, `:187-212`): marker line; `## roaster ·
  \`{review_name}\``; optional`### Inline posting`block (posted / skipped-duplicate /
  summary-only / API-error bullets); optional`### Review input coverage`block; body =
  error | no-findings | findings table (`| Severity | File | Line | Summary |`) +`<details>`with`### \`{location}\` — {severity}`per finding + footer. Severity icons`⛔/⚠️/ℹ️`; null line →`—`and location omits`:line`.
- **Inline comment body** (`render_inline_body`, `:269-280`): marker; `**{severity}: {summary}**`;
  `_Review: \`{review_name}\`._`; details; "*Posted by roaster…*".
- **Activity log** (`preserve_activity_log`, `:233-242`): extract prior `-`-entries under
  `### Activity Log` in existing body; strip from heading onward in the new body; append the new
  `run_summary` (ISO-8601-Z timestamp + run URL); keep **last 10**; re-emit under a fresh heading;
  trailing newline.

### TS test checklist (`test_findings_publication.py`)

Marker round-trip (first-line requirement); inline digest stability + dedup; aggregate rendering for
error / no-findings / findings(+coverage) / inline-status; null-line rendering; activity-log
extract/strip/merge/cap-10.

## 4. The three exec commands (Slice 7) — `cli/roaster/exec/`

All three read the prior pipeline stage on **stdin**. Registered under the hidden `exec` group.
Given they stream stdin and emit raw stdout, model them as clinkr `RawCommandSpec` ops (like
pr-address's stdin ops), not the standard envelope ops.

- **`post-inline-findings`** (`post_inline_findings.py`): `--pr-number INT`; **findings run-envelope
  on stdin**. If the envelope is an error-payload or has no findings → no-op (counts 0) and **never
  query the gateway**. Else: getPrChangedFiles → classify → getPrReviewComments filtered to
  `author == "github-actions[bot]"` → extract existing inline markers → for each inlineable finding
  compute marker; present → `skippedDuplicate++`, else build `PRInlineCommentInput`; if any →
  `createPrReview` (one batched review); on exception capture `str(exc)` into `apiError` preserving
  counts. **Stdout**: `{posted, skippedDuplicate, fallbackOnly, fallbackOnly:[{finding,reason}],
  apiError:string|null}` (envelope shape is roaster-internal — redesign freely; consumer is
  format-findings-comment's `--inline-result-file`).
- **`format-findings-comment`** (`format_findings_comment.py`): `--inline-result-file PATH?`
  (accepts bare or `{data:…}`-wrapped), `--review-name` (default `"unknown"`), `--base-ref` (default
  `"unknown"`); **findings run-envelope on stdin**. Renders `render_findings_comment` → **markdown
  body to stdout**. Parse error → stderr + exit 1.
- **`post-findings-comment`** (`post_findings_comment.py`): `--pr-number INT`, `--run-url?`;
  **markdown body on stdin**. Require first line be a `<!-- roaster:… -->` marker (else stderr + exit
  1). `findPrDiscussionCommentByMarker(pr, marker, "github-actions[bot]")` (bot-author guard prevents
  a human-planted marker from hijacking the slot). `preserve_activity_log`. No existing →
  `addPrDiscussionComment`; else `updatePrDiscussionComment(id, body)`. Status line to **stderr**
  only.

The CI pipeline wiring (exact commands/order/piping) is in `05-…§CI`.

## Must-match vs free

**Must match:** the 5 gateway ops' GitHub semantics (batched review; nullable patch; bot-author
filter & guard; find-by-marker is client-side); `commentableRightSideLines` algorithm exactly; the
exec commands' stdin/stdout/exit contract that CI depends on; first-line-marker requirement.
**Free:** marker formats + digest algorithm (internal consistency only); the inline-result envelope
shape; aggregate-comment wording/markdown; failure-type names; reduce gateway output types to only
the fields consumed.
</content>
