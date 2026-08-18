# GitHub Stacks Pi Adapter Context

## GitHub Stacks Consumer Gateway

The package-owned boundary over `gh stack`. Its real adapter uses Pi's exec channel and owns argv, JSON validation, provider-private fields, and exit classification.

## GS new-branch-from-plan

The `/ns:gs:new-branch-from-plan` workflow selects and prepares a Saved Plan through curated Plans and Branch Context APIs, creates the target in local GitHub Stacks topology, verifies the target through Git, attaches Branch Context, and restores the original named branch.

## GS impl-branch-from-plan

The `/ns:gs:impl-branch-from-plan` workflow requires a Saved Plan, then applies package-local GS topology, collision, creation, verification, and attachment policy. New targets remain checked out and launch implementation in a fresh Pi replacement session. Missing Saved Plan evidence is terminal before GS topology inspection or any provider, Git, Branch Memory, checkout, or session mutation. Existing branches resume through provider-independent `/ns:branch-context:impl-attached-plan [<key>]`, not this creation command.

## Boundaries

- Git/config facts resolve current branch and trunk; Graphite is not constructed or invoked.
- Provider creation and Branch Context attachment are not transactional. Failures report durable partial state and do not roll back.
- Publication, reconciliation, pull-request creation, and merge are outside this package's command surface.
