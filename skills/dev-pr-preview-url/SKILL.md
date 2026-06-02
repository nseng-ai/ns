---
name: dev-pr-preview-url
description: "Get the latest Vercel preview URL for the current branch's PR. Use when the user asks for a PR preview URL, latest preview deployment, Vercel preview, docs-site preview, branch deployment URL, or whether the current PR has deployed. Prefer Vercel CLI metadata first so the workflow can work without querying GitHub; use GitHub PR status checks/comments only as fallback."
allowed-tools:
  - "Bash(git branch*)"
  - "Bash(git config*)"
  - "Bash(git remote*)"
  - "Bash(command -v vercel)"
  - "Bash(vercel *)"
  - "Bash(bunx vercel@latest *)"
  - "Bash(jq *)"
  - "Bash(gh pr view *)"
  - "Bash(gh pr list *)"
  - "Bash(gh auth status*)"
metadata:
  internal: true
---

# dev-pr-preview-url

Find the latest Ready Vercel preview deployment associated with the current
branch's PR and report the branch alias, immutable deployment URL, dashboard
URL, and evidence used to choose it.

## Shape of this skill

This is a repo-local developer helper, not a Pi command. The workflow is a
small CLI lookup with a little selection judgment; it does not need runtime
package code unless it becomes a heavily repeated or multi-repo operation.

Prefer querying Vercel directly. Vercel deployment metadata contains the branch
and PR fields needed for GitHub-connected deployments, so the common path does
not need `gh` at all. Use GitHub only when Vercel metadata is unavailable or the
user explicitly asks to compare against PR status checks.

## Defaults

In the `dagster-io/asdl-tools` repo, use:

- Vercel scope/team: `schrockns-projects`
- Vercel project: `asdl-tools`

If the user provides a different scope or project, use that. Outside this repo,
infer the project from the git remote basename when obvious, but ask for the
Vercel scope if the CLI cannot resolve it.

## Direct Vercel workflow

1. Resolve the current branch and stop if detached:

   ```bash
   branch=$(git branch --show-current)
   test -n "$branch"
   ```

2. Choose the Vercel command. Prefer an installed CLI; fall back to Bun's
   one-shot runner without installing anything globally:

   ```bash
   if command -v vercel >/dev/null 2>&1; then
     vercel_cmd=(vercel)
   else
     vercel_cmd=(bunx vercel@latest)
   fi
   ```

3. Query Ready preview deployments whose Vercel GitHub metadata matches the
   branch. For `asdl-tools`, start with these defaults:

   ```bash
   project=${VERCEL_PROJECT:-asdl-tools}
   scope=${VERCEL_SCOPE:-schrockns-projects}

   deployments_json=$("${vercel_cmd[@]}" ls "$project" \
     --scope "$scope" \
     --format=json \
     --status READY \
     --environment preview \
     -m githubCommitRef="$branch")
   ```

   The `githubCommitRef` metadata filter is still a Vercel query; it does not
   call GitHub. It intentionally excludes local dirty/manual deployments that
   only have `gitCommitRef` metadata and are not PR deployments.

4. Select the newest PR-associated deployment. Require `githubPrId` when the
   user asks for the current PR's preview, because branch-only deployments are
   not enough evidence of PR association.

   ```bash
   latest=$(jq -c --arg branch "$branch" '
     .deployments
     | map(select(.state == "READY"))
     | map(select(.meta.githubCommitRef == $branch))
     | map(select(.meta.githubPrId != null))
     | sort_by(.createdAt)
     | reverse
     | first // empty
   ' <<< "$deployments_json")
   ```

   If `latest` is empty, report that no Ready Vercel PR deployment was found
   from Vercel metadata and continue to the fallback section.

5. Inspect the selected deployment to resolve aliases and a deployment id:

   ```bash
   deployment_host=$(jq -r '.url' <<< "$latest")
   inspect_json=$("${vercel_cmd[@]}" inspect "https://$deployment_host" \
     --scope "$scope" \
     --format=json)

   deployment_id=$(jq -r '.id' <<< "$inspect_json")
   immutable_url="https://$(jq -r '.url' <<< "$inspect_json")"
   expected_alias=$(jq -r '.meta.branchAlias // empty' <<< "$latest")
   branch_alias=$(jq -r --arg expected "$expected_alias" '
     if $expected != "" and ((.aliases // []) | index($expected)) then
       $expected
     else
       (.aliases[0] // "")
     end
   ' <<< "$inspect_json")
   if test -n "$branch_alias"; then
     preview_url="https://$branch_alias"
   else
     preview_url="$immutable_url"
   fi
   dashboard_url="https://vercel.com/$scope/$project/${deployment_id#dpl_}"
   ```

6. Report in this order:

   ```text
   Latest PR preview for <branch>:
   - Preview URL: <branch alias if present, else immutable deployment URL>
   - Deployment URL: <immutable deployment URL>
   - Vercel dashboard: <dashboard URL>
   - PR: #<githubPrId from Vercel metadata>
   - Commit: <githubCommitSha from Vercel metadata>
   - Ready/created: <ready or createdAt timestamp from Vercel metadata>
   - Evidence: Vercel CLI direct lookup using githubCommitRef=<branch>
   ```

   If the preview is protected by Vercel SSO, say that browser access may
   require Vercel authentication; do not treat an unauthenticated `curl` 401 as
   a failed deployment.

## GitHub fallback

Use this only when the direct Vercel lookup cannot identify a PR deployment, or
when the user explicitly wants GitHub evidence.

1. Resolve the current branch's PR:

   ```bash
   gh pr view --json number,headRefName,headRefOid,statusCheckRollup
   ```

   For a known PR/repo, include the number and `-R owner/repo`.

2. Find Vercel status checks:

   ```bash
   gh pr view --json number,headRefName,headRefOid,statusCheckRollup \
     --jq '.statusCheckRollup[]
       | select((.name // .context // "") | test("Vercel|vercel"))
       | {name:(.name // .context), state, conclusion, targetUrl, startedAt, completedAt}'
   ```

3. If the Vercel check target URL is a dashboard URL like
   `https://vercel.com/<scope>/<project>/<id-without-dpl-prefix>`, inspect it by
   prefixing the final path segment with `dpl_`:

   ```bash
   dashboard_tail=<final path segment from targetUrl>
   inspect_json=$("${vercel_cmd[@]}" inspect "dpl_$dashboard_tail" \
     --scope "$scope" \
     --format=json)
   ```

   Then report the URLs using the same direct-workflow reporting format, but
   label the evidence as GitHub PR status fallback plus Vercel inspect.

4. If status checks do not expose a usable deployment, inspect PR comments as a
   last resort:

   ```bash
   gh pr view --comments --json comments
   ```

   Look for a recent Vercel bot comment with a preview/deployment URL. Prefer a
   comment that names the current branch, PR, or head SHA. Verify any found URL
   with `vercel inspect <url> --scope <scope> --format=json` before reporting it
   as latest. If you cannot establish that the comment matches the current
   branch/PR/head, label it as a candidate rather than the latest preview.

## Failure modes

- Missing Vercel CLI: use `bunx vercel@latest ...`.
- Vercel auth failure: report the auth issue and only use GitHub fallback if
  `gh auth status` is already healthy or the user asks for it.
- No `githubPrId` in Vercel metadata: say that Vercel found branch deployments
  but not PR-associated deployments; do not pretend branch-only metadata proves
  PR association.
- Multiple matching Ready deployments: choose the highest `createdAt` after
  filtering to the branch and PR metadata.
