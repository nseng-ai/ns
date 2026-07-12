import { NsCommandExecApi } from "@nseng-ai/capability-kit/command-runner";
import type { NsExtensionApi } from "@nseng-ai/sdk/sdk";

import {
	createRealReviewsContext,
	createReviewsRuntime,
	type ReviewsRuntime,
} from "../core/context.ts";

export function createNsReviewsRuntime(ctx: NsExtensionApi): ReviewsRuntime {
	const execApi = new NsCommandExecApi(ctx);
	return createReviewsRuntime(
		createRealReviewsContext({
			cwd: ctx.cwd,
			env: ctx.env,
			stdin: ctx.stdin ?? (async () => ""),
			stdout: ctx.stdout ?? (() => undefined),
			stderr: ctx.stderr ?? (() => undefined),
			execApi,
		}),
	);
}
