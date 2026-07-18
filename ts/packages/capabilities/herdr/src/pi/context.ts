import type { ExtensionAPI } from "@nseng-ai/capability-kit/pi-types";
import { RealGitGateway, type GitGateway } from "@nseng-ai/foundation/git";

import type { HerdrPiCommandApi } from "../core/pi-command-api.ts";
import { createHerdrPiCommandApi } from "./pi-command-api.ts";

export type HerdrGitGateway = Pick<GitGateway, "optionalRepoRoot">;

export interface HerdrPiContext {
	pi: HerdrPiCommandApi;
	git: HerdrGitGateway;
}

export function createHerdrPiContext(rawPi: ExtensionAPI): HerdrPiContext {
	const pi = createHerdrPiCommandApi(rawPi);
	return { pi, git: new RealGitGateway(pi) };
}
