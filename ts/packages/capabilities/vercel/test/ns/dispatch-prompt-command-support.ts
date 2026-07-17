import { noopNsProgress } from "@nseng-ai/sdk";
import type {
	ExecResult,
	NsCommandIo,
	NsExtensionApi,
	TextGenerationRequest,
	TextGenerationResult,
} from "@nseng-ai/sdk";

import type { DispatchPromptRequest } from "../../src/dispatch-client/prompt-core.ts";
import type { DispatchPromptOutcome } from "../../src/dispatch-client/outcome.ts";
import { createDispatchPromptCommand } from "../../src/ns/commands/prompt.ts";
import {
	createFakeDispatchGateways,
	FAKE_ANCHOR_TIMESTAMP,
	FAKE_HEAD_SHA,
	FAKE_RUN_ID,
	FAKE_SEMANTIC_SLUG,
	FAKE_WORKFLOW_RUN_URL,
} from "../dispatch-client/support/dispatch-prompt-fakes.ts";

export const PROMPT = "Rename the widget gateway methods to match the command-shape convention";
export const EXPECTED_ANCHOR_BRANCH = `dispatch/${FAKE_SEMANTIC_SLUG}-${FAKE_ANCHOR_TIMESTAMP}`;

export const DISPATCHED_OUTCOME = {
	status: "dispatched",
	revision: FAKE_HEAD_SHA,
	sourceBranch: "feature/widgets",
	workflowRunUrl: FAKE_WORKFLOW_RUN_URL,
	receipt: {
		stage: "run-started",
		source: { type: "already-current" },
		anchorPr: {
			branch: EXPECTED_ANCHOR_BRANCH,
			number: 41,
			url: "https://github.com/nseng-ai/ns/pull/41",
		},
		runId: FAKE_RUN_ID,
	},
} as const satisfies DispatchPromptOutcome;

export async function runPromptCommand(
	argv: readonly string[],
	outcome: DispatchPromptOutcome = DISPATCHED_OUTCOME,
) {
	const api = new FakeDispatchNsApi();
	const gateways = createFakeDispatchGateways();
	const requests: DispatchPromptRequest[] = [];
	const command = createDispatchPromptCommand(
		() => ({ cwd: api.cwd, gateways, commandIo: api.commandIo }),
		async (request) => {
			requests.push(request);
			return outcome;
		},
	);
	const exit = await command.run(api, {
		argv: [...argv],
		commandPath: ["dispatch", "prompt"],
	});
	return { exit, requests };
}

class FakeDispatchNsApi implements NsExtensionApi {
	readonly cwd = "/repo";
	readonly env: Record<string, string | undefined> = {};
	readonly progress = noopNsProgress;
	readonly renderCapabilities = { canEmitAnsi: false };
	readonly hasExtension = () => false;
	readonly commandIo: NsCommandIo = {
		phase: () => {},
		notify: () => {},
		message: () => {},
		clearPhase: () => {},
	};
	readonly stdout = (_text: string) => {};
	readonly stderr = (_text: string) => {};

	async exec(): Promise<ExecResult> {
		throw new Error("Unexpected ctx.exec call in a dispatch command test.");
	}

	readonly textGenerator = {
		generateText: async (_request: TextGenerationRequest): Promise<TextGenerationResult> => {
			throw new Error("Unexpected text-generation call in a dispatch command test.");
		},
	};
}
