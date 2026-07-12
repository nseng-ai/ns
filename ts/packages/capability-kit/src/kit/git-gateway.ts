import { RealGitGateway, type GitGateway } from "@nseng-ai/foundation/git";
import type { NsExtensionApi } from "@nseng-ai/sdk/sdk";

import { NsCommandExecApi } from "./command-runner.ts";

/** Kit-owned ctx -> gateway adapter over foundation's neutral git seam (ADR 0032). */
export function createNsGitGateway(ctx: NsExtensionApi): GitGateway {
	return new RealGitGateway(new NsCommandExecApi(ctx));
}
