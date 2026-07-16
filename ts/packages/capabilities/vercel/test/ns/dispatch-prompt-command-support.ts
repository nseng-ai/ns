import { createDispatchPromptCommand } from "../../src/ns/commands/prompt.ts";
import {
	createFakeDispatchGateways,
	FakeDispatchNsApi,
	FAKE_ANCHOR_TIMESTAMP,
	FAKE_SEMANTIC_SLUG,
	type FakeDispatchGatewaysOptions,
} from "../dispatch-client/support/dispatch-prompt-fakes.ts";

export const PROMPT = "Rename the widget gateway methods to match the command-shape convention";
export const EXPECTED_ANCHOR_BRANCH = `dispatch/${FAKE_SEMANTIC_SLUG}-${FAKE_ANCHOR_TIMESTAMP}`;
export const TRACKED_PLAN = {
	type: "tracked" as const,
	plan: { trunkBranch: "main", affectedBranches: ["feature/widgets", "feature/base"] },
};

export async function runPromptCommand(
	argv: readonly string[],
	options: FakeDispatchGatewaysOptions = {},
) {
	const gateways = createFakeDispatchGateways(options);
	const api = new FakeDispatchNsApi();
	const command = createDispatchPromptCommand(() => ({
		cwd: api.cwd,
		gateways,
		commandIo: api.commandIo,
	}));
	const exit = await command.run(api, {
		argv: [...argv],
		commandPath: ["dispatch", "prompt"],
	});
	return { exit, gateways, api };
}
