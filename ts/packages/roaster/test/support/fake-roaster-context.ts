import type { CommandExecApi } from "@sdl/exec";
import type { GitGateway } from "@sdl/git";
import { InMemoryGitGateway } from "@sdl/capability-kit/git/testing";
import { ScriptedCommandExecApi } from "@sdl/core/testing";

import type { RoasterContext } from "../../src/context.ts";
import {
	FakeReviewRunnerGateway,
	type ReviewRunnerGateway,
} from "../../src/gateways/review-runner.ts";
import { FakeRoasterGitHubGateway, type RoasterGitHubGateway } from "../../src/gateways/github.ts";
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
		reviewRunner: options.reviewRunner ?? new FakeReviewRunnerGateway(),
		cwd: options.cwd ?? "/repo",
		env: options.env ?? {},
		...(options.signal === undefined ? {} : { signal: options.signal }),
		stdin: options.stdin ?? (async () => ""),
		stdout: options.stdout ?? (() => undefined),
		stderr: options.stderr ?? (() => undefined),
	};
}
