import type { CommandExecApi, CommandRunner, ExecOptions, ExecResult } from "@asdl/core/exec";
import { RealGitGateway } from "@asdl/core/git";
import {
	RealGithubPrGateway,
	RealSubmitGateway,
	RealSubmitMetadataGateway,
	runSubmitCommand,
	type SubmitRestackConfirmationPrompt,
} from "@asdl/core/submit";

import { RealCheckpointGateway, runCheckpointIfPending } from "../checkpoint.ts";
import { defineCommand, failed, ok, z, type ExecOptions as SdlExecOptions, type SdlContext } from "../sdk.ts";
import { maybeAppendSubmitFailureInterpretation } from "../submit-failure-interpretation.ts";

const submitSchema = z.object({
	restack: z.boolean().default(false).describe("Run gt restack before submitting when required."),
});

export const defaultSubmitCommand = defineCommand({
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

		const result = await runSubmitCommand({
			cwd: ctx.cwd,
			gateway: new RealSubmitGateway(runner),
			metadataGateway: new RealSubmitMetadataGateway(runner),
			restack: request.restack,
			prDescription: {
				githubPr: new RealGithubPrGateway(runner),
				textGeneration: ctx.model,
				git: new RealGitGateway(new SdlCommandExecApi(ctx)),
				env: ctx.env,
			},
			...(ctx.onOutput === undefined ? {} : { onOutput: ctx.onOutput }),
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
});

function createSdlCommandRunner(ctx: SdlContext): CommandRunner {
	return async (command, args, options) => {
		const cwdError = validateSdlExecCwd(ctx, options);
		if (cwdError !== undefined) return cwdError;
		return ctx.exec(command, [...args], convertExecOptions(options));
	};
}

function convertExecOptions(options: ExecOptions | undefined): SdlExecOptions | undefined {
	if (options === undefined) return undefined;
	return {
		...(options.timeout === undefined ? {} : { timeoutMs: options.timeout }),
		...(options.onStdout === undefined ? {} : { onStdout: options.onStdout }),
		...(options.onStderr === undefined ? {} : { onStderr: options.onStderr }),
	};
}

class SdlCommandExecApi implements CommandExecApi {
	private readonly ctx: SdlContext;

	constructor(ctx: SdlContext) {
		this.ctx = ctx;
	}

	async exec(command: string, args: string[], options: ExecOptions = {}): Promise<ExecResult> {
		const cwdError = validateSdlExecCwd(this.ctx, options);
		if (cwdError !== undefined) return cwdError;
		return this.ctx.exec(command, args, convertExecOptions(options));
	}
}

function validateSdlExecCwd(ctx: SdlContext, options: ExecOptions | undefined): ExecResult | undefined {
	if (options?.cwd === undefined || options.cwd === ctx.cwd) return undefined;
	return {
		code: 2,
		stdout: "",
		stderr: `SDL command execution is scoped to ${ctx.cwd}; refusing command cwd ${options.cwd}.`,
		killed: false,
	};
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
