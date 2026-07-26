import { nsCommandSurface } from "@nseng-ai/foundation/command";
import type { CommandExecApi } from "@nseng-ai/foundation/exec";
import { RealGitGateway } from "@nseng-ai/foundation/git";
import {
	buildFlowSubmitCheckRecoveryMessage,
	hasFlowSubmitCheckFailureMarker,
	nodeSubmitCheckRecoveryPromptGateway,
	resolveFlowSubmitRecoveryPrompt,
	resolveFlowSubmitRecoveryRepositoryRoot,
	type FlowSubmitRecoveryGitGateway,
	type SubmitCheckRecoveryPromptGateway,
} from "../submit/submit-check-recovery.ts";
import { SQUASH_STACK_COMMAND_SUMMARY } from "../ns/commands/squash-stack.ts";
import { flowExtensionDescriptorSource } from "../ns/extension.ts";

import {
	registerCliCommandExtension,
	type CliCommandExtensionAPI,
	type CliCommandExtensionSpec,
} from "@nseng-ai/pi-runtime/commands/cli-extension";
import { definePiSurfaceParity } from "@nseng-ai/pi-runtime/parity/extension";

export interface NsExtensionAPI extends CliCommandExtensionAPI, CommandExecApi {
	sendUserMessage(content: string): Promise<void> | void;
}

interface FlowCommandInfo {
	name: string;
	description: string;
	group: "flow";
	argvPrefix: readonly ["flow", string];
	displayName: string;
}

function flowCommand(name: string, description: string): FlowCommandInfo {
	return {
		name,
		description,
		group: "flow",
		argvPrefix: ["flow", name],
		displayName: `flow ${name}`,
	};
}

const NS_FLOW_COMMANDS = [
	flowCommand("changes", "Summarize outstanding worktree changes without committing."),
	flowCommand("cp", "Create a checkpoint commit for the current diff."),
	flowCommand("autobranch", "Create a Graphite branch from dirty worktree changes."),
	flowCommand(
		"branch-latest-commit",
		"Move the latest eligible commit to a new Graphite child branch.",
	),
	flowCommand(
		"autoslot",
		"Create a Graphite branch from current work, then move it into a managed slot worktree.",
	),
	flowCommand("submit", "Checkpoint outstanding changes, then submit the current Graphite stack."),
	flowCommand(
		"generate-pr-inventory",
		"Generate and replace the current branch PR title and body.",
	),
	flowCommand("push", "Push committed non-Graphite branch work with git push."),
	flowCommand("land", "Land the current PR or Graphite stack into trunk."),
	flowCommand(
		"pull-trunk",
		"Pull the configured Graphite trunk branch without running full gt sync.",
	),
	flowCommand("squash-stack", SQUASH_STACK_COMMAND_SUMMARY),
] as const satisfies readonly FlowCommandInfo[];

export function nsFlowCommandSurface(name: string): string {
	if (!NS_FLOW_COMMANDS.some((command) => command.name === name)) {
		throw new Error(`Unknown ns flow command: ${name}`);
	}
	return nsCommandSurface("flow", name);
}

export const nsExtensionParity = definePiSurfaceParity(
	NS_FLOW_COMMANDS.map((command) => ({
		kind: "command" as const,
		surface: nsFlowCommandSurface(command.name),
		workflow: command.description.replace(/\.$/, ""),
		parity: "FULL" as const,
		cli: `ns ${command.displayName}`,
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@nseng-ai/flow/pi" as const,
		sourceModule: "ns-extension",
		notes: `Pi command delegates to ns ${command.displayName} through registerCliCommandExtension; flat lifecycle mirrors are intentionally not registered.`,
	})),
);

export interface NsExtensionOptions {
	/** Explicit host-composed ns CLI runner. */
	runCli: CliCommandExtensionSpec["runCli"];
	/** Host-composed recovery prompt boundary; defaults to the real Node filesystem adapter. */
	recoveryPromptGateway?: SubmitCheckRecoveryPromptGateway;
	/** Host-composed recovery Git consumer; defaults to Git over the Pi exec channel. */
	recoveryGit?: FlowSubmitRecoveryGitGateway;
}

export default function nsExtension(pi: NsExtensionAPI, options: NsExtensionOptions): void {
	const recoveryPromptGateway =
		options.recoveryPromptGateway ?? nodeSubmitCheckRecoveryPromptGateway;
	const recoveryGit = options.recoveryGit ?? new RealGitGateway(pi);
	registerCliCommandExtension(pi, {
		cliName: "ns",
		piNamespace: "ns:flow",
		commands: NS_FLOW_COMMANDS,
		runCli: options.runCli,
		afterCommandComplete: async (details) => {
			if (details.piCommandName !== nsFlowCommandSurface("submit")) return;
			if (details.exitCode === 0) return;
			if (!hasFlowSubmitCheckFailureMarker(details.stderr)) return;

			const repoRoot = await resolveFlowSubmitRecoveryRepositoryRoot({
				cwd: details.cwd,
				git: recoveryGit,
			});
			if (!repoRoot.ok) throw flowSubmitRecoveryError(repoRoot.error);

			const prompt = resolveFlowSubmitRecoveryPrompt({
				repoRoot: repoRoot.repoRoot,
				gateway: recoveryPromptGateway,
				descriptorSource: flowExtensionDescriptorSource,
			});
			if (!prompt.ok) throw flowSubmitRecoveryError(prompt.error);

			await pi.sendUserMessage(buildFlowSubmitCheckRecoveryMessage(details, prompt.prompt));
		},
	});
}

function flowSubmitRecoveryError(message: string): Error {
	return new Error(`Could not start flow submit-check recovery: ${message}`);
}
