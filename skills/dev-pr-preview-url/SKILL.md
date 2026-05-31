---
name: dev-pr-preview-url
description: "Get the latest Vercel preview deployment URL for the current branch using the repo-local asdl-dev CLI."
allowed-tools:
  - "Bash(bun run --cwd ts asdl-dev latest-branch-deployment*)"
metadata:
  internal: true
---

# dev-pr-preview-url

Run the repo-local dev CLI:

```bash
bun run --cwd ts asdl-dev latest-branch-deployment --json
```

Report the `preview_url`, `deployment_url`, and `dashboard_url` from the JSON result. If `success` is
false, summarize `error.message` and do not try GitHub or Graphite fallbacks.

This skill is only a routing shim; Vercel selection logic lives in the TypeScript `asdl-dev` CLI.
