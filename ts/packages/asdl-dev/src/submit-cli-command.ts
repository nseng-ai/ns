import { runCheckpointIfPending } from "@asdl/sdl/checkpoint";
import type { SdlContext } from "@asdl/sdl/sdk";

import type { AsdlDevContext } from "./context.ts";
import { writeCommandResultOutput } from "./output.ts";
import { runSubmitCommand, type SubmitRestackConfirmationPrompt } from "./submit.ts";

export interface SubmitCliRunDeps extends Pick<SdlContext, "cwd" | "env" | "onOutput" | "confirm"> {
	stdout: NonNullable<SdlContext["stdout"]>;
	stderr: NonNullable<SdlContext["stderr"]>;
}

export interface RunSubmitCliCommandOptions {
	context: AsdlDevContext;
	runDeps: SubmitCliRunDeps;
	restack: boolean;
}

export async function runSubmitCliCommand(options: RunSubmitCliCommandOptions): Promise<number> {
	const checkpoint = await runCheckpointIfPending({
		cwd: options.runDeps.cwd,
		env: options.runDeps.env,
		gateway: options.context.checkpoint,
		textGeneration: options.context.textGeneration,
	});
	if (checkpoint.kind === "failed") {
		options.runDeps.stderr(formatCheckpointBeforeSubmitFailure(checkpoint.output.stderr));
		return checkpoint.output.exitCode;
	}
	if (checkpoint.kind === "checkpointed") {
		writeCommandResultOutput(checkpoint.output, options.runDeps);
	}

	const result = await runSubmitCommand({
		cwd: options.runDeps.cwd,
		gateway: options.context.submit,
		metadataGateway: options.context.submitMetadata,
		restack: options.restack,
		prDescription: {
			githubPr: options.context.githubPr,
			textGeneration: options.context.textGeneration,
			git: options.context.git,
			env: options.runDeps.env,
		},
		...(options.runDeps.onOutput === undefined ? {} : { onOutput: options.runDeps.onOutput }),
		...(options.runDeps.confirm === undefined
			? {}
			: {
					confirmRestack: (prompt: SubmitRestackConfirmationPrompt) => options.runDeps.confirm?.(prompt.title, prompt.message) ?? false,
				}),
	});
	writeCommandResultOutput(result, options.runDeps);
	return result.exitCode;
}

function formatCheckpointBeforeSubmitFailure(stderr: string): string {
	const trimmed = stderr.trimEnd();
	const message = trimmed === "" ? "Checkpoint before submit failed. Submission was not attempted." : `Checkpoint before submit failed. Submission was not attempted.\n\n${trimmed}`;
	return `${message}\n`;
}
