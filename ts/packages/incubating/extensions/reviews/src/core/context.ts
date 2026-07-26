import { NodeCommandExecApi } from "@nseng-ai/foundation/exec";
import { execApiToCommandRunner, type CommandExecApi } from "@nseng-ai/foundation/command";
import { RealGitGateway } from "@nseng-ai/foundation/git";
import type { GitGateway } from "@nseng-ai/foundation/git";
import { RealGithubPrFeedbackGateway } from "@nseng-ai/extension-kit/github/pr-feedback";
import type { GithubPrFeedbackGateway } from "@nseng-ai/extension-kit/github/pr-feedback";

import {
	ClaudeCodeProcessReviewRunner,
	RoutingReviewRunner,
	type ReviewRunnerGateway,
} from "../gateways/review-runner.ts";
import { CodexProcessReviewRunner } from "../gateways/codex-review-runner.ts";
import { PiProcessReviewRunner } from "../gateways/pi-review-runner.ts";
import { RealLocalDiffGateway, type LocalDiffGateway } from "../gateways/local-diff.ts";
import { RealReviewCatalogGateway, type ReviewCatalogGateway } from "../gateways/review-catalog.ts";
import { RealReviewLogGateway, type ReviewLogGateway } from "../gateways/review-log.ts";
import { optionalEntry, type ExplicitUndefined } from "@nseng-ai/foundation/primitives";

export { REVIEWS_BOT_LOGIN } from "./reviews-bot.ts";

export type ReviewsGithubPrFeedbackGateway = Pick<
	GithubPrFeedbackGateway,
	| "getPrChangedFiles"
	| "getPrReviewComments"
	| "getPrReviewThreads"
	| "createPrReview"
	| "findPrDiscussionCommentByMarker"
	| "addPrDiscussionComment"
	| "updatePrDiscussionComment"
>;

export interface ReviewsGateways {
	readonly gitGateway: GitGateway;
	readonly localDiff: LocalDiffGateway;
	readonly reviewCatalog: ReviewCatalogGateway;
	readonly reviewLog: ReviewLogGateway;
	readonly github: ReviewsGithubPrFeedbackGateway;
	readonly reviewRunner: ReviewRunnerGateway;
}

export interface ReviewsContext extends ReviewsGateways {
	readonly execApi: CommandExecApi;
	readonly cwd: string;
	readonly env: NodeJS.ProcessEnv;
	readonly signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
	readonly stdin: () => Promise<string>;
	readonly stdout: (text: string) => void;
	readonly stderr: (text: string) => void;
}

export interface CreateRealReviewsContextOptions {
	readonly cwd: string;
	readonly env: NodeJS.ProcessEnv;
	readonly stdin: () => Promise<string>;
	readonly stdout: (text: string) => void;
	readonly stderr: (text: string) => void;
	readonly signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
	readonly execApi?: CommandExecApi;
	readonly gitGateway?: GitGateway;
	readonly reviewLog?: ReviewLogGateway;
	readonly reviewRunner?: ReviewRunnerGateway;
}

export interface ReviewsRunScope {
	readonly cwd: string;
	readonly env: NodeJS.ProcessEnv;
	readonly signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
}

export interface ReviewsEnvironmentOptions {
	readonly cwd: string;
	readonly env: NodeJS.ProcessEnv;
	readonly signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
}

export interface ReviewsCatalogOptions {
	readonly cwd: string;
	readonly signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
}

export interface ReviewsRuntime extends ReviewsGateways {
	readonly runScope: ReviewsRunScope;
	readonly stdin: () => Promise<string>;
	readonly stderr: (text: string) => void;
}

export function createRealReviewsContext(options: CreateRealReviewsContextOptions): ReviewsContext {
	const execApi = options.execApi ?? new NodeCommandExecApi();
	const gitGateway = options.gitGateway ?? new RealGitGateway(execApi);
	return {
		execApi,
		gitGateway,
		localDiff: new RealLocalDiffGateway({ execApi, gitGateway }),
		reviewCatalog: new RealReviewCatalogGateway({ gitGateway }),
		reviewLog: options.reviewLog ?? new RealReviewLogGateway({ execApi }),
		github: new RealGithubPrFeedbackGateway(execApiToCommandRunner(execApi)),
		reviewRunner:
			options.reviewRunner ??
			new RoutingReviewRunner({
				claudeCode: new ClaudeCodeProcessReviewRunner({ execApi }),
				codex: new CodexProcessReviewRunner({ execApi }),
				pi: new PiProcessReviewRunner({ execApi }),
			}),
		cwd: options.cwd,
		env: options.env,
		...optionalEntry("signal", options.signal),
		stdin: options.stdin,
		stdout: options.stdout,
		stderr: options.stderr,
	};
}

export function createReviewsRuntime(context: ReviewsContext): ReviewsRuntime {
	const { execApi, cwd, env, signal, stdout, ...runtimeFields } = context;
	void execApi;
	void stdout;
	return {
		...runtimeFields,
		runScope: {
			cwd,
			env,
			...optionalEntry("signal", signal),
		},
	};
}

export function environmentOptions(scope: ReviewsRunScope): ReviewsEnvironmentOptions {
	return {
		...catalogOptions(scope),
		env: scope.env,
	};
}

export function catalogOptions(scope: ReviewsRunScope): ReviewsCatalogOptions {
	return {
		cwd: scope.cwd,
		...optionalEntry("signal", scope.signal),
	};
}
