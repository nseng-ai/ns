import {
	formatOutputSection,
	tailText,
	type CommandExecApi,
	type ExecResult,
} from "@nseng-ai/foundation/exec";
import { optionalEntries } from "@nseng-ai/foundation/primitives";

const COMMAND_OUTPUT_MAX_CHARS = 4_000;
const COMMAND_OUTPUT_MAX_LINES = 30;

import { createFlowGraphiteStackGateway } from "../stack-squash/graphite-stack-gateway.ts";
import {
	describeStackSquashOutcome,
	formatStackSquashSummary,
	runStackSquashFlow,
	stackSquashCommandFailureDetail,
	type StackSquashCommandFailure,
	type StackSquashGraphiteGateway,
} from "../stack-squash/stack-squash.ts";

export type FlowStackSquashPresentation =
	| { type: "info"; message: string }
	| { type: "error"; message: string };

export interface RunFlowStackSquashOptions {
	execApi: CommandExecApi;
	cwd: string;
	env: NodeJS.ProcessEnv;
	onProgress?: (message: string) => void;
}

interface FlowStackSquashContext {
	commands: CommandExecApi;
	graphite: StackSquashGraphiteGateway;
}

export async function runFlowStackSquash(
	options: RunFlowStackSquashOptions,
): Promise<FlowStackSquashPresentation> {
	return await runFlowStackSquashWithContext(
		{
			commands: options.execApi,
			graphite: createFlowGraphiteStackGateway({ execApi: options.execApi, env: options.env }),
		},
		options,
	);
}

/** Internal fake-driven seam; intentionally omitted from the curated Flow API barrel. */
export async function runFlowStackSquashWithContext(
	context: FlowStackSquashContext,
	options: Pick<RunFlowStackSquashOptions, "cwd" | "onProgress">,
): Promise<FlowStackSquashPresentation> {
	const outcome = await runStackSquashFlow(context.commands, context.graphite, {
		cwd: options.cwd,
		...optionalEntries({ onProgress: options.onProgress }),
	});

	switch (outcome.kind) {
		case "success":
			return { type: "info", message: formatStackSquashSummary(outcome.processed) };
		case "worktree-dirty":
			return {
				type: "error",
				message: `${describeStackSquashOutcome(outcome)}\n\n${outcome.status}`,
			};
		case "empty-stack":
			return { type: "info", message: describeStackSquashOutcome(outcome) };
		case "worktree-probe-failed":
		case "stack-discovery-failed":
		case "commit-count-failed":
		case "checkout-failed":
		case "squash-failed":
		case "tip-restore-failed": {
			const message = describeStackSquashOutcome(outcome);
			const failure = stackSquashCommandFailureDetail(outcome);
			return {
				type: "error",
				message: failure === undefined ? message : formatFailureMessage(message, failure),
			};
		}
	}
}

function formatFailureMessage(message: string, failure: StackSquashCommandFailure): string {
	return [message, formatCommandOutput(failure.execResult)]
		.filter((part) => part.length > 0)
		.join("\n\n");
}

function formatCommandOutput(result: ExecResult): string {
	const tailOptions = {
		maxChars: COMMAND_OUTPUT_MAX_CHARS,
		maxLines: COMMAND_OUTPUT_MAX_LINES,
	};
	const parts: string[] = [];
	if (result.stdout.trim().length > 0) {
		parts.push(formatOutputSection("stdout", result.stdout, tailOptions));
	}
	if (result.stderr.trim().length > 0) {
		parts.push(formatOutputSection("stderr", result.stderr, tailOptions));
	}
	if (result.type === "spawn-failed" && result.error.length > 0) {
		parts.push(`startup error:\n${tailText(result.error.trimEnd(), tailOptions)}`);
	}
	return parts.join("\n\n");
}
