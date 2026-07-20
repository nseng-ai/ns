import { PiTextGenerator } from "@nseng-ai/capability-kit/pi-text-generation";
import {
	RealGraphiteBranchGateway,
	type GraphiteBranchGateway,
} from "@nseng-ai/capability-kit/graphite/branch";
import type { TextGenerator } from "@nseng-ai/capability-kit/text-generation";
import { runCommand, type CommandRunner } from "@nseng-ai/foundation/exec";
import { RealGitGateway, type GitGateway } from "@nseng-ai/foundation/git";

export interface FlowCommandContext {
	readonly commandRunner: CommandRunner;
	readonly git: GitGateway;
	readonly graphiteBranch: GraphiteBranchGateway;
	readonly textGenerator: TextGenerator;
}

export interface CreateRealFlowCommandContextOptions {
	readonly textGenerator?: TextGenerator;
	readonly commandRunner?: CommandRunner;
}

export function createRealFlowCommandContext(
	options: CreateRealFlowCommandContextOptions = {},
): FlowCommandContext {
	const commandRunner: CommandRunner =
		options.commandRunner ??
		(async (command, args, commandOptions) => await runCommand(command, args, commandOptions));
	const commandExec = {
		exec: (command: string, args: string[], options = {}) => commandRunner(command, args, options),
	};
	return {
		commandRunner,
		git: new RealGitGateway(commandExec),
		graphiteBranch: new RealGraphiteBranchGateway(commandExec),
		textGenerator: options.textGenerator ?? new PiTextGenerator(),
	};
}
