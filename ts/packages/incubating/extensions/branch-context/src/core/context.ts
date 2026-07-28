import { RealGitBrmemGateway, type BrmemGateway } from "@nseng-ai/brmem";
import { NodeCommandExecApi } from "@nseng-ai/foundation/exec";
import type { CommandExecApi, StdinCapableCommandExecApi } from "@nseng-ai/foundation/exec";
import { RealGitGateway } from "@nseng-ai/foundation/git";
import type { GitGateway } from "@nseng-ai/foundation/git";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import {
	nodeRepositoryTrunkConfigLoader,
	resolveRepositoryTrunk,
	type RepositoryTrunkResult,
} from "@nseng-ai/extension-kit/repository-trunk";
import {
	RealGraphiteBranchGateway,
	type GraphiteBranchGateway,
} from "@nseng-ai/extension-kit/graphite/branch";

export interface BranchContextContext {
	commands: CommandExecApi;
	git: GitGateway;
	brmem: BrmemGateway;
	graphite: GraphiteBranchGateway;
	resolveRepositoryTrunk?(repoRoot: string, signal?: AbortSignal): Promise<RepositoryTrunkResult>;
}

export interface BranchContextContextOptions {
	cwd?: string;
	brmemCommands?: StdinCapableCommandExecApi;
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
	return {
		commands,
		git,
		brmem,
		graphite: new RealGraphiteBranchGateway(commands),
		resolveRepositoryTrunk: async (repoRoot, signal) =>
			await resolveRepositoryTrunk({
				repoRoot,
				git,
				config: nodeRepositoryTrunkConfigLoader,
				...optionalEntry("signal", signal),
			}),
	};
}

export function createRealBranchContextContext(
	options: BranchContextContextOptions = {},
): BranchContextContext {
	return createBranchContextContext(new NodeCommandExecApi(), options);
}
