# @nseng-ai/pi-ns-gt

Incubating standalone Pi adapter for Graphite-backed Branch Context creation.

It registers `/ns:gt:new-branch-from-plan` and `/ns:gt:impl-branch-from-plan`. Provider choice is encoded by the `gt` namespace; these commands do not accept provider-selection flags. The package consumes only the curated `@nseng-ai/branch-context/api` and `@nseng-ai/plans/api` extension surfaces and does not depend on `@nseng-ai/pi-ns-branch-context`.
