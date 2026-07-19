import type { CommandRunner } from "@nseng-ai/foundation/exec";
import { RealGitGateway, type GitGateway } from "@nseng-ai/foundation/git";

import { RealGraphiteBranchGateway, type GraphiteBranchGateway } from "../graphite/branch.ts";
import type { TextGenerator } from "./text-generation.ts";

export interface FirstPartyCommandContext {
	readonly env: Record<string, string | undefined>;
	readonly textGenerator: TextGenerator;
	readonly commandRunner: CommandRunner;
	readonly git: GitGateway;
	readonly graphiteBranch: GraphiteBranchGateway;
}

export interface CreateRealFirstPartyCommandContextOptions {
	readonly env: Record<string, string | undefined>;
	readonly textGenerator: TextGenerator;
	readonly commandRunner: CommandRunner;
	readonly git?: GitGateway;
	readonly graphiteBranch?: GraphiteBranchGateway;
}

export function createRealFirstPartyCommandContext(
	options: CreateRealFirstPartyCommandContextOptions,
): FirstPartyCommandContext {
	const commandExec = {
		exec: (command: string, args: string[], execOptions = {}) =>
			options.commandRunner(command, args, execOptions),
	};
	return {
		env: options.env,
		textGenerator: options.textGenerator,
		commandRunner: options.commandRunner,
		git: options.git ?? new RealGitGateway(commandExec),
		graphiteBranch: options.graphiteBranch ?? new RealGraphiteBranchGateway(commandExec),
	};
}
