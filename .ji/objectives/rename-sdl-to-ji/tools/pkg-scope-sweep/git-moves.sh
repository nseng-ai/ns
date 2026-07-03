#!/usr/bin/env bash
# git mv step for the package-scope sweep. Run from the repo root.
# Order matters: src/sdl dirs first, then files (at their post-dir-move
# paths), then package directories last.
set -euo pipefail

# 1. Command-face source dirs: src/sdl -> src/ji (9 capabilities)
for cap in address aretro branch-context ccc flow handoff objective roaster slot; do
	git mv "ts/packages/capabilities/${cap}/src/sdl" "ts/packages/capabilities/${cap}/src/ji"
done

# 2. sdl-named files (paths reflect the dir moves above)
git mv ts/packages/capabilities/address/src/repo-local-sdl-extension.ts ts/packages/capabilities/address/src/repo-local-ji-extension.ts
git mv ts/packages/capabilities/address/src/sdl-command.ts ts/packages/capabilities/address/src/ji-command.ts
git mv ts/packages/capabilities/aretro/src/repo-local-sdl-extension.ts ts/packages/capabilities/aretro/src/repo-local-ji-extension.ts
git mv ts/packages/capabilities/branch-context/src/ji/repo-local-sdl-extension.ts ts/packages/capabilities/branch-context/src/ji/repo-local-ji-extension.ts
git mv ts/packages/capabilities/flow/src/ji/repo-local-sdl-extension.ts ts/packages/capabilities/flow/src/ji/repo-local-ji-extension.ts
git mv ts/packages/capabilities/flow/src/pi/sdl-extension.ts ts/packages/capabilities/flow/src/pi/ji-extension.ts
git mv ts/packages/capabilities/flow/src/submit/sdl-runtime.ts ts/packages/capabilities/flow/src/submit/ji-runtime.ts
git mv ts/packages/capabilities/flow/test/pi/sdl-extension.test.ts ts/packages/capabilities/flow/test/pi/ji-extension.test.ts
git mv ts/packages/capabilities/flow/test/scenario/sdl-cli-fakes.ts ts/packages/capabilities/flow/test/scenario/ji-cli-fakes.ts
git mv ts/packages/capabilities/handoff/src/ji/repo-local-sdl-extension.ts ts/packages/capabilities/handoff/src/ji/repo-local-ji-extension.ts
git mv ts/packages/capabilities/handoff/test/scenario/handoff-sdl-command-fakes.ts ts/packages/capabilities/handoff/test/scenario/handoff-ji-command-fakes.ts
git mv ts/packages/capabilities/handoff/test/scenario/handoff-sdl-commands.test.ts ts/packages/capabilities/handoff/test/scenario/handoff-ji-commands.test.ts
git mv ts/packages/capabilities/objective/src/ji/repo-local-sdl-extension.ts ts/packages/capabilities/objective/src/ji/repo-local-ji-extension.ts
git mv ts/packages/capabilities/objective/test/support/sdl-command-harness.ts ts/packages/capabilities/objective/test/support/ji-command-harness.ts
git mv ts/packages/capabilities/roaster/src/core/repo-local-sdl-extension.ts ts/packages/capabilities/roaster/src/core/repo-local-ji-extension.ts
git mv ts/packages/kernel/src/sdk/repo-local-sdl-extension.ts ts/packages/kernel/src/sdk/repo-local-ji-extension.ts
git mv ts/packages/kernel/test/scenario/sdl-cli-fakes.ts ts/packages/kernel/test/scenario/ji-cli-fakes.ts
git mv ts/packages/sdl-capability-kit/src/kit/sdl-command.ts ts/packages/sdl-capability-kit/src/kit/ji-command.ts
git mv ts/packages/sdl-capability-kit/src/kit/sdl-context.ts ts/packages/sdl-capability-kit/src/kit/ji-context.ts
git mv ts/packages/sdl-capability-kit/test/unit/sdl-command.test.ts ts/packages/sdl-capability-kit/test/unit/ji-command.test.ts
git mv ts/packages/sdl-capability-kit/test/unit/sdl-context.test.ts ts/packages/sdl-capability-kit/test/unit/ji-context.test.ts

# 3. Package directories
git mv ts/packages/sdl-capability-kit ts/packages/capability-kit
git mv ts/packages/hosts/sdlcc ts/packages/hosts/jicc

echo "git-moves complete"
