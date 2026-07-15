# Graphite-Aware Source Publication Staged

## Summary

Local `ns dispatch prompt` now treats exact source reachability as an explicit publication phase before anchor availability or mutation. An exact remote SHA skips publication entirely. A stale or missing source is classified through Flow's read-only structured Graphite plan: definitive untracked state uses an exact-SHA, non-force Git push; tracked state previews current plus non-trunk downstack branches and requires TTY confirmation or non-interactive dispatch `--force/-f` before Flow minimal submit. Dispatch authorization is always translated to Flow `force: false`.

After publication, dispatch re-resolves repository, branch, HEAD, and dirty state, reruns configuration/identity preflight, and verifies the remote tip. Only a Graphite submit may provide a rewritten SHA, and that refreshed SHA becomes the sole anchor/PR/run/result revision. Planning, execution, and post-publication failures create no anchor or Workflow run and carry conservative local/remote mutation evidence.

## Objective Impact

This advances only the local source-publication portion of the open prompt steel thread. Anchor timestamp construction and remote-name availability now occur after verified publication; semantic slug derivation remains an earlier read-only operation. The Vercel capability consumes the curated `@nseng-ai/flow/api` minimal-submit client at local command composition and does not import Graphite packages, invoke `gt`, or carry Flow into Workflow/Sandbox paths.

Fake-driven Flow/Vercel tests and local validation are implementation evidence only. No Vercel deployment, real submit/push/PR mutation, Workflow trigger, or billable dispatch was performed, so the controlled Pi rerun and all live steel-thread gates remain open.

## Follow-Ups

- Run the already-required controlled Pi steel-thread rerun only through separately authorized live work and record claims from the witnessing operator.
- Keep plan/handoff dispatch, setup-skill work, and unrelated thermo remediation on their existing roadmap rows.
- Preserve exact-SHA and post-publication revalidation semantics when the future dispatch commands reuse the local client.
