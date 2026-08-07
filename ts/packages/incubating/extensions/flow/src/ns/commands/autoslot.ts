import type { SlotClient } from "@nseng-ai/slots/api";
import { defineCommand, failure, negative, ok, z, type NsCommand } from "@nseng-ai/sdk";
import { commandIoFromNsExtensionApi, runWithNsCommandIo } from "@nseng-ai/sdk/command-io";

import { createAutoslotFlow, type AutoslotWorkflowResult } from "../../autoslot/autoslot.ts";
import { renderAutoslotResult } from "../../autoslot/presentation.ts";
import { createFlowSlotClient } from "../../autoslot/slot-checkout.ts";
import {
	commitAutobranchCheckpointMessage,
	prepareAutobranchCheckpointMessage,
} from "../../autobranch/checkpoint.ts";
import { resolveFlowStreamCaps } from "../../phase-stream/phase-stream.ts";
import { MODEL_OPERATION_IDS } from "@nseng-ai/extension-kit/model-policy";
import { resolveThemeCaps } from "@nseng-ai/foundation/cli-theme";
import { resolveFlowModelSelection } from "../model-policy.ts";
import { FLOW_COMMAND_FAILED } from "../flow-cli-runner.ts";

const autoslotSchema = z.object({
	slug: z
		.string()
		.optional()
		.describe("Branch slug to use instead of deriving one from the worktree or latest commit."),
});

const autoslotSuccessSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("branch-created-slot-skipped"),
		cwd: z.string(),
		branchName: z.string(),
		warnings: z.array(z.string()),
		reason: z.literal("worktree-not-clean"),
	}),
	z.object({
		type: z.literal("moved"),
		cwd: z.string(),
		branchName: z.string(),
		slotName: z.string(),
		worktreePath: z.string(),
		warnings: z.array(z.string()),
		navigationCommand: z.string(),
	}),
]);

export interface FlowAutoslotCommandDependencies {
	createSlotClient(options: { cwd: string; env: Record<string, string | undefined> }): SlotClient;
}

export function createFlowAutoslotCommand(
	dependencies: FlowAutoslotCommandDependencies,
): NsCommand<typeof autoslotSchema> {
	return defineCommand({
		schema: autoslotSchema,
		resultSchema: autoslotSuccessSchema,
		options: { slug: { short: "-s" } },
		renderHuman: (result, caps) => renderAutoslotResult(resolveThemeCaps(caps), result),
		handler: async (ctx, request) => {
			const caps = resolveFlowStreamCaps(ctx);
			const model = await resolveFlowModelSelection(ctx, MODEL_OPERATION_IDS.flowCheckpoint);
			if (!model.ok) return failure(FLOW_COMMAND_FAILED, model.error);
			const io = commandIoFromNsExtensionApi(ctx);
			return await runWithNsCommandIo(io, async (io) => {
				const result = await createAutoslotFlow({
					cwd: ctx.cwd,
					modelSelection: model.modelSelection,
					args: request.slug === undefined ? {} : { slug: request.slug },
					exec: (command, args, timeout) =>
						ctx.exec(command, args, { cwd: ctx.cwd, timeoutMs: timeout }),
					prepareCheckpointMessage: (snapshot) =>
						prepareAutobranchCheckpointMessage(snapshot, model.modelSelection, ctx.textGenerator),
					commitPreparedCheckpointMessage: (message) =>
						commitAutobranchCheckpointMessage(
							(command, args, cwd, timeout) => ctx.exec(command, args, { cwd, timeoutMs: timeout }),
							ctx.cwd,
							message,
						),
					io,
					slotClient: dependencies.createSlotClient({ cwd: ctx.cwd, env: ctx.env }),
				});
				return autoslotCommandExit(caps, result);
			});
		},
	});
}

function autoslotCommandExit(
	caps: Parameters<typeof renderAutoslotResult>[0],
	result: AutoslotWorkflowResult,
) {
	const human = renderAutoslotResult(caps, result);
	switch (result.type) {
		case "refused":
			return negative(human, { data: result });
		case "failed":
			return failure(FLOW_COMMAND_FAILED, human, result);
		case "branch-created-slot-skipped":
		case "moved":
			return ok(result);
		case "branch-created-slot-failed":
			return failure(FLOW_COMMAND_FAILED, human, result);
	}
}

export const flowAutoslotCommand = createFlowAutoslotCommand({
	createSlotClient: createFlowSlotClient,
});

export default flowAutoslotCommand;
