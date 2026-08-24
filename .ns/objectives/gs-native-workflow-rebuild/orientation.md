# Orientation: gs-native-workflow-rebuild

**Direction: build the everyday stacked-development loop in `@nseng-ai/gs` from native `github/gh-stack` semantics, not as a Flow adapter or a Graphite-shaped provider abstraction.**

Getting to: deliver command-sized vertical slices that settle each workflow in the GS README, add only the provider infrastructure that command proves necessary, and ship its CLI, portable skill, and Pi surface together while verifying mutations through observed Git, gh-stack, and GitHub facts.

What you see now: GS provides local-only read-only inventory; Flow owns the implemented Graphite workflows; provisional GS autobranch and autoslot skills are executable evidence rather than engineered commands.

Keep new GS lifecycle modules independent of Flow. Keep Slots optional and compose it through its public command boundary. Preserve forward-only recovery when provider mutations are partial or ambiguous.

Avoid infrastructure-first provider phases, command parity, private gh-stack state mutation, universal stack-provider interfaces, and changes that deprecate, archive, delete, or otherwise retire Flow under this Objective.

Active slice: implement the settled local `ns gs restack-resolve` contract with public `gh stack rebase --no-trunk` / `--continue`, then add its portable skill and thin `/ns:gs:restack-resolve`; defer trunk, push, and GitHub reconciliation and keep Graphite mechanics out.
