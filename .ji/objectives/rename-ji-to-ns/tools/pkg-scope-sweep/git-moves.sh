#!/usr/bin/env bash
# git mv step for the ji -> ns package-scope sweep (phase 2 / PR-5).
# Run from the repo root, AFTER phase 1 (PR-4, `git mv .ji .ns` etc.) landed.
# Order matters: src/ji dirs first, then files (at their post-dir-move
# paths), then package directories and ji.toml last.
set -euo pipefail

# 1. Command-face source dirs: src/ji -> src/ns (9 capabilities; verified via
#    `git ls-files | grep '/src/ji/'` on 2026-07-03)
for cap in address aretro branch-context ccc flow handoff objective roaster slot; do
	git mv "ts/packages/capabilities/${cap}/src/ji" "ts/packages/capabilities/${cap}/src/ns"
done

# 2. ji-named files (paths reflect the dir moves above; 21 files verified via
#    `git ls-files | grep -E '(^|/)(ji[-.]|repo-local-ji|handoff-ji)'`)
git mv ts/packages/capabilities/address/src/ji-command.ts ts/packages/capabilities/address/src/ns-command.ts
git mv ts/packages/capabilities/address/src/repo-local-ji-extension.ts ts/packages/capabilities/address/src/repo-local-ns-extension.ts
git mv ts/packages/capabilities/aretro/src/repo-local-ji-extension.ts ts/packages/capabilities/aretro/src/repo-local-ns-extension.ts
git mv ts/packages/capabilities/branch-context/src/ns/repo-local-ji-extension.ts ts/packages/capabilities/branch-context/src/ns/repo-local-ns-extension.ts
git mv ts/packages/capabilities/flow/src/ns/repo-local-ji-extension.ts ts/packages/capabilities/flow/src/ns/repo-local-ns-extension.ts
git mv ts/packages/capabilities/flow/src/pi/ji-extension.ts ts/packages/capabilities/flow/src/pi/ns-extension.ts
git mv ts/packages/capabilities/flow/src/submit/ji-runtime.ts ts/packages/capabilities/flow/src/submit/ns-runtime.ts
git mv ts/packages/capabilities/flow/test/pi/ji-extension.test.ts ts/packages/capabilities/flow/test/pi/ns-extension.test.ts
git mv ts/packages/capabilities/flow/test/scenario/ji-cli-fakes.ts ts/packages/capabilities/flow/test/scenario/ns-cli-fakes.ts
git mv ts/packages/capabilities/handoff/src/ns/repo-local-ji-extension.ts ts/packages/capabilities/handoff/src/ns/repo-local-ns-extension.ts
git mv ts/packages/capabilities/handoff/test/scenario/handoff-ji-command-fakes.ts ts/packages/capabilities/handoff/test/scenario/handoff-ns-command-fakes.ts
git mv ts/packages/capabilities/handoff/test/scenario/handoff-ji-commands.test.ts ts/packages/capabilities/handoff/test/scenario/handoff-ns-commands.test.ts
git mv ts/packages/capabilities/objective/src/ns/repo-local-ji-extension.ts ts/packages/capabilities/objective/src/ns/repo-local-ns-extension.ts
git mv ts/packages/capabilities/objective/test/support/ji-command-harness.ts ts/packages/capabilities/objective/test/support/ns-command-harness.ts
git mv ts/packages/capabilities/roaster/src/core/repo-local-ji-extension.ts ts/packages/capabilities/roaster/src/core/repo-local-ns-extension.ts
git mv ts/packages/capability-kit/src/kit/ji-command.ts ts/packages/capability-kit/src/kit/ns-command.ts
git mv ts/packages/capability-kit/src/kit/ji-context.ts ts/packages/capability-kit/src/kit/ns-context.ts
git mv ts/packages/capability-kit/test/unit/ji-command.test.ts ts/packages/capability-kit/test/unit/ns-command.test.ts
git mv ts/packages/capability-kit/test/unit/ji-context.test.ts ts/packages/capability-kit/test/unit/ns-context.test.ts
git mv ts/packages/kernel/src/sdk/repo-local-ji-extension.ts ts/packages/kernel/src/sdk/repo-local-ns-extension.ts
git mv ts/packages/kernel/test/scenario/ji-cli-fakes.ts ts/packages/kernel/test/scenario/ns-cli-fakes.ts

# 3. Package directories
git mv ts/packages/hosts/jicc ts/packages/hosts/nscc

# 4. Root config file (deliberately deferred out of phase 1)
git mv ji.toml ns.toml

# NOT in this script (phase-1 / PR-4 territory): .ji -> .ns,
# .pi/extensions/ji.ts, skills/ji-flow-* dirs + .agents/.claude symlinks.
# docs/ji-naming-brief.md is frozen history and never moves content.

echo "git-moves complete"
