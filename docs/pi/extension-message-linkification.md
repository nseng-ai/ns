# Pi Extension Message Linkification

Use this when a Pi extension should render clickable PRs, issues, or URLs in chat output.

## Recommended pattern

Keep the visible message text plain, and carry link targets in structured message details.

```ts
pi.sendMessage({
  customType: "my-command-stream",
  content: "✓ Landed 1 PR: #522 my-branch.",
  display: true,
  details: {
    prLinks: [{ number: 522, url: "https://github.com/org/repo/pull/522" }],
  },
});
```

Then linkify only in the custom message renderer registered with `pi.registerMessageRenderer(...)`.

Why:

- `message.content` stays readable in transcripts, tests, and copied output.
- Link targets are explicit instead of inferred from branch names or repo state.
- Renderers can validate URLs before emitting terminal escape sequences.
- Tests can assert plain content and rendered hyperlink output separately.

## OSC 8 terminal hyperlinks

Most modern terminals support OSC 8 hyperlinks:

```ts
function terminalHyperlink(text: string, url: string): string {
  return `\x1B]8;;${url}\x07${text}\x1B]8;;\x07`;
}
```

If the extension already imports `@earendil-works/pi-tui`, prefer its `hyperlink(text, url)` helper. If avoiding an additional package dependency in a small checked-in extension package, a local helper is fine.

Validate URLs before rendering them:

```ts
function sanitizeTerminalHyperlinkUrl(url: string): string | undefined {
  if (/\p{Cc}/u.test(url)) return undefined;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}
```

## Renderer shape

A typical renderer should:

1. Extract plain text from `message.content`.
2. Parse `message.details` defensively because it is `unknown`.
3. Build a map from reference number to URL.
4. Truncate visible text before inserting OSC sequences if the truncation helper is string-length based.
5. Replace only references with known URLs.

Example:

```ts
function renderLine(line: string, prLinks: Map<number, string>, width: number): string {
  const truncated = truncateDisplayLine(line, width);
  return truncated.replace(/#(\d+)\b/g, (match, numberText: string) => {
    const url = prLinks.get(Number(numberText));
    return url ? terminalHyperlink(match, url) : match;
  });
}
```

## Notifications are separate

`ctx.ui.notify(...)` does not use `registerMessageRenderer`. It renders a normal text notification.

If a final notification also needs clickable text, linkify that notification string separately using the same validated link map. Otherwise, keep notifications plain and rely on the rendered command-stream message for clickable links.

## GitHub PR specifics

When a command already calls:

```bash
gh pr view <branch-or-number> --json number,title,...,url
```

prefer using the returned `url` field instead of reconstructing the PR URL.

For merge flows:

1. Capture the original PR URL from preflight.
2. After `gh pr merge`, verify the PR with another `gh pr view`.
3. Prefer `verified.url ?? original.url`.
4. Store that URL alongside the landed PR number.
5. Build renderer details from the landed PR list.

## Testing checklist

For a linkification change, add or update tests that verify:

- Plain message content remains unchanged, e.g. `✓ Landed 1 PR: #522 branch.`
- `message.details` contains the URL metadata.
- The registered renderer emits the OSC 8 sequence.
- Any notification that includes hyperlinks still compares cleanly after stripping ANSI/OSC.
- `stripAnsi` removes OSC 8 hyperlinks as well as normal color escapes.

Example OSC strip assertion:

```ts
expect(stripAnsi("\u001b]8;;https://example.test\u0007#522\u001b]8;;\u0007")).toBe("#522");
```

## ANSI / OSC stripping gotcha

When stripping terminal escapes, handle OSC sequences before generic single-character ESC sequences.

Good:

```ts
text.replace(/\x1B(?:\][^\x07]*(?:\x07|\x1B\\)|[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
```

Bad: putting the generic `[@-Z\\-_]` alternative first can consume only `ESC ]`, leaving the OSC payload in the string.

## Validation commands

For TypeScript Pi extensions in this repo, use:

```bash
bun run --cwd ts check
bun run --cwd ts test
```

Do not use `dprint check <ts-file>` as the TS package files are not currently matched by the repo dprint config.
