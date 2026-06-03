---
name: internal-code-gh
description: "Use when working with the GitHub CLI (gh): pull requests, issues, releases, repos, automation, or GitHub REST/GraphQL API access. Routes to detailed gh command and API references."
metadata:
  internal: true
---

# GitHub CLI (gh)

Router for `gh` work (PRs, issues, repos, releases, API). Load the reference
that matches the task, then act. Mental model, command syntax, and examples
live in the references, not here.

## References

Load on demand; navigate the big files with the grep patterns shown.

| File                                       | Load when                                                                                                                       | Navigate with                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `references/gh.md` (~1480)                 | any standard task: PRs, issues, repos, releases, auth/config, output formatting, git/CI integration, scripting, troubleshooting | `gh pr` · `gh issue` · `gh repo` · `gh api` · `gh release` · `Pattern [0-9]:` · `Authentication` |
| `references/graphql.md` (~1000)            | porcelain can't do it: Projects V2, Discussions, batch/multi-repo, deep nesting, advanced search                                | `Projects V2` · `Discussion` · `Batch` · `Pagination` · `Example [0-9]`                          |
| `references/graphql-schema-core.md` (~500) | exact GraphQL field/type/mutation shapes                                                                                        | type name (`PullRequest`, `ProjectV2`, …)                                                        |
| `references/api-backend-audit.md` (~850)   | rate-limit issues; REST vs GraphQL choice; per-command backend map                                                              | command name · `Rate Limit`                                                                      |

## Always-on facts

- For standard `gh` questions, load `references/gh.md` before answering from memory.
- Use GraphQL only when porcelain (`gh pr`, `gh issue`, …) can't express the task; Projects V2 and Discussions have no porcelain or REST path — see `references/graphql.md`.
- Rate limits differ by backend: REST 5,000 req/hr · GraphQL 5,000 points/hr · Search 30 req/min. Check `gh api rate_limit --jq '.resources'`; details in `references/api-backend-audit.md`.
