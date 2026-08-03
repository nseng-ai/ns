import { RealGitBrmemGateway, type BrmemGateway } from "@nseng-ai/brmem";
import {
	GraphiteBranchCreationProvider,
	PlainGitBranchCreationProvider,
	loadWorkflowBranchCreationConfig,
	type BranchCreationProvider,
	type BuiltInBranchCreationMode,
} from "@nseng-ai/extension-kit/branch-creation";
import { RealGraphiteBranchGateway } from "@nseng-ai/extension-kit/graphite/branch";
import { NodeCommandExecApi } from "@nseng-ai/foundation/exec";
import type { CommandExecApi, StdinCapableCommandExecApi } from "@nseng-ai/foundation/exec";
import { RealGitGateway } from "@nseng-ai/foundation/git";
import type { GitGateway } from "@nseng-ai/foundation/git";
import {
	nodeProjectConfigGateway,
	type ProjectConfigGateway,
} from "@nseng-ai/sdk/project-config/points";

export interface BranchContextContext {
	commands: CommandExecApi;
	git: GitGateway;
	brmem: BrmemGateway;
}

export interface BranchContextCreationContext extends BranchContextContext {
	branchCreation: BranchCreationProvider;
}

export interface PreparedBranchContextCreation {
	context: BranchContextCreationContext;
	branchCreation: BuiltInBranchCreationMode;
}

export interface BranchContextContextOptions {
	cwd?: string;
	brmemCommands?: StdinCapableCommandExecApi;
}

export interface BranchContextCreationContextOptions extends BranchContextContextOptions {
	projectConfigGateway?: ProjectConfigGateway;
	createGraphiteProvider?: (options: {
		commands: CommandExecApi;
		git: GitGateway;
	}) => BranchCreationProvider;
}

export type BranchContextContextFactory<Args extends unknown[]> = (
	...args: Args
) => BranchContextContext;

export function createBranchContextContext(
	commands: CommandExecApi,
	options: BranchContextContextOptions = {},
): BranchContextContext {
	const cwd = options.cwd ?? process.cwd();
	const git = new RealGitGateway(commands);
	const brmemCommands = options.brmemCommands ?? new NodeCommandExecApi();
	const brmemGit = brmemCommands === commands ? git : new RealGitGateway(brmemCommands);
	const brmem = new RealGitBrmemGateway({ cwd, commands: brmemCommands, git: brmemGit });
	return { commands, git, brmem };
}

export async function createBranchContextCreationContext(
	commands: CommandExecApi,
	options: BranchContextCreationContextOptions = {},
): Promise<BranchContextCreationContext> {
	const context = createBranchContextContext(commands, options);
	return selectBranchCreationForContext(context, options.cwd ?? process.cwd(), options);
}

export type BranchContextCreationSelectionErrorCode =
	| "invalid-toml"
	| "invalid-workflow"
	| "invalid-branch-creation"
	| "config-read-failed"
	| string;

export class BranchContextCreationSelectionError extends Error {
	readonly code: BranchContextCreationSelectionErrorCode;

	constructor(code: BranchContextCreationSelectionErrorCode, message: string) {
		super(message);
		this.name = "BranchContextCreationSelectionError";
		this.code = code;
	}
}

export async function prepareBranchContextCreation(options: {
	context: BranchContextContext;
	cwd: string;
}): Promise<PreparedBranchContextCreation> {
	const context = await selectBranchCreationForContext(options.context, options.cwd);
	return { context, branchCreation: context.branchCreation.mode };
}

export async function selectBranchCreationForContext(
	context: BranchContextContext,
	cwd: string,
	options: Pick<
		BranchContextCreationContextOptions,
		"projectConfigGateway" | "createGraphiteProvider"
	> = {},
): Promise<BranchContextCreationContext> {
	if ("branchCreation" in context) {
		return context as BranchContextCreationContext;
	}
	const repoRoot = await context.git.repoRoot({ cwd });
	if (!repoRoot.ok) {
		throw new BranchContextCreationSelectionError(repoRoot.error.code, repoRoot.error.message);
	}
	const config = loadWorkflowBranchCreationConfig({
		repoRoot: repoRoot.value,
		gateway: options.projectConfigGateway ?? nodeProjectConfigGateway,
	});
	if (!config.ok) {
		throw new BranchContextCreationSelectionError(config.error.code, config.error.message);
	}
	return {
		...context,
		branchCreation: createSelectedBranchCreationProvider(config.value.branchCreation, {
			commands: context.commands,
			git: context.git,
			...optionalGraphiteProvider(options.createGraphiteProvider),
		}),
	};
}

function optionalGraphiteProvider(
	createGraphiteProvider: BranchContextCreationContextOptions["createGraphiteProvider"],
): { createGraphiteProvider?: BranchContextCreationContextOptions["createGraphiteProvider"] } {
	return createGraphiteProvider === undefined ? {} : { createGraphiteProvider };
}

export function createSelectedBranchCreationProvider(
	mode: BuiltInBranchCreationMode,
	options: {
		commands: CommandExecApi;
		git: GitGateway;
		createGraphiteProvider?: BranchContextCreationContextOptions["createGraphiteProvider"];
	},
): BranchCreationProvider {
	if (mode === "plain-git") return new PlainGitBranchCreationProvider(options.git);
	return (
		options.createGraphiteProvider?.({ commands: options.commands, git: options.git }) ??
		new GraphiteBranchCreationProvider({
			git: options.git,
			graphite: new RealGraphiteBranchGateway(options.commands),
		})
	);
}

export function createRealBranchContextContext(
	options: BranchContextContextOptions = {},
): BranchContextContext {
	return createBranchContextContext(new NodeCommandExecApi(), options);
}

export function createRealBranchContextCreationContext(
	options: BranchContextCreationContextOptions = {},
): Promise<BranchContextCreationContext> {
	return createBranchContextCreationContext(new NodeCommandExecApi(), options);
}
