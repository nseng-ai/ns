# REST-First GitHub API Reference

## Decision Tree: REST vs GraphQL

```
Need to call the GitHub API?
│
├─ Is it a Projects V2 operation?           → GraphQL (no REST exists)
├─ Is it a Discussions operation?            → GraphQL (no REST exists)
├─ Is it review thread resolve/unresolve?    → GraphQL (no REST exists)
├─ Is it review thread reply?                → GraphQL (no REST exists)
├─ Do you need data from multiple repos
│  in a single call?                         → GraphQL (batch aliases)
│
└─ Everything else                           → REST
```

**Rule of thumb**: if the endpoint path starts with `repos/{owner}/{repo}/`, there is almost certainly a REST endpoint for it. Check the tables below.

---

## `gh api` Mechanics

### REST Calls

```bash
# GET (default method)
gh api repos/{owner}/{repo}/pulls

# POST
gh api repos/{owner}/{repo}/issues -f title="Bug" -f body="Description"
# or explicit method:
gh api --method POST repos/{owner}/{repo}/issues -f title="Bug" -f body="Description"

# PATCH
gh api -X PATCH repos/{owner}/{repo}/pulls/42 -f title="New title"

# PUT
gh api -X PUT repos/{owner}/{repo}/pulls/42/merge -f merge_method="squash"

# DELETE
gh api -X DELETE repos/{owner}/{repo}/labels/stale
```

### Placeholders

`{owner}` and `{repo}` are auto-filled from the current git remote:

```bash
gh api repos/{owner}/{repo}/pulls    # resolves to repos/myorg/myrepo/pulls
```

### Pagination

```bash
# Fetch all pages (arrays are concatenated)
gh api --paginate repos/{owner}/{repo}/issues

# Paginated output is multiple JSON arrays back-to-back — not valid JSON as a
# whole. When parsing in code, decode each array and flatten. See the
# _load_paginated_array_output pattern.
```

### Filtering with `--jq`

```bash
# Extract specific fields
gh api repos/{owner}/{repo}/pulls --jq '.[].number'

# Filter results
gh api repos/{owner}/{repo}/pulls --jq '[.[] | select(.draft == false)]'

# Complex extraction
gh api repos/{owner}/{repo}/pulls/42/reviews --jq '[.[] | {author: .user.login, state: .state}]'
```

### Caching

```bash
# Cache for 1 hour (useful for repo metadata, labels, etc.)
gh api repos/{owner}/{repo} --cache 3600s
```

### Response Headers

```bash
# Include response headers (useful for debugging rate limits, pagination)
gh api repos/{owner}/{repo} -i
```

### Request Body from File

```bash
gh api repos/{owner}/{repo}/issues --input issue.json
```

### Custom Headers

```bash
gh api repos/{owner}/{repo}/issues/comments/123/reactions \
  -H "Accept: application/vnd.github+json"
```

### GraphQL Calls

Only use for operations listed in the [GraphQL-Only Operations](#graphql-only-operations) section.

```bash
# Basic query
gh api graphql -f query='
query {
  viewer { login }
}'

# With variables — use -F for typed values (int, bool), -f for strings
gh api graphql -F owner='{owner}' -F name='{repo}' -F number=42 -f query='
query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      title
      state
    }
  }
}'

# Paginated GraphQL (requires pageInfo in the query)
gh api graphql --paginate -f query='
query($endCursor: String) {
  viewer {
    repositories(first: 100, after: $endCursor) {
      nodes { nameWithOwner }
      pageInfo { hasNextPage endCursor }
    }
  }
}'
```

### Error Handling

```bash
# Check exit code — non-zero on HTTP errors
gh api repos/{owner}/{repo}/pulls/99999
# exit code 1, stderr shows "HTTP 404"

# Rate limit errors return 403 or 429 — implement exponential backoff
# Check remaining quota:
gh api rate_limit --jq '.resources.core'
```

---

## REST Endpoint Reference by Domain

### PRs

All PR operations that `gh pr` does via GraphQL have REST equivalents.

| Operation | Method | Endpoint | Notes |
|-----------|--------|----------|-------|
| List PRs | GET | `repos/{o}/{r}/pulls` | `?state=open&per_page=100` |
| Get PR | GET | `repos/{o}/{r}/pulls/{n}` | Full PR detail |
| Create PR | POST | `repos/{o}/{r}/pulls` | `-f title=... -f head=... -f base=...` |
| Update PR | PATCH | `repos/{o}/{r}/pulls/{n}` | title, body, state, base |
| Merge PR | PUT | `repos/{o}/{r}/pulls/{n}/merge` | `-f merge_method=squash` |
| List reviews | GET | `repos/{o}/{r}/pulls/{n}/reviews` | Use `--paginate` |
| Get single review | GET | `repos/{o}/{r}/pulls/{n}/reviews/{id}` | |
| Submit review | POST | `repos/{o}/{r}/pulls/{n}/reviews` | `-f event=APPROVE` |
| List review comments | GET | `repos/{o}/{r}/pulls/{n}/comments` | Inline/diff comments |
| Get PR diff | GET | `repos/{o}/{r}/pulls/{n}` | `-H "Accept: application/vnd.github.diff"` |
| List commits on PR | GET | `repos/{o}/{r}/pulls/{n}/commits` | |
| List changed files | GET | `repos/{o}/{r}/pulls/{n}/files` | |
| List requested reviewers | GET | `repos/{o}/{r}/pulls/{n}/requested_reviewers` | |
| Request reviewers | POST | `repos/{o}/{r}/pulls/{n}/requested_reviewers` | `-f reviewers=["user1"]` |
| Check if merged | GET | `repos/{o}/{r}/pulls/{n}/merge` | 204 = merged, 404 = not |
| Update PR branch | PUT | `repos/{o}/{r}/pulls/{n}/update-branch` | |

**Examples:**

```bash
# List open PRs
gh api repos/{owner}/{repo}/pulls --jq '.[].number'

# Create a PR
gh api --method POST repos/{owner}/{repo}/pulls \
  -f title="Add feature" \
  -f head="feature-branch" \
  -f base="main" \
  -f body="Description here"

# Merge a PR with squash
gh api -X PUT repos/{owner}/{repo}/pulls/42/merge \
  -f merge_method="squash"

# List reviews (paginated)
gh api --paginate repos/{owner}/{repo}/pulls/42/reviews \
  --jq '[.[] | select(.state != "PENDING") | {author: .user.login, state: .state}]'

# Get changed files
gh api repos/{owner}/{repo}/pulls/42/files --jq '.[].filename'
```

### Issues

All issue operations that `gh issue` does via GraphQL have REST equivalents.

| Operation | Method | Endpoint | Notes |
|-----------|--------|----------|-------|
| List issues | GET | `repos/{o}/{r}/issues` | `?state=open&labels=bug&per_page=100` |
| Get issue | GET | `repos/{o}/{r}/issues/{n}` | |
| Create issue | POST | `repos/{o}/{r}/issues` | `-f title=... -f body=...` |
| Update issue | PATCH | `repos/{o}/{r}/issues/{n}` | title, body, state, labels, assignees |
| Lock issue | PUT | `repos/{o}/{r}/issues/{n}/lock` | |
| Unlock issue | DELETE | `repos/{o}/{r}/issues/{n}/lock` | |
| List comments | GET | `repos/{o}/{r}/issues/{n}/comments` | Use `--paginate` |
| Add comment | POST | `repos/{o}/{r}/issues/{n}/comments` | `-f body=...` |
| Update comment | PATCH | `repos/{o}/{r}/issues/comments/{id}` | |
| Delete comment | DELETE | `repos/{o}/{r}/issues/comments/{id}` | |
| List labels on issue | GET | `repos/{o}/{r}/issues/{n}/labels` | |
| Add labels | POST | `repos/{o}/{r}/issues/{n}/labels` | `-f labels=["bug","urgent"]` |
| Remove label | DELETE | `repos/{o}/{r}/issues/{n}/labels/{name}` | |
| Set labels | PUT | `repos/{o}/{r}/issues/{n}/labels` | Replaces all |
| List assignees | GET | `repos/{o}/{r}/issues/{n}/assignees` | |
| Add assignees | POST | `repos/{o}/{r}/issues/{n}/assignees` | |
| Remove assignees | DELETE | `repos/{o}/{r}/issues/{n}/assignees` | |
| List reactions | GET | `repos/{o}/{r}/issues/{n}/reactions` | |
| Add reaction | POST | `repos/{o}/{r}/issues/{n}/reactions` | `-f content="+1"` |
| List comment reactions | GET | `repos/{o}/{r}/issues/comments/{id}/reactions` | |
| Add comment reaction | POST | `repos/{o}/{r}/issues/comments/{id}/reactions` | `-f content="+1"` |
| List timeline | GET | `repos/{o}/{r}/issues/{n}/timeline` | Events, references, etc. |

**Note**: The issues API also covers PRs for comments, labels, and reactions — PRs are issues. Use `repos/{o}/{r}/issues/{pr_number}/comments` to get PR discussion comments (not inline review comments).

**Examples:**

```bash
# Create issue with labels
gh api --method POST repos/{owner}/{repo}/issues \
  -f title="Bug report" \
  -f body="Steps to reproduce..." \
  -f labels='["bug","triage"]'

# Add a comment
gh api --method POST repos/{owner}/{repo}/issues/42/comments \
  -f body="Fixed in PR #43"

# Add a reaction to a comment
gh api --method POST repos/{owner}/{repo}/issues/comments/123456/reactions \
  -H "Accept: application/vnd.github+json" \
  -f content="+1"

# List issues with label filter
gh api "repos/{owner}/{repo}/issues?state=open&labels=twerk-objective&per_page=100" \
  --jq '.[].number'
```

### Repositories

| Operation | Method | Endpoint | Notes |
|-----------|--------|----------|-------|
| Get repo | GET | `repos/{o}/{r}` | |
| Update repo | PATCH | `repos/{o}/{r}` | description, homepage, etc. |
| List repo topics | GET | `repos/{o}/{r}/topics` | |
| Set repo topics | PUT | `repos/{o}/{r}/topics` | |
| Get README | GET | `repos/{o}/{r}/readme` | |
| Get file contents | GET | `repos/{o}/{r}/contents/{path}` | Base64 encoded |
| Create/update file | PUT | `repos/{o}/{r}/contents/{path}` | Requires SHA for update |
| Delete file | DELETE | `repos/{o}/{r}/contents/{path}` | |
| List contributors | GET | `repos/{o}/{r}/contributors` | |
| List branches | GET | `repos/{o}/{r}/branches` | |
| Get branch | GET | `repos/{o}/{r}/branches/{branch}` | |
| List tags | GET | `repos/{o}/{r}/tags` | |
| List commits | GET | `repos/{o}/{r}/commits` | `?sha=branch&per_page=100` |
| Get commit | GET | `repos/{o}/{r}/commits/{sha}` | |
| Compare commits | GET | `repos/{o}/{r}/compare/{base}...{head}` | |
| Deploy keys | GET/POST/DELETE | `repos/{o}/{r}/keys[/{id}]` | |
| Autolinks | GET/POST/DELETE | `repos/{o}/{r}/autolinks[/{id}]` | |

### Releases

Fully covered by REST. `gh release create` already uses REST internally.

| Operation | Method | Endpoint | Notes |
|-----------|--------|----------|-------|
| List releases | GET | `repos/{o}/{r}/releases` | |
| Get release | GET | `repos/{o}/{r}/releases/{id}` | |
| Get by tag | GET | `repos/{o}/{r}/releases/tags/{tag}` | |
| Get latest | GET | `repos/{o}/{r}/releases/latest` | |
| Create release | POST | `repos/{o}/{r}/releases` | |
| Update release | PATCH | `repos/{o}/{r}/releases/{id}` | |
| Delete release | DELETE | `repos/{o}/{r}/releases/{id}` | |
| Upload asset | POST | `uploads.github.com/repos/{o}/{r}/releases/{id}/assets` | |
| Download asset | GET | `repos/{o}/{r}/releases/assets/{id}` | |

### Workflow Runs & Workflows

All REST. No GraphQL needed.

| Operation | Method | Endpoint | Notes |
|-----------|--------|----------|-------|
| List runs | GET | `repos/{o}/{r}/actions/runs` | `?status=failure` |
| Get run | GET | `repos/{o}/{r}/actions/runs/{id}` | |
| Re-run | POST | `repos/{o}/{r}/actions/runs/{id}/rerun` | |
| Re-run failed | POST | `repos/{o}/{r}/actions/runs/{id}/rerun-failed-jobs` | |
| Cancel run | POST | `repos/{o}/{r}/actions/runs/{id}/cancel` | |
| Delete run | DELETE | `repos/{o}/{r}/actions/runs/{id}` | |
| Download logs | GET | `repos/{o}/{r}/actions/runs/{id}/logs` | |
| List artifacts | GET | `repos/{o}/{r}/actions/runs/{id}/artifacts` | |
| List workflows | GET | `repos/{o}/{r}/actions/workflows` | |
| Get workflow | GET | `repos/{o}/{r}/actions/workflows/{id}` | |
| Trigger workflow | POST | `repos/{o}/{r}/actions/workflows/{id}/dispatches` | |
| Enable workflow | PUT | `repos/{o}/{r}/actions/workflows/{id}/enable` | |
| Disable workflow | PUT | `repos/{o}/{r}/actions/workflows/{id}/disable` | |

### Search

All REST. Separate rate limit: 30 requests/minute.

| Operation | Method | Endpoint | Notes |
|-----------|--------|----------|-------|
| Search issues/PRs | GET | `search/issues` | `?q=repo:{o}/{r}+is:open+is:issue` |
| Search repos | GET | `search/repositories` | |
| Search commits | GET | `search/commits` | |
| Search code | GET | `search/code` | Requires repo scope |

**Examples:**

```bash
# Search open issues with label
gh api -X GET search/issues \
  -f q='repo:myorg/myrepo is:issue is:open label:bug' \
  --jq '.items[].number'

# Search PRs by author
gh api -X GET search/issues \
  -f q='repo:myorg/myrepo is:pr author:username' \
  --jq '.items[] | {number, title}'
```

### Labels

REST for all CRUD. (`gh label list` uses GraphQL internally, but the REST endpoint works fine.)

| Operation | Method | Endpoint | Notes |
|-----------|--------|----------|-------|
| List labels | GET | `repos/{o}/{r}/labels` | `?per_page=100` |
| Get label | GET | `repos/{o}/{r}/labels/{name}` | URL-encode name |
| Create label | POST | `repos/{o}/{r}/labels` | `-f name=... -f color=...` |
| Update label | PATCH | `repos/{o}/{r}/labels/{name}` | |
| Delete label | DELETE | `repos/{o}/{r}/labels/{name}` | |

### Secrets & Variables

All REST.

| Operation | Method | Endpoint |
|-----------|--------|----------|
| List secrets | GET | `repos/{o}/{r}/actions/secrets` |
| Get secret | GET | `repos/{o}/{r}/actions/secrets/{name}` |
| Set secret | PUT | `repos/{o}/{r}/actions/secrets/{name}` |
| Delete secret | DELETE | `repos/{o}/{r}/actions/secrets/{name}` |
| List variables | GET | `repos/{o}/{r}/actions/variables` |
| Get variable | GET | `repos/{o}/{r}/actions/variables/{name}` |
| Set variable | POST/PATCH | `repos/{o}/{r}/actions/variables[/{name}]` |
| Delete variable | DELETE | `repos/{o}/{r}/actions/variables/{name}` |

### Actions Cache

All REST.

| Operation | Method | Endpoint |
|-----------|--------|----------|
| List caches | GET | `repos/{o}/{r}/actions/caches` |
| Delete cache | DELETE | `repos/{o}/{r}/actions/caches/{id}` |
| Delete by key | DELETE | `repos/{o}/{r}/actions/caches?key={key}` |

### Gists

All REST.

| Operation | Method | Endpoint |
|-----------|--------|----------|
| List gists | GET | `gists` |
| Get gist | GET | `gists/{id}` |
| Create gist | POST | `gists` |
| Update gist | PATCH | `gists/{id}` |
| Delete gist | DELETE | `gists/{id}` |

### Notifications

| Operation | Method | Endpoint |
|-----------|--------|----------|
| List notifications | GET | `notifications` |
| Mark read | PUT | `notifications` |
| Get thread | GET | `notifications/threads/{id}` |
| Mark thread read | PATCH | `notifications/threads/{id}` |

---

## REST Alternatives for `gh` Porcelain Commands

Many `gh` porcelain commands use GraphQL internally. Here are the REST equivalents — use these in gateway code and automation to avoid hidden GraphQL rate limit consumption.

| Porcelain command | GraphQL internally | REST equivalent |
|---|---|---|
| `gh issue create` | `CreateIssue` mutation | `POST repos/{o}/{r}/issues` |
| `gh issue list` | `IssueList` query | `GET repos/{o}/{r}/issues` or `search/issues` |
| `gh issue view` | `Issue` query | `GET repos/{o}/{r}/issues/{n}` |
| `gh issue edit` | `UpdateIssue` mutation | `PATCH repos/{o}/{r}/issues/{n}` |
| `gh issue close` | `CloseIssue` mutation | `PATCH repos/{o}/{r}/issues/{n} -f state=closed` |
| `gh issue comment` | `AddComment` mutation | `POST repos/{o}/{r}/issues/{n}/comments` |
| `gh pr create` | `PullRequestCreate` mutation | `POST repos/{o}/{r}/pulls` |
| `gh pr list` | `PullRequestList` query | `GET repos/{o}/{r}/pulls` or `search/issues?q=is:pr` |
| `gh pr view` | `PullRequest` query | `GET repos/{o}/{r}/pulls/{n}` |
| `gh pr edit` | `PullRequestUpdate` mutation | `PATCH repos/{o}/{r}/pulls/{n}` |
| `gh pr close` | `ClosePullRequest` mutation | `PATCH repos/{o}/{r}/pulls/{n} -f state=closed` |
| `gh pr merge` | `MergePullRequest` mutation | `PUT repos/{o}/{r}/pulls/{n}/merge` |
| `gh pr comment` | `AddComment` mutation | `POST repos/{o}/{r}/issues/{n}/comments` |
| `gh pr review` | `AddPullRequestReview` mutation | `POST repos/{o}/{r}/pulls/{n}/reviews` |
| `gh pr diff` | REST internally | `GET repos/{o}/{r}/pulls/{n}` + diff Accept header |
| `gh pr checks` | `StatusCheckRollup` query | `GET repos/{o}/{r}/commits/{sha}/check-runs` |
| `gh release create` | REST internally | `POST repos/{o}/{r}/releases` |
| `gh release list` | GraphQL `RepositoryReleaseList` | `GET repos/{o}/{r}/releases` |
| `gh label list` | GraphQL `LabelList` | `GET repos/{o}/{r}/labels` |

---

## GraphQL-Only Operations

These operations have **no REST equivalent**. Use GraphQL for these and only these.

### Projects V2

Projects V2 has no REST API at all. Every operation requires GraphQL.

```bash
# List project fields and their IDs
gh api graphql -f query='
  query($org: String!, $number: Int!) {
    organization(login: $org) {
      projectV2(number: $number) {
        id
        fields(first: 20) {
          nodes {
            ... on ProjectV2Field { id name }
            ... on ProjectV2SingleSelectField {
              id name
              options { id name }
            }
          }
        }
      }
    }
  }
' -f org=myorg -F number=1

# Add issue to project
gh api graphql -f query='
  mutation($projectId: ID!, $contentId: ID!) {
    addProjectV2ItemById(input: {projectId: $projectId, contentId: $contentId}) {
      item { id }
    }
  }
' -f projectId=PVT_xxx -f contentId=I_xxx

# Update field value (e.g., Status)
gh api graphql -f query='
  mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
    updateProjectV2ItemFieldValue(input: {
      projectId: $projectId
      itemId: $itemId
      fieldId: $fieldId
      value: { singleSelectOptionId: $optionId }
    }) {
      projectV2Item { id }
    }
  }
' -f projectId=PVT_xxx -f itemId=PVTI_xxx -f fieldId=PVTSSF_xxx -f optionId=option_id
```

### Discussions

Discussions API has no REST API and no `gh` porcelain commands.

```bash
# Create a discussion
gh api graphql -H 'GraphQL-Features: discussions_api' -f query='
  mutation($repoId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
    createDiscussion(input: {
      repositoryId: $repoId
      categoryId: $categoryId
      title: $title
      body: $body
    }) {
      discussion { id url number }
    }
  }
' -F repoId=$REPO_ID -F categoryId=$CATEGORY_ID \
  -f title="Release v2.0" -f body="What's new..."

# List discussion categories
gh api graphql -f query='
  query($owner: String!, $repo: String!) {
    repository(owner: $owner, name: $repo) {
      discussionCategories(first: 25) {
        nodes { id name description }
      }
    }
  }
' -f owner=myorg -f repo=myrepo
```

### Review Thread Resolution and Reply

These mutations have no REST equivalent. The REST API can list review comments but cannot resolve/unresolve threads or reply within a thread.

```bash
# Resolve a review thread
gh api graphql -F threadId="PRT_xxx" -f query='
  mutation($threadId: ID!) {
    resolveReviewThread(input: {threadId: $threadId}) {
      thread { id isResolved }
    }
  }
'

# Unresolve a review thread
gh api graphql -F threadId="PRT_xxx" -f query='
  mutation($threadId: ID!) {
    unresolveReviewThread(input: {threadId: $threadId}) {
      thread { id isResolved }
    }
  }
'

# Reply to a review thread
gh api graphql -F threadId="PRT_xxx" -f body="Fixed in latest commit" -f query='
  mutation($threadId: ID!, $body: String!) {
    addPullRequestReviewThreadReply(
      input: {pullRequestReviewThreadId: $threadId, body: $body}
    ) {
      comment { databaseId body author { login } }
    }
  }
'
```

### Fetching Review Threads (Structured)

The REST endpoint `GET repos/{o}/{r}/pulls/{n}/comments` returns a flat list of review comments. To get the **threaded structure** (which comments belong to which thread, resolution status, outdated status), you need GraphQL:

```bash
gh api graphql -F owner='{owner}' -F repo='{repo}' -F number=42 -f query='
  query($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        reviewThreads(first: 100) {
          nodes {
            id
            isResolved
            isOutdated
            path
            line
            comments(first: 20) {
              nodes {
                databaseId
                body
                author { login }
                path
                line: originalLine
                createdAt
              }
            }
          }
        }
      }
    }
  }
'
```

### Batch Queries Across Repos

Query multiple repositories in a single API call using GraphQL aliases:

```bash
gh api graphql -f query='
  {
    repo1: repository(owner: "org", name: "repo-a") {
      name
      pullRequests(states: OPEN, first: 5) {
        totalCount
      }
    }
    repo2: repository(owner: "org", name: "repo-b") {
      name
      pullRequests(states: OPEN, first: 5) {
        totalCount
      }
    }
  }
'
```

This is one API call instead of two, saving rate limit quota.

---

## Rate Limit Comparison

| Aspect | REST | GraphQL |
|--------|------|---------|
| Quota | 5,000 requests/hour | 5,000 points/hour |
| Counting | 1 request = 1 unit | Cost varies by query complexity |
| Predictability | Highly predictable | Depends on query structure |
| Pagination | Each page = 1 request | Deep pagination = higher cost |
| Search | 30 requests/minute (separate) | N/A (use REST search) |
| Conditional requests | 304 doesn't count | Not supported |

### Check Your Rate Limits

```bash
# REST rate limit
gh api rate_limit --jq '.resources.core'

# GraphQL rate limit
gh api graphql -f query='{ rateLimit { cost remaining resetAt } }'

# Search rate limit
gh api rate_limit --jq '.resources.search'
```

### Optimization Strategies

1. **Use REST by default** — predictable, 1:1 request-to-cost ratio
2. **Use `--cache`** for read-heavy operations: `gh api repos/{o}/{r} --cache 3600s`
3. **Use `--jq`** to extract only what you need (reduces data but not API cost)
4. **Use `--paginate` with `--jq`** to filter during pagination
5. **Batch with GraphQL aliases** only when you genuinely need cross-repo data in one call
6. **Avoid `gh pr view`/`gh issue view` in loops** — each is a GraphQL call with nested data cost. Use `gh api repos/{o}/{r}/pulls/{n}` (REST) instead.
7. **Conditional requests**: REST returns `ETag` headers; `gh api` sends `If-None-Match` automatically — 304 responses don't count against the limit
