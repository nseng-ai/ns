import {
	createCommitWithPreparedMessage,
	prepareCheckpointMessage,
	type PreparedCheckpointMessage,
} from "../checkpoint-flow.ts";
import type { SdlExtensionApi } from "./execution.ts";
import type { TextGenerator } from "./text-generation.ts";

export type SdkPreparedCheckpointMessage = PreparedCheckpointMessage;

export interface PrepareCheckpointMessageOptions {
	readonly status: string;
	readonly diff: string;
	readonly textGenerator: TextGenerator;
	readonly modelRef: string;
}

export const checkpoint = {
	prepareMessage,
	createCommit,
};

async function prepareMessage(
	options: PrepareCheckpointMessageOptions,
): Promise<SdkPreparedCheckpointMessage> {
	return await prepareCheckpointMessage(options);
}

async function createCommit(
	ctx: SdlExtensionApi,
	message: string,
): Promise<{ readonly summary: string } | { readonly error: string }> {
	return await createCommitWithPreparedMessage({
		cwd: ctx.cwd,
		message,
		exec: async (command, args, _cwd, timeoutMs) => await ctx.exec(command, args, { timeoutMs }),
	});
}
