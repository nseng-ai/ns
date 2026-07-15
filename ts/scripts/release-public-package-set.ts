#!/usr/bin/env node

import { isDirectCliInvocation } from "@nseng-ai/foundation/cli-runtime";

export {
	createSystemReleaseCliContext,
	runReleaseCli,
	VERSION,
	type ReleaseCliContext,
} from "../packages/internal/ns-dev/src/release-public-package-set-cli.ts";
import { runSystemReleaseCliIfMain } from "../packages/internal/ns-dev/src/release-public-package-set-cli.ts";

if (import.meta.main || isDirectCliInvocation(import.meta.url, process.argv[1])) {
	await runSystemReleaseCliIfMain(process.argv);
}
