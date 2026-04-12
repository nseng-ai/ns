---
name: gh-api
description: "REST-first GitHub API reference for `gh api` operations. Use when writing `gh api` calls, building gateway code that shells out to `gh`, choosing between REST and GraphQL endpoints, or optimizing GitHub API rate limit usage. Guides toward REST endpoints over GraphQL, documenting when GraphQL is truly required."
metadata:
  internal: true
---

<!-- PUBLIC SKILL: Do not reference twerk-internal module paths or class names in this file. Describe CLI operations, not implementation. See AGENTS.md § "Public Skill Authoring". -->

# gh-api — REST-first GitHub API Reference

## Core Principle

**Always use REST unless the operation is in the GraphQL-only list.**

REST is simpler, more predictable (per-request rate limiting), better documented, and avoids the hidden GraphQL quota cost of `gh` porcelain commands. GraphQL is required only for: Projects V2, Discussions, review thread resolution/reply, and batch cross-repo queries.

## When to Use This Skill

- Writing `gh api` calls (REST or GraphQL)
- Building gateway code that shells out to `gh`
- Choosing between REST and GraphQL for a GitHub operation
- Optimizing rate limit usage
- Migrating a GraphQL call to REST

## When NOT to Use This Skill

- For `gh pr`, `gh issue`, `gh repo` porcelain commands → use `skills/gh`
- For workflow patterns (daily PR flow, hotfix, etc.) → use `skills/gh`
- For authentication or configuration → use `skills/gh`
- For CI/CD integration → use `skills/gh`

## Using the Reference Documentation

Always load the main reference:

```
references/rest-first-api.md
```

This contains:

1. **Decision tree**: REST vs GraphQL — when to use which
2. **`gh api` mechanics**: flags, pagination, `--jq`, `--cache`, error handling
3. **REST endpoint reference by domain**: PRs, issues, repos, releases, runs, search, labels, secrets, comments, reactions
4. **REST alternatives for `gh` porcelain**: what `gh pr`/`gh issue` do via GraphQL that you can do via REST
5. **GraphQL-only operations**: Projects V2, Discussions, review thread mutations, batch queries
6. **Rate limit comparison and optimization**

**For GraphQL-only operations that need schema detail**, cross-reference:

```
skills/gh/references/graphql-schema-core.md
```

## Loading Strategy

- Load `references/rest-first-api.md` for all API guidance
- Use grep to find specific sections: `## PRs`, `## Issues`, `## GraphQL-Only`, `## Rate Limits`
- Only load `graphql-schema-core.md` when you need field-level schema detail for a GraphQL-only operation
