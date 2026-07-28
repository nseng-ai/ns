import {
	formatRawTextModelFailure,
	generateRawTextWithModel,
} from "@nseng-ai/extension-kit/model-slug";
import {
	loadModelPolicy,
	MODEL_OPERATION_IDS,
	resolveModelOperation,
} from "@nseng-ai/extension-kit/model-policy";
import { cloneActiveBranchSession } from "@nseng-ai/pi-runtime/sessions/active-branch-clone";
import {
	buildActiveSessionContextText,
	preflightActiveSessionSource,
} from "@nseng-ai/pi-runtime/sessions/active-context-text";
import {
	makeCommandProgressNotifier,
	registerCommandWithImmediateAck,
} from "@nseng-ai/pi-runtime/commands/ack";
import { nodeProjectConfigGateway } from "@nseng-ai/sdk/project-config/points";
import type { SlotClient } from "@nseng-ai/slots/api";

import { HERDR_SESSION_SPACE_IMPL_COMMAND_NAME } from "../core/command-surfaces.ts";
import {
	buildSessionContinuationFocusPrompt,
	handleHerdrImplSession,
	type HerdrSessionContinuationGateway,
} from "../core/impl-session.ts";
import { createHerdrPiCommandContext, type HerdrPiContext } from "./context.ts";

const COMMAND_NAME = HERDR_SESSION_SPACE_IMPL_COMMAND_NAME;

export interface HerdrSessionSpaceImplRegistrationOptions {
	readonly slotClient?: SlotClient;
	readonly sessionContinuation?: HerdrSessionContinuationGateway;
}

export function registerHerdrSessionSpaceImplCommand(
	context: HerdrPiContext,
	options: HerdrSessionSpaceImplRegistrationOptions = {},
): void {
	const sessionContinuation = options.sessionContinuation ?? createRealSessionContinuationGateway();
	registerCommandWithImmediateAck({
		host: context.commands,
		commandName: COMMAND_NAME,
		commandDefinition: {
			description: "Continue the active Pi session in a new implementation space.",
			argumentHint: "[continuation-focus]",
			handler: async (args, pi) => {
				const notifyProgress = makeCommandProgressNotifier({ host: context.commands, ctx: pi });
				await handleHerdrImplSession(
					{ ...createHerdrPiCommandContext(context, pi), sessionContinuation },
					{
						args,
						notifyProgress,
						...(options.slotClient === undefined ? {} : { slotClient: options.slotClient }),
						deriveFocus: async ({ cwd, activeContextText }) => {
							const repository = await context.git.optionalRepoRoot({ cwd });
							if (repository.type !== "found") {
								return {
									ok: false,
									message: "Could not determine the repository root for ns.toml.",
								};
							}
							const policy = loadModelPolicy({
								repoRoot: repository.value,
								gateway: nodeProjectConfigGateway,
							});
							if (!policy.ok) return { ok: false, message: policy.error.message };
							const operation = resolveModelOperation(
								policy.value,
								MODEL_OPERATION_IDS.herdrSessionContinuationFocus,
							);
							if (!operation.ok) return { ok: false, message: operation.error.message };
							const generated = await generateRawTextWithModel({
								cwd: repository.value,
								prompt: buildSessionContinuationFocusPrompt(activeContextText),
								modelSelection: operation.value.selection,
								exec: (command, modelArgs, execOptions) =>
									context.commands.exec(command, modelArgs, execOptions),
							});
							if (!generated.ok) {
								return { ok: false, message: formatRawTextModelFailure(generated.failure) };
							}
							return { ok: true, focus: generated.evidence.rawOutput.trim() };
						},
					},
				);
			},
		},
		options: { delivery: "message" },
	});
}

function createRealSessionContinuationGateway(): HerdrSessionContinuationGateway {
	return {
		preflightSource: preflightActiveSessionSource,
		buildContextText: buildActiveSessionContextText,
		async cloneActiveSessionForImplementation(request) {
			return cloneActiveBranchSession({
				sourceSessionFile: request.sourceSessionFile,
				sourceLeafId: request.sourceLeafId,
				destinationCwd: request.destinationCwd,
				appendedUserTurn: request.continuationMessage,
			});
		},
	};
}
