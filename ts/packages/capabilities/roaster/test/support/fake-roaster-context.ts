import type { CommandExecApi } from "@ns/core/command";
import type { GitGateway } from "@ns/capability-kit/git";
import { InMemoryGitGateway } from "@ns/capability-kit/git/testing";
import { ScriptedCommandExecApi } from "@ns/core/exec/testing";
import { resultOk, type Result } from "@ns/core/result";

import type { RoasterContext } from "../../src/core/context.ts";
import {
	FakeReviewRunnerGateway,
	type ReviewRunnerGateway,
} from "../../src/gateways/review-runner.ts";
import { FakeRoasterGitHubGateway, type RoasterGitHubGateway } from "../../src/gateways/github.ts";
import type {
	PriorFindingsContextGithubGateway,
	PriorFindingsDiscussionComment,
	PriorFindingsGatewayFailure,
	PriorFindingsPrOptions,
	PriorFindingsReviewThread,
} from "../../src/core/prior-findings-context.ts";
import { FakeLocalDiffGateway, type LocalDiffGateway } from "../../src/gateways/local-diff.ts";
import {
	FakeReviewCatalogGateway,
	type ReviewCatalogGateway,
} from "../../src/gateways/review-catalog.ts";
import { FakeReviewLogGateway, type ReviewLogGateway } from "../../src/gateways/review-log.ts";

export interface FakeRoasterContextOptions {
	readonly execApi?: CommandExecApi;
	readonly gitGateway?: GitGateway;
	readonly localDiff?: LocalDiffGateway;
	readonly reviewCatalog?: ReviewCatalogGateway;
	readonly reviewLog?: ReviewLogGateway;
	readonly github?: RoasterGitHubGateway;
	readonly priorFindingsGateway?: PriorFindingsContextGithubGateway;
	readonly reviewRunner?: ReviewRunnerGateway;
	readonly cwd?: string;
	readonly env?: NodeJS.ProcessEnv;
	readonly signal?: AbortSignal;
	readonly stdin?: () => Promise<string>;
	readonly stdout?: (text: string) => void;
	readonly stderr?: (text: string) => void;
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
		reviewLog: options.reviewLog ?? new FakeReviewLogGateway(),
		github: options.github ?? new FakeRoasterGitHubGateway(),
		priorFindingsGateway:
			options.priorFindingsGateway ?? new EmptyPriorFindingsContextGithubGateway(),
		reviewRunner: options.reviewRunner ?? new FakeReviewRunnerGateway(),
		cwd: options.cwd ?? "/repo",
		env: options.env ?? {},
		...(options.signal === undefined ? {} : { signal: options.signal }),
		stdin: options.stdin ?? (async () => ""),
		stdout: options.stdout ?? (() => undefined),
		stderr: options.stderr ?? (() => undefined),
	};
}

class EmptyPriorFindingsContextGithubGateway implements PriorFindingsContextGithubGateway {
	async getPrDiscussionComments(
		_options: PriorFindingsPrOptions,
	): Promise<Result<readonly PriorFindingsDiscussionComment[], PriorFindingsGatewayFailure>> {
		return resultOk([]);
	}

	async getPrReviewThreads(
		_options: PriorFindingsPrOptions,
	): Promise<Result<readonly PriorFindingsReviewThread[], PriorFindingsGatewayFailure>> {
		return resultOk([]);
	}
}
