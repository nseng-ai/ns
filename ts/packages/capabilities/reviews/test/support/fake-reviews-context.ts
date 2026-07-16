import type { CommandExecApi } from "@nseng-ai/foundation/command";
import type { GitGateway } from "@nseng-ai/foundation/git";
import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import { ScriptedCommandExecApi } from "@nseng-ai/foundation/exec/testing";
import type { ReviewsContext } from "../../src/core/context.ts";
import {
	FakeReviewRunnerGateway,
	type ReviewRunnerGateway,
} from "../../src/gateways/review-runner.ts";
import {
	FakeReviewAggregationRunnerGateway,
	type ReviewAggregationRunnerGateway,
} from "../../src/gateways/review-aggregation-runner.ts";
import { FakeGithubPrFeedbackGateway } from "@nseng-ai/capability-kit/github/testing";
import type { ReviewsGithubPrFeedbackGateway } from "../../src/core/context.ts";
import { FakeLocalDiffGateway, type LocalDiffGateway } from "../../src/gateways/local-diff.ts";
import {
	FakeReviewCatalogGateway,
	type ReviewCatalogGateway,
} from "../../src/gateways/review-catalog.ts";
import { FakeReviewLogGateway, type ReviewLogGateway } from "../../src/gateways/review-log.ts";
import type { Clock } from "@nseng-ai/foundation/clock";
import { createManualClock } from "@nseng-ai/foundation/time/testing";

export interface FakeReviewsContextOptions {
	readonly clock?: Clock;
	readonly execApi?: CommandExecApi;
	readonly gitGateway?: GitGateway;
	readonly localDiff?: LocalDiffGateway;
	readonly reviewCatalog?: ReviewCatalogGateway;
	readonly reviewLog?: ReviewLogGateway;
	readonly github?: ReviewsGithubPrFeedbackGateway;
	readonly reviewRunner?: ReviewRunnerGateway;
	readonly reviewAggregationRunner?: ReviewAggregationRunnerGateway;
	readonly cwd?: string;
	readonly env?: NodeJS.ProcessEnv;
	readonly signal?: AbortSignal;
	readonly stdin?: () => Promise<string>;
	readonly stdout?: (text: string) => void;
	readonly stderr?: (text: string) => void;
}

export function fakeReviewsContext(options: FakeReviewsContextOptions = {}): ReviewsContext {
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
		clock: options.clock ?? createManualClock(Date.parse("2026-07-16T12:00:00.000Z")).clock,
		gitGateway,
		localDiff: options.localDiff ?? new FakeLocalDiffGateway(),
		reviewCatalog: options.reviewCatalog ?? new FakeReviewCatalogGateway(),
		reviewLog: options.reviewLog ?? new FakeReviewLogGateway(),
		github: options.github ?? new FakeGithubPrFeedbackGateway(),
		reviewRunner: options.reviewRunner ?? new FakeReviewRunnerGateway(),
		reviewAggregationRunner:
			options.reviewAggregationRunner ?? new FakeReviewAggregationRunnerGateway(),
		cwd: options.cwd ?? "/repo",
		env: options.env ?? {},
		...(options.signal === undefined ? {} : { signal: options.signal }),
		stdin: options.stdin ?? (async () => ""),
		stdout: options.stdout ?? (() => undefined),
		stderr: options.stderr ?? (() => undefined),
	};
}
