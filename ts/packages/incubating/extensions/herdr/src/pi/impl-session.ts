import {
	formatRawTextModelFailure,
	generateRawTextWithModel,
} from "@nseng-ai/extension-kit/model-slug";
import {
	loadModelPolicy,
	MODEL_OPERATION_IDS,
	resolveModelOperation,
} from "@nseng-ai/extension-kit/model-policy";
import {
	buildActiveSessionContextText,
	preflightActiveSessionSource,
} from "@nseng-ai/pi-runtime/sessions/active-context-text";
import { optionalEntries } from "@nseng-ai/foundation/primitives";
import {
	makeCommandProgressNotifier,
	registerCommandWithImmediateAck,
} from "@nseng-ai/pi-runtime/commands/ack";
import { nodeProjectConfigGateway } from "@nseng-ai/sdk/project-config/points";

import { HERDR_SESSION_SPACE_IMPL_COMMAND_NAME } from "../core/command-surfaces.ts";
import {
	buildSessionContinuationPrompt,
	handleHerdrImplSession,
	type HerdrSessionContinuationGateway,
} from "../core/impl-session.ts";
import type { HerdrPiContext } from "./context.ts";

const COMMAND_NAME = HERDR_SESSION_SPACE_IMPL_COMMAND_NAME;

export interface HerdrSessionSpaceImplRegistrationOptions {
	readonly sessionContinuation?: HerdrSessionContinuationGateway;
}

export function registerHerdrSessionSpaceImplCommand(
	context: HerdrPiContext,
	options: HerdrSessionSpaceImplRegistrationOptions = {},
): void {
	const sessionContinuation = options.sessionContinuation ?? {
		preflightSource: preflightActiveSessionSource,
		buildContextText: buildActiveSessionContextText,
	};
	registerCommandWithImmediateAck({
		host: context.commands,
		commandName: COMMAND_NAME,
		commandDefinition: {
			description:
				"Compose an implementation prompt from the active Pi session into the input box.",
			argumentHint: "[continuation-focus]",
			handler: async (args, pi) => {
				const notifyProgress = makeCommandProgressNotifier({ host: context.commands, ctx: pi });
				await handleHerdrImplSession(
					{ pi, sessionContinuation },
					{
						args,
						notifyProgress,
						composePrompt: async ({ cwd, activeContextText, steeringFocus }) => {
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
							if (!policy.ok) {
								return {
									ok: false,
									message: `Invalid model policy in ns.toml: ${policy.error.message}`,
								};
							}
							const operation = resolveModelOperation(
								policy.value,
								MODEL_OPERATION_IDS.herdrSessionContinuationFocus,
							);
							if (!operation.ok) {
								return {
									ok: false,
									message: `Invalid model policy in ns.toml: ${operation.error.message}`,
								};
							}
							const generated = await generateRawTextWithModel({
								cwd: repository.value,
								prompt: buildSessionContinuationPrompt({
									activeContextText,
									...optionalEntries({ steeringFocus }),
								}),
								modelSelection: operation.value.selection,
								exec: (command, modelArgs, execOptions) =>
									context.commands.exec(command, modelArgs, execOptions),
							});
							if (!generated.ok) {
								return { ok: false, message: formatRawTextModelFailure(generated.failure) };
							}
							return { ok: true, prompt: generated.evidence.rawOutput.trim() };
						},
					},
				);
			},
		},
		options: { delivery: "message" },
	});
}
