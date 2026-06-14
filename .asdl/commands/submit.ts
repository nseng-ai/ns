import type { CommandExecApi, CommandRunner, ExecOptions, ExecResult } from "@asdl/core/exec";
import { RealGitGateway } from "@asdl/core/git";
import {
	RealGithubPrGateway,
	RealSubmitGateway,
	RealSubmitMetadataGateway,
	runSubmitCommand,
	type SubmitRestackConfirmationPrompt,
} from "@asdl/core/submit";
import { RealCheckpointGateway, runCheckpointIfPending } from "@asdl/sdl/checkpoint";
import { defineCommand, failed, ok, type ExecOptions as SdlExecOptions, type SdlContext } from "@asdl/sdl/sdk";
import { z } from "zod";

const submitSchema = z.object({
	restack: z.boolean().default(false).describe("Run gt restack before submitting when required."),
});

export default defineCommand({
	name: "submit",
	description: `Checkpoint outstanding changes, then submit the current Graphite stack with gt submit -nps --no-ai --no-interactive.

Environment:
  ASDL_DEV_PR_DESCRIPTION_MODEL   Model reference for generated PR descriptions.
  ASDL_DEV_PR_DESCRIPTION_PROMPT  Optional path to a custom PR description prompt.

The command owns its output and exit code. It does not support --format.`,
	schema: submitSchema,
	async run(ctx, request) {
		const runner = createSdlCommandRunner(ctx);
		const checkpoint = await runCheckpointIfPending({
			cwd: ctx.cwd,
			env: ctx.env,
			gateway: new RealCheckpointGateway(runner),
			textGeneration: ctx.model,
		});
		if (checkpoint.kind === "failed") {
			ctx.stderr?.(formatCheckpointBeforeSubmitFailure(checkpoint.output.stderr));
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
		writeCommandResultOutput(result, ctx);
		return result.exitCode === 0 ? ok("") : failed("", result.exitCode);
	},
});

function createSdlCommandRunner(ctx: SdlContext): CommandRunner {
	return (command, args, options) => ctx.exec(command, args, convertExecOptions(options));
}

function convertExecOptions(options: Parameters<CommandRunner>[2]): SdlExecOptions | undefined {
	if (options?.timeout === undefined) return undefined;
	return { timeoutMs: options.timeout };
}

class SdlCommandExecApi implements CommandExecApi {
	private readonly ctx: SdlContext;

	constructor(ctx: SdlContext) {
		this.ctx = ctx;
	}

	async exec(command: string, args: string[], options: ExecOptions): Promise<ExecResult> {
		return this.ctx.exec(command, args, { timeoutMs: options.timeout });
	}
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
