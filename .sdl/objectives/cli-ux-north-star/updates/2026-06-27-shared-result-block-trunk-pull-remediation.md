# Shared result-block / trunk-pull remediation

Remediated the cli-ux-house-style review findings F1/F2.

- Promoted the repeated generic finite result-block layout to `@sdl/clinkr/theme` as `renderResultBlock` plus `resultBlockHeadline`. Flow workflow, CCC autoslot, and CCC land keep domain-local facade names but delegate layout to the shared theme primitive; `git-result-block.ts` consumes only the shared headline helper and keeps git/Graphite transcript/cause plumbing local.
- Updated the house-style spec and roadmap to record that the previous no-extraction guard's repeated-shape precondition has fired across Flow and CCC. Generic domain-authored finite blocks use `renderResultBlock`; git/Graphite finite blocks may layer transcript plumbing around `resultBlockHeadline`.
- Deleted the dead `@sdl/ccc/trunk-pull` plain-string compatibility path (`runTrunkPullCli`, `runTrunkPull`, and formatting helpers). `runTrunkPullDetailed` / `TrunkPullDetailedResult` are now the single production facts for `sdl flow pull-trunk`.
