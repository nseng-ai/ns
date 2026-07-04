import { NodeCommandExecApi } from "@ns/core/exec";
import type { CommandExecApi } from "@ns/core/command";
import { RealGitGateway } from "@ns/capability-kit/git";
import type { GitGateway } from "@ns/capability-kit/git";

import {
	ClaudeCodeProcessReviewRunner,
	type ReviewRunnerGateway,
} from "../gateways/review-runner.ts";
import { RealRoasterGitHubGateway, type RoasterGitHubGateway } from "../gateways/github.ts";
import { RealLocalDiffGateway, type LocalDiffGateway } from "../gateways/local-diff.ts";
import { RealReviewCatalogGateway, type ReviewCatalogGateway } from "../gateways/review-catalog.ts";
import { RealReviewLogGateway, type ReviewLogGateway } from "../gateways/review-log.ts";
import type { ExplicitUndefined } from "@ns/core/primitives";

export { ROASTER_BOT_LOGIN } from "./roaster-bot.ts";

export interface RoasterContext {
	readonly execApi: CommandExecApi;
	readonly gitGateway: GitGateway;
	readonly localDiff: LocalDiffGateway;
	readonly reviewCatalog: ReviewCatalogGateway;
	readonly reviewLog: ReviewLogGateway;
	readonly github: RoasterGitHubGateway;
	readonly reviewRunner: ReviewRunnerGateway;
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

export interface RoasterRuntime {
	readonly runScope: RoasterRunScope;
	readonly gitGateway: GitGateway;
	readonly localDiff: LocalDiffGateway;
	readonly reviewCatalog: ReviewCatalogGateway;
	readonly reviewLog: ReviewLogGateway;
	readonly github: RoasterGitHubGateway;
	readonly reviewRunner: ReviewRunnerGateway;
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
		github: new RealRoasterGitHubGateway(execApi),
		reviewRunner: options.reviewRunner ?? new ClaudeCodeProcessReviewRunner({ execApi }),
		cwd: options.cwd,
		env: options.env,
		...(options.signal === undefined ? {} : { signal: options.signal }),
		stdin: options.stdin,
		stdout: options.stdout,
		stderr: options.stderr,
	};
}

export function createRoasterRuntime(context: RoasterContext): RoasterRuntime {
	return {
		runScope: runScopeFromContext(context),
		gitGateway: context.gitGateway,
		localDiff: context.localDiff,
		reviewCatalog: context.reviewCatalog,
		reviewLog: context.reviewLog,
		github: context.github,
		reviewRunner: context.reviewRunner,
		stdin: context.stdin,
		stderr: context.stderr,
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
		...(scope.signal === undefined ? {} : { signal: scope.signal }),
	};
}

function runScopeFromContext(context: RoasterContext): RoasterRunScope {
	return {
		cwd: context.cwd,
		env: context.env,
		...(context.signal === undefined ? {} : { signal: context.signal }),
	};
}
