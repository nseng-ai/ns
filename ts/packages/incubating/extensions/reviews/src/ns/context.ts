import { NsCommandExecApi } from "@nseng-ai/extension-kit/command-runner";
import { configureNsGitGateway } from "@nseng-ai/extension-kit";
import type { NsExtensionApi } from "@nseng-ai/sdk";

import {
	createRealReviewsContext,
	createReviewsRuntime,
	type ReviewsRuntime,
} from "../core/context.ts";

export async function createNsReviewsRuntime(ctx: NsExtensionApi): Promise<ReviewsRuntime> {
	const execApi = new NsCommandExecApi(ctx);
	const configuredGit = await configureNsGitGateway(ctx);
	if (!configuredGit.ok)
		throw new Error(`Cannot configure Reviews Git policy: ${configuredGit.error.message}`);
	return createReviewsRuntime(
		createRealReviewsContext({
			cwd: ctx.cwd,
			env: ctx.env,
			stdin: ctx.stdin ?? (async () => ""),
			stdout: ctx.stdout ?? (() => undefined),
			stderr: ctx.stderr ?? (() => undefined),
			execApi,
			gitGateway: configuredGit.value,
		}),
	);
}
