import { describe, expect, test } from "vitest";

import { CLI_COMMAND_OUTPUT_MESSAGE_TYPE } from "../src/commands/cli-extension.ts";
import sdlExtension, { type SdlExtensionAPI } from "../src/flow/sdl-extension.ts";
import type { CommandContext } from "../src/commands/cli-extension.ts";

type RegisteredCommand = Parameters<SdlExtensionAPI["registerCommand"]>[1];
type CustomMessage = Parameters<NonNullable<SdlExtensionAPI["sendMessage"]>>[0];
type FlowCommandName =
	| "changes"
	| "cp"
	| "autobranch"
	| "branch-latest-commit"
	| "autoslot"
	| "submit"
	| "regenerate-pr"
	| "push"
	| "land"
	| "pull-trunk";

const FLOW_COMMANDS = [
	"changes",
	"cp",
	"autobranch",
	"branch-latest-commit",
	"autoslot",
	"submit",
	"regenerate-pr",
	"push",
	"land",
	"pull-trunk",
] as const satisfies readonly FlowCommandName[];

class FakePi implements SdlExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly messageRenderers = new Map<string, unknown>();
	readonly sentMessages: CustomMessage[] = [];
	readonly ackMessages: CustomMessage[] = [];
	readonly progressMessages: CustomMessage[] = [];

	registerCommand(name: string, command: RegisteredCommand): void {
		this.commands.set(name, command);
	}

	registerMessageRenderer(customType: string, renderer: unknown): void {
		if (customType === "sdl-command-ack") return;
		this.messageRenderers.set(customType, renderer);
	}

	readonly sendMessage = (message: CustomMessage): void => {
		if (message.customType === "sdl-command-ack") {
			this.ackMessages.push(message);
			return;
		}
		if (message.customType === "sdl-command-progress") {
			this.progressMessages.push(message);
			return;
		}
		this.sentMessages.push(message);
	};
}

function commandFor(pi: FakePi, name: string): RegisteredCommand {
	const command = pi.commands.get(name);
	if (command === undefined) throw new Error(`Expected command to be registered: ${name}`);
	return command;
}

function expectSingleCommandOutput(
	messages: readonly CustomMessage[],
	expectedOutput: string,
): void {
	expect(messages).toHaveLength(1);
	expect(String(messages[0]?.content)).toContain(expectedOutput);
}

function createContext(cwd: string): CommandContext {
	return {
		cwd,
		hasUI: true,
		ui: {
			notify() {},
			setStatus() {},
			setWidget() {},
		},
		async waitForIdle() {},
	};
}

describe("sdl Pi extension", () => {
	test("exposes only nested flow SDL lifecycle mirrors", () => {
		const pi = new FakePi();

		sdlExtension(pi);

		expect([...pi.commands.keys()]).toEqual(FLOW_COMMANDS.map((name) => `sdl:flow:${name}`));
		for (const oldName of [
			"sdl:changes",
			"sdl:cp",
			"sdl:autobranch",
			"sdl:submit",
			"sdl:regenerate-pr",
			"sdl:push",
			"sdl:code:changes",
			"sdl:code:autoslot",
			"sdl:code:land",
			"sdl:code:pull-trunk",
		]) {
			expect(pi.commands.has(oldName)).toBe(false);
		}
		expect(pi.commands.get("sdl:flow:cp")?.description).toBe(
			"sdl flow cp: Create a checkpoint commit for the current diff.",
		);
		expect(pi.commands.get("sdl:flow:branch-latest-commit")?.description).toBe(
			"sdl flow branch-latest-commit: Move the latest eligible commit to a new Graphite child branch.",
		);
		expect(pi.commands.get("sdl:flow:autoslot")?.description).toContain("managed slot worktree");
		expect(pi.commands.get("sdl:flow:land")?.description).toBe(
			"sdl flow land: Land the current PR or Graphite stack into trunk.",
		);
		expect(pi.messageRenderers.has(CLI_COMMAND_OUTPUT_MESSAGE_TYPE)).toBe(true);
	});

	for (const commandName of FLOW_COMMANDS) {
		test(`routes sdl flow ${commandName} to the SDL CLI with flow argv`, async () => {
			const pi = new FakePi();
			const runCliCalls: string[][] = [];
			sdlExtension(pi, {
				runCli: async (args, deps) => {
					runCliCalls.push([...args]);
					deps?.stdout?.(`pi-custom-${commandName}`);
					return 0;
				},
			});

			await commandFor(pi, `sdl:flow:${commandName}`).handler("", createContext("/work"));

			expect(runCliCalls).toEqual([["flow", commandName]]);
			expectSingleCommandOutput(pi.sentMessages, `pi-custom-${commandName}`);
		});
	}
});
