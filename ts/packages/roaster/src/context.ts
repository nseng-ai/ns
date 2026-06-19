import { NodeCommandExecApi, type CommandExecApi } from "@asdl/core/exec";
import { RealGitGateway, type GitGateway } from "@asdl/core/git";

import { RealHarnessGateway, type HarnessGateway } from "./gateways/harness.ts";
import { RealRoasterGitHubGateway, type RoasterGitHubGateway } from "./gateways/github.ts";
import { RealLocalDiffGateway, type LocalDiffGateway } from "./gateways/local-diff.ts";
import { RealReviewCatalogGateway, type ReviewCatalogGateway } from "./gateways/review-catalog.ts";

export { ROASTER_BOT_LOGIN } from "./roaster-bot.ts";

export interface RoasterContext {
	readonly execApi: CommandExecApi;
	readonly gitGateway: GitGateway;
	readonly localDiff: LocalDiffGateway;
	readonly reviewCatalog: ReviewCatalogGateway;
	readonly github: RoasterGitHubGateway;
	readonly harness: HarnessGateway;
	readonly cwd: string;
	readonly env: NodeJS.ProcessEnv;
	readonly signal?: AbortSignal | undefined;
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
	readonly signal?: AbortSignal | undefined;
	readonly execApi?: CommandExecApi | undefined;
	readonly gitGateway?: GitGateway | undefined;
	readonly harness?: HarnessGateway | undefined;
}

export interface RoasterRunScope {
	readonly cwd: string;
	readonly env: NodeJS.ProcessEnv;
	readonly signal?: AbortSignal | undefined;
}

export interface RoasterEnvironmentOptions {
	readonly cwd: string;
	readonly env: NodeJS.ProcessEnv;
	readonly signal?: AbortSignal | undefined;
}

export interface RoasterCatalogOptions {
	readonly cwd: string;
	readonly signal?: AbortSignal | undefined;
}

export interface RoasterRuntime {
	readonly runScope: RoasterRunScope;
	readonly localDiff: LocalDiffGateway;
	readonly reviewCatalog: ReviewCatalogGateway;
	readonly github: RoasterGitHubGateway;
	readonly harness: HarnessGateway;
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
		github: new RealRoasterGitHubGateway(execApi),
		harness: options.harness ?? new RealHarnessGateway({ execApi }),
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
		localDiff: context.localDiff,
		reviewCatalog: context.reviewCatalog,
		github: context.github,
		harness: context.harness,
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
