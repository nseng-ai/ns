# Make `objective list` issue numbers clickable

## Context

When running `twerk objective list`, the issue numbers (`#82`, `#40`, …) render as plain
text. In modern terminals that support OSC 8 hyperlinks (iTerm2, WezTerm, Kitty, Ghostty,
VS Code integrated terminal, …) we can make those numbers clickable links to the GitHub
issue, so the user can jump straight from the list to the issue page.

The renderer already uses Rich 13+, which supports OSC 8 hyperlinks via the
`[link=URL]text[/link]` markup. The missing piece is the URL itself: the `Issue`
dataclass currently carries `number, title, state, updated_at` but no URL. `gh issue
list --json` supports a `url` field, so we can pull it at the data-fetch boundary
(gateway) and hand it to the renderer — rather than doing a separate `gh repo view`
call from the renderer to reconstruct the URL.

## Approach

1. **Add `url: str` to `Issue`** (`packages/twerk-core/src/twerk_core/gh/types.py`).
   GitHub always returns a URL for every issue, so the field is required (no `| None`).

2. **Populate `url` in `RealIssueGateway.list()`**
   (`packages/twerk-core/src/twerk_core/gh/real_issue_gateway.py:137-162`):
   - Add `"url"` to the `--json` field list (line 145).
   - Add `url=item["url"]` to the `Issue(...)` construction (lines 155-160).

3. **Render the issue number as a Rich link** in the objective list renderer
   (`packages/twerk-objectives/src/twerk_objectives/cli/objective/list.py:54-59`):
   ```python
   table.add_row(
       f"[link={obj.url}]#{obj.number}[/link]",
       state_badge(obj.state),
       obj.title,
       format_relative_time(obj.updated_at),
   )
   ```
   Rich composes the column's `style="bold cyan"` with the link markup, so the cell
   stays bold cyan and is also a hyperlink. Terminals that don't support OSC 8 simply
   render the text without a link — no degradation.

4. **Expose `url` in JSON output**
   (`packages/twerk-objectives/src/twerk_objectives/cli/objective/list.py:27-39`):
   Add `"url": i.url` to `ObjectiveListResult.to_json_dict()`. Useful for JSON consumers
   and keeps the human and JSON renderings aligned on the same data.

5. **Update fixtures that construct `Issue(...)` directly** — add a `url=` kwarg
   everywhere:
   - `packages/twerk-core/tests/unit/test_gh_types.py` (lines 99-115, two sites)
   - `packages/twerk-core/tests/gateways/test_fake_issue_gateway.py` (`_make_issue`
     helper, lines 7-13 — one update covers all four test functions)
   - `packages/twerk-objectives/tests/scenario/test_objective_cli.py`:
     - `SAMPLE_ISSUES` tuple (lines 25-44, three issues)
     - `test_objective_list_long_title_ellipsizes` (lines 159-168, one issue)
     - `test_objective_json_list_default_shows_open_objectives_only` expected JSON
       (lines 260-281) — add the new `"url"` key to each expected dict.

   `FakeIssueGateway` (`packages/twerk-core/src/twerk_core/gh/testing.py`) does not
   construct `Issue` itself — it just stores what tests pass in — so no gateway change
   is needed.

## Design notes

- **Why `url` on the dataclass, not reconstructed in the renderer?** The renderer's job
  is to render a result, not to do I/O. Calling `gh repo view` from the renderer to
  reconstruct `https://github.com/{owner}/{repo}/issues/{n}` would couple rendering to
  subprocess calls, be slower, and duplicate data that `gh issue list --json url`
  already returns authoritatively.
- **Why required, not `str | None`?** Every GitHub issue has a URL. Making the field
  optional would force every consumer to handle a case that can't happen.
- **Terminal compatibility.** Rich's `[link=...]` emits OSC 8 escape sequences.
  Supporting terminals render a clickable link; non-supporting terminals render plain
  text. No feature-detection needed.

## Files to modify

- `packages/twerk-core/src/twerk_core/gh/types.py` — add `url: str` to `Issue`
- `packages/twerk-core/src/twerk_core/gh/real_issue_gateway.py` — request and populate `url`
- `packages/twerk-objectives/src/twerk_objectives/cli/objective/list.py` — Rich link markup + JSON field
- `packages/twerk-core/tests/unit/test_gh_types.py` — add `url` to fixtures
- `packages/twerk-core/tests/gateways/test_fake_issue_gateway.py` — add `url` to `_make_issue`
- `packages/twerk-objectives/tests/scenario/test_objective_cli.py` — update `SAMPLE_ISSUES`, long-title test, and JSON-list expected payload

## Verification

1. **Type + lint + tests**: `just check` (or `just fast-ci`) from the repo root — all
   green.
2. **Targeted test runs**:
   - `uv run pytest packages/twerk-core/tests/unit/test_gh_types.py`
   - `uv run pytest packages/twerk-core/tests/gateways/test_fake_issue_gateway.py`
   - `uv run pytest packages/twerk-objectives/tests/scenario/test_objective_cli.py`
3. **End-to-end in a real terminal**: run `twerk objective list` in iTerm2 / WezTerm /
   Ghostty / VS Code. The `#82`/`#40`/… cells should be clickable and open the issue in
   the browser. Cmd-click (or Ctrl-click depending on terminal) is the usual gesture.
4. **JSON output**: `twerk objective list --output json` (or whatever the JSON flag
   is) — the `objectives[*]` entries include a `url` field matching
   `https://github.com/<owner>/<repo>/issues/<number>`.
5. **Graceful degradation**: piping the human output (`twerk objective list | cat`)
   should not show raw escape sequences in a way that breaks the table, and in a
   non-hyperlink terminal the `#82` text still reads correctly.
