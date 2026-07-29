import { RealGitGateway, type GitGateway } from "@nseng-ai/foundation/git";
import type { CommandExecApi } from "@nseng-ai/foundation/command";

export const GT_UPSTACK_IMPL_CHECKOUT_TIMEOUT_MS = 30_000;

export function createGtUpstackImplGitGateway(pi: CommandExecApi): GitGateway {
	return new RealGitGateway(pi, {
		timeoutMs: GT_UPSTACK_IMPL_CHECKOUT_TIMEOUT_MS,
	});
}
