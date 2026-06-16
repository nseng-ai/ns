import type { CommandExecApi } from "@asdl/core/exec";
import type { GitGateway } from "@asdl/core/git";
import { InMemoryGitGateway } from "@asdl/core/git/testing";
import { ScriptedCommandExecApi } from "@asdl/core/testing";

import type { RoasterContext } from "../../src/context.ts";
import { FakeHarnessGateway, type HarnessGateway } from "../../src/gateways/harness.ts";
import { FakeRoasterGitHubGateway, type RoasterGitHubGateway } from "../../src/gateways/github.ts";
import { FakeLocalDiffGateway, type LocalDiffGateway } from "../../src/gateways/local-diff.ts";
import { FakeReviewCatalogGateway, type ReviewCatalogGateway } from "../../src/gateways/review-catalog.ts";

export interface FakeRoasterContextOptions {
	readonly execApi?: CommandExecApi | undefined;
	readonly gitGateway?: GitGateway | undefined;
	readonly localDiff?: LocalDiffGateway | undefined;
	readonly reviewCatalog?: ReviewCatalogGateway | undefined;
	readonly github?: RoasterGitHubGateway | undefined;
	readonly harness?: HarnessGateway | undefined;
}

export function fakeRoasterContext(options: FakeRoasterContextOptions = {}): RoasterContext {
	const execApi = options.execApi ?? new ScriptedCommandExecApi();
	const gitGateway =
		options.gitGateway ??
		new InMemoryGitGateway({
			repoRoot: "/repo",
			optionalRepoRoot: "/repo",
			currentBranch: "feature",
			trunkBranch: "main",
			originUrl: "git@example.com:repo.git\n",
			headCommit: "abc123",
			existingBranches: ["feature", "main"],
		});
	return {
		execApi,
		gitGateway,
		localDiff: options.localDiff ?? new FakeLocalDiffGateway(),
		reviewCatalog: options.reviewCatalog ?? new FakeReviewCatalogGateway(),
		github: options.github ?? new FakeRoasterGitHubGateway(),
		harness: options.harness ?? new FakeHarnessGateway(),
	};
}
