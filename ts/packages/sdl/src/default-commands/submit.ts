import { RealGitGateway } from "@asdl/core/git";
import {
	RealGithubPrGateway,
	RealSubmitGateway,
	RealSubmitMetadataGateway,
	runSubmitCommand,
	type SubmitRestackConfirmationPrompt,
} from "@asdl/core/submit";

import { RealCheckpointGateway, runCheckpointIfPending } from "../checkpoint.ts";
import { failed, ok, z, type SdlCommand, type SdlContext } from "../sdk.ts";
import { maybeAppendSubmitFailureInterpretation } from "../submit-failure-interpretation.ts";
import { createSdlCommandRunner, SdlCommandExecApi } from "./command-runner.ts";

const submitSchema = z.object({
	restack: z.boolean().default(false).describe("Run gt restack before submitting when required."),
	verbose: z.boolean().default(false).describe("Stream raw Graphite/subprocess output while submitting."),
});

export const defaultSubmitCommand = {
	name: "submit",
	description: `Checkpoint outstanding changes, then submit the current Graphite stack with gt submit -nps --no-ai --no-interactive.

Environment:
  ASDL_DEV_PR_DESCRIPTION_MODEL   Model reference for generated PR descriptions.
  ASDL_DEV_PR_DESCRIPTION_PROMPT  Optional path to a custom PR description prompt.

  SDL_SUBMIT_FAILURE_MODEL     Model reference for interpreting failed submit output.

The command owns its output and exit code. It does not support --format.`,
	schema: submitSchema,
	async run(ctx: SdlContext, request: z.output<typeof submitSchema>) {
		const runner = createSdlCommandRunner(ctx);
		const liveOutput = createSubmitLiveOutput(ctx);
		emitSubmitProgress(liveOutput, "sdl submit");
		emitSubmitProgress(liveOutput, "• Checking worktree and checkpointing pending changes if needed…");
		const checkpoint = await runCheckpointIfPending({
			cwd: ctx.cwd,
			env: ctx.env,
			gateway: new RealCheckpointGateway(runner),
			textGeneration: ctx.model,
		});
		if (checkpoint.kind === "failed") {
			const checkpointFailure = await maybeAppendSubmitFailureInterpretation(
				{ stdout: "", stderr: formatCheckpointBeforeSubmitFailure(checkpoint.output.stderr), exitCode: checkpoint.output.exitCode },
				ctx,
			);
			ctx.stderr?.(checkpointFailure.stderr);
			return failed("", checkpoint.output.exitCode);
		}
		if (checkpoint.kind === "checkpointed") {
			writeCommandResultOutput(checkpoint.output, ctx);
		}
		emitSubmitProgress(liveOutput, "✓ Checkpoint phase complete");

		const result = await runSubmitCommand({
			cwd: ctx.cwd,
			gateway: new RealSubmitGateway(runner),
			metadataGateway: new RealSubmitMetadataGateway(runner),
			restack: request.restack,
			shouldForwardCommandOutput: request.verbose,
			prDescription: {
				githubPr: new RealGithubPrGateway(runner),
				textGeneration: ctx.model,
				git: new RealGitGateway(new SdlCommandExecApi(ctx)),
				env: ctx.env,
			},
			...(liveOutput === undefined ? {} : { onOutput: liveOutput }),
			...(ctx.confirm === undefined
				? {}
				: {
						confirmRestack: (prompt: SubmitRestackConfirmationPrompt) => ctx.confirm?.(prompt.title, prompt.message) ?? false,
					}),
		});
		const interpretedResult = await maybeAppendSubmitFailureInterpretation(result, ctx);
		writeCommandResultOutput(interpretedResult, ctx);
		return interpretedResult.exitCode === 0 ? ok("") : failed("", interpretedResult.exitCode);
	},
} satisfies SdlCommand<typeof submitSchema>;

function createSubmitLiveOutput(ctx: Pick<SdlContext, "onOutput" | "stdout" | "stderr">): ((stream: "stdout" | "stderr", text: string) => void) | undefined {
	if (ctx.onOutput !== undefined) return ctx.onOutput;
	if (ctx.stdout === undefined && ctx.stderr === undefined) return undefined;
	return (stream, text) => {
		if (stream === "stdout") {
			ctx.stdout?.(text);
			return;
		}
		ctx.stderr?.(text);
	};
}

function emitSubmitProgress(liveOutput: ((stream: "stdout" | "stderr", text: string) => void) | undefined, message: string): void {
	liveOutput?.("stderr", `${message}\n`);
}

function writeCommandResultOutput(result: { stdout: string; stderr: string }, ctx: Pick<SdlContext, "stdout" | "stderr">): void {
	if (result.stdout !== "") {
		ctx.stdout?.(result.stdout);
	}
	if (result.stderr !== "") {
		ctx.stderr?.(result.stderr);
	}
}

function formatCheckpointBeforeSubmitFailure(stderr: string): string {
	const trimmed = stderr.trimEnd();
	const message = trimmed === "" ? "Checkpoint before submit failed. Submission was not attempted." : `Checkpoint before submit failed. Submission was not attempted.\n\n${trimmed}`;
	return `${message}\n`;
}
