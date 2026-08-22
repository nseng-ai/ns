# gh-stack context

## gh-stack inventory

A read-only, repository-scoped collection combining local gh-stack tracking state and GitHub's Stacks
API. It is complete only when installation preflight and both sources succeed. Avoid: partial inventory,
generic Stack Provider.

## Local stack

A stack present in `<git-common-dir>/gh-stack`, including unpublished branches. A stack remains local
when it also matches a GitHub stack. Avoid: local-and-github.

## Remote stack

A GitHub Stacks API entry with no matching local stack. Avoid: any GitHub-backed stack.

## Provider identity

The gh-stack stack number and provider ID used for reconciliation, in that precedence order. Duplicate
or ambiguous identities are failures. Avoid: branch name as stack identity.

## Composition agreement

The ordered published pull-request number and branch pairs shared by matched local and remote stacks.
Local-only unpushed branches may remain in the complete local branch order; disagreement in published
composition is unsafe. Avoid: silently replacing local order.

## GS command face

The top-level `ns gs` provider-branded command group. Its shipped `list` operation exposes a bounded,
static, non-interactive gh-stack inventory for humans and agents. It does not identify generic Flow
stack lifecycle behavior and has no Pi mirror. Avoid: `ns flow gs`, generic stack command.

## Strict completeness

The list contract that rejects installation, Git, local-state, remote-discovery, response-compatibility,
and reconciliation failures without returning partial successful stack data. A missing local state
file is the sole zero-local-state success case. Avoid: local-only fallback.
