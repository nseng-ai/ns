import { NodeCommandExecApi } from "@nseng-ai/foundation/exec";
import { execApiToCommandRunner, type CommandExecApi } from "@nseng-ai/foundation/command";
import { RealGitGateway } from "@nseng-ai/capability-kit/git";
import type { GitGateway } from "@nseng-ai/capability-kit/git";
import { RealGithubPrFeedbackGateway } from "@nseng-ai/capability-kit/github/pr-feedback";

import {
	ClaudeCodeProcessReviewRunner,
	type ReviewRunnerGateway,
} from "../gateways/review-runner.ts";
import { RealLocalDiffGateway, type LocalDiffGateway } from "../gateways/local-diff.ts";
import { RealReviewCatalogGateway, type ReviewCatalogGateway } from "../gateways/review-catalog.ts";
import { RealReviewLogGateway, type ReviewLogGateway } from "../gateways/review-log.ts";
import { optionalEntry, type ExplicitUndefined } from "@nseng-ai/foundation/primitives";

export { ROASTER_BOT_LOGIN } from "./roaster-bot.ts";

export type ReviewsGithubPrFeedbackGateway = Pick<
	RealGithubPrFeedbackGateway,
	| "getPrChangedFiles"
	| "getPrReviewComments"
	| "getPrReviewThreads"
	| "createPrReview"
	| "findPrDiscussionCommentByMarker"
	| "addPrDiscussionComment"
	| "updatePrDiscussionComment"
>;

export interface RoasterGateways {
	readonly gitGateway: GitGateway;
	readonly localDiff: LocalDiffGateway;
	readonly reviewCatalog: ReviewCatalogGateway;
	readonly reviewLog: ReviewLogGateway;
	readonly github: ReviewsGithubPrFeedbackGateway;
	readonly reviewRunner: ReviewRunnerGateway;
}

export interface RoasterContext extends RoasterGateways {
	readonly execApi: CommandExecApi;
	readonly cwd: string;
	readonly env: NodeJS.ProcessEnv;
	readonly signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
	readonly stdin: () => Promise<string>;
	readonly stdout: (text: string) => void;
	readonly stderr: (text: string) => void;
}

export interface CreateRealRoasterContextOptions {
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

export interface RoasterRunScope {
	readonly cwd: string;
	readonly env: NodeJS.ProcessEnv;
	readonly signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
}

export interface RoasterEnvironmentOptions {
	readonly cwd: string;
	readonly env: NodeJS.ProcessEnv;
	readonly signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
}

export interface RoasterCatalogOptions {
	readonly cwd: string;
	readonly signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
}

export interface RoasterRuntime extends RoasterGateways {
	readonly runScope: RoasterRunScope;
	readonly stdin: () => Promise<string>;
	readonly stderr: (text: string) => void;
}

export function createRealRoasterContext(options: CreateRealRoasterContextOptions): RoasterContext {
	const execApi = options.execApi ?? new NodeCommandExecApi();
	const gitGateway = options.gitGateway ?? new RealGitGateway(execApi);
	return {
		execApi,
		gitGateway,
		localDiff: new RealLocalDiffGateway({ execApi, gitGateway }),
		reviewCatalog: new RealReviewCatalogGateway({ gitGateway }),
		reviewLog: options.reviewLog ?? new RealReviewLogGateway({ execApi }),
		github: new RealGithubPrFeedbackGateway(execApiToCommandRunner(execApi)),
		reviewRunner: options.reviewRunner ?? new ClaudeCodeProcessReviewRunner({ execApi }),
		cwd: options.cwd,
		env: options.env,
		...optionalEntry("signal", options.signal),
		stdin: options.stdin,
		stdout: options.stdout,
		stderr: options.stderr,
	};
}

export function createRoasterRuntime(context: RoasterContext): RoasterRuntime {
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

export function environmentOptions(scope: RoasterRunScope): RoasterEnvironmentOptions {
	return {
		...catalogOptions(scope),
		env: scope.env,
	};
}

export function catalogOptions(scope: RoasterRunScope): RoasterCatalogOptions {
	return {
		cwd: scope.cwd,
		...optionalEntry("signal", scope.signal),
	};
}
