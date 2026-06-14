import { runCheckpointIfPending } from "@asdl/sdl/checkpoint";

import type { AsdlDevContext } from "./context.ts";
import { runSubmitCommand, type SubmitOutputListener, type SubmitRestackConfirmationPrompt } from "./submit.ts";

export type SubmitCliConfirmPrompt = (title: string, message: string) => Promise<boolean> | boolean;

export interface RunSubmitCliCommandOptions {
	context: AsdlDevContext;
	cwd: string;
	env: Record<string, string | undefined>;
	restack: boolean;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
	onOutput?: SubmitOutputListener | undefined;
	confirm?: SubmitCliConfirmPrompt | undefined;
}

export async function runSubmitCliCommand(options: RunSubmitCliCommandOptions): Promise<number> {
	const checkpoint = await runCheckpointIfPending({
		cwd: options.cwd,
		env: options.env,
		gateway: options.context.checkpoint,
		textGeneration: options.context.textGeneration,
	});
	if (checkpoint.kind === "failed") {
		options.stderr(formatCheckpointBeforeSubmitFailure(checkpoint.output.stderr));
		return checkpoint.output.exitCode;
	}
	if (checkpoint.kind === "checkpointed") {
		writeCommandResultOutput(checkpoint.output, options);
	}

	const result = await runSubmitCommand({
		cwd: options.cwd,
		gateway: options.context.submit,
		metadataGateway: options.context.submitMetadata,
		restack: options.restack,
		prDescription: {
			githubPr: options.context.githubPr,
			textGeneration: options.context.textGeneration,
			git: options.context.git,
			env: options.env,
		},
		...(options.onOutput === undefined ? {} : { onOutput: options.onOutput }),
		...(options.confirm === undefined
			? {}
			: {
					confirmRestack: (prompt: SubmitRestackConfirmationPrompt) => options.confirm?.(prompt.title, prompt.message) ?? false,
				}),
	});
	writeCommandResultOutput(result, options);
	return result.exitCode;
}

function writeCommandResultOutput(result: { stdout: string; stderr: string }, deps: Pick<RunSubmitCliCommandOptions, "stdout" | "stderr">): void {
	if (result.stdout !== "") {
		deps.stdout(result.stdout);
	}
	if (result.stderr !== "") {
		deps.stderr(result.stderr);
	}
}

function formatCheckpointBeforeSubmitFailure(stderr: string): string {
	const trimmed = stderr.trimEnd();
	const message = trimmed === "" ? "Checkpoint before submit failed. Submission was not attempted." : `Checkpoint before submit failed. Submission was not attempted.\n\n${trimmed}`;
	return `${message}\n`;
}
