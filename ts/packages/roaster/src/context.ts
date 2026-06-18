import { NodeCommandExecApi, type CommandExecApi } from "@asdl/core/exec";
import { RealGitGateway, type GitGateway } from "@asdl/core/git";

import { RealHarnessGateway, type HarnessGateway } from "./gateways/harness.ts";
import { RealRoasterGitHubGateway, type RoasterGitHubGateway } from "./gateways/github.ts";
import { RealLocalDiffGateway, type LocalDiffGateway } from "./gateways/local-diff.ts";
import { RealReviewCatalogGateway, type ReviewCatalogGateway } from "./gateways/review-catalog.ts";

export interface RoasterContext {
	readonly execApi: CommandExecApi;
	readonly gitGateway: GitGateway;
	readonly localDiff: LocalDiffGateway;
	readonly reviewCatalog: ReviewCatalogGateway;
	readonly github: RoasterGitHubGateway;
	readonly harness: HarnessGateway;
}

export interface CreateRealRoasterContextOptions {
	readonly execApi?: CommandExecApi | undefined;
	readonly gitGateway?: GitGateway | undefined;
	readonly harness?: HarnessGateway | undefined;
}

export function createRealRoasterContext(
	options: CreateRealRoasterContextOptions = {},
): RoasterContext {
	const execApi = options.execApi ?? new NodeCommandExecApi();
	const gitGateway = options.gitGateway ?? new RealGitGateway(execApi);
	return {
		execApi,
		gitGateway,
		localDiff: new RealLocalDiffGateway({ execApi, gitGateway }),
		reviewCatalog: new RealReviewCatalogGateway({ gitGateway }),
		github: new RealRoasterGitHubGateway(execApi),
		harness: options.harness ?? new RealHarnessGateway({ execApi }),
	};
}
