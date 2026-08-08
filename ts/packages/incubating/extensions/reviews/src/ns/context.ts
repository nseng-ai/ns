import { NsCommandExecApi } from "@nseng-ai/extension-kit/command-runner";
import type { NsExtensionApi } from "@nseng-ai/sdk";

import {
	createRealReviewsContext,
	createReviewsRuntime,
	type ReviewsRuntime,
} from "../core/context.ts";

export function createNsReviewsRuntime(ctx: NsExtensionApi): ReviewsRuntime {
	if (ctx.readStructuredRequest === undefined) {
		throw new Error("Reviews ns runtime requires readStructuredRequest");
	}
	const execApi = new NsCommandExecApi(ctx);
	return createReviewsRuntime(
		createRealReviewsContext({
			cwd: ctx.cwd,
			env: ctx.env,
			readStructuredRequest: ctx.readStructuredRequest,
			stdout: ctx.stdout ?? (() => undefined),
			stderr: ctx.stderr ?? (() => undefined),
			execApi,
		}),
	);
}
