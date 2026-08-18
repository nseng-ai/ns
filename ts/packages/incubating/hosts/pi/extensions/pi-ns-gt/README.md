# @nseng-ai/pi-ns-gt

Incubating standalone Pi adapter for Graphite-backed Branch Context creation.

It registers `/ns:gt:new-branch-from-plan` and `/ns:gt:impl-branch-from-plan`. Provider choice is encoded by the `gt` namespace; these commands do not accept provider-selection flags. `impl-branch-from-plan` strictly requires a Saved Plan and creates a new Graphite branch before checkout and fresh-session Attached Plan dispatch. If no Saved Plan is available, it performs no fallback search and no provider, Git, Branch Memory, checkout, or session mutation; recover on an existing branch with `/ns:branch-context:impl-attached-plan [<key>]`. The package consumes only the curated `@nseng-ai/branch-context/api` and `@nseng-ai/plans/api` extension surfaces and does not depend on `@nseng-ai/pi-ns-branch-context`.
