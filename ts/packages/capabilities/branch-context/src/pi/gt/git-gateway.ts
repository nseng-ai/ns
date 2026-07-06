import { piExecApiToCommandExecApi } from "@nseng-ai/foundation/command";
import { RealGitGateway, type GitGateway } from "@nseng-ai/capability-kit/git";
import type { ExtensionAPI } from "../host-types.ts";

export const GT_UPSTACK_IMPL_CHECKOUT_TIMEOUT_MS = 30_000;

export function createGtUpstackImplGitGateway(pi: ExtensionAPI): GitGateway {
	return new RealGitGateway(piExecApiToCommandExecApi(pi), {
		timeoutMs: GT_UPSTACK_IMPL_CHECKOUT_TIMEOUT_MS,
	});
}
