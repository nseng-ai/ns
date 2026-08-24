import { NsCommandExecApi } from "@nseng-ai/extension-kit/command-runner";
import type { NsExtensionApi } from "@nseng-ai/sdk";

import type { GsRestackContext } from "../core/restack-command.ts";
import { RealGsRestackGitGateway } from "../core/real-restack-git-gateway.ts";
import { RealGsStackProviderGateway } from "../core/real-stack-provider-gateway.ts";

export function createRealGsRestackContext(ctx: NsExtensionApi): GsRestackContext {
	const commands = new NsCommandExecApi(ctx);
	return {
		provider: new RealGsStackProviderGateway(commands, ctx.cwd),
		git: new RealGsRestackGitGateway(commands, ctx.cwd),
	};
}
