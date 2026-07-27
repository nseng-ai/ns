# Objective family subpath install command confirmed

## Summary

Confirmed from the upstream `vercel-labs/skills` implementation that a GitHub shorthand source may include a repository subpath, discovery is scoped to that subpath, and `--skill '*'` selects every skill discovered there. The concise tutorial acquisition command for the seven portable Objective skills is therefore:

```bash
npx skills add nseng-ai/ns/skills/incubating/objectives \
  --skill '*' \
  --agent codex claude-code -y
```

The source parser maps the suffix after `owner/repo/` to `subpath`; the add workflow passes that subpath into discovery; and the wildcard branch selects the complete scoped result. No tag or family selector is needed, and `--full-depth` is unnecessary for the direct children of the selected Objective family directory.

## Objective Impact

This resolves the acquisition-command shape and narrows the portable-family assumption: the family directory itself is the installation grouping boundary while installed skill identities remain flat. The Objective narrative and active roadmap row now carry the exact tutorial command and distinguish source-level code confirmation from the still-open checkout-independent end-to-end execution proof.

## Follow-Ups

- Run the documented one-liner in a checkout-independent fixture against the accessible repository source and verify exactly the seven portable Objective identities are installed.
- Put the same command in the appropriate user-facing tutorial or package README when that documentation slice is authored.
- Preserve family-subpath scoping in later acquisition and reverse-removal smoke scenarios.
