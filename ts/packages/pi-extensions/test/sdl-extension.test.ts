import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { CLI_COMMAND_OUTPUT_MESSAGE_TYPE } from "../src/cli-command-extension.ts";
import sdlExtension, { type SdlExtensionAPI } from "../src/sdl-extension.ts";
import type { CommandContext } from "../src/cli-command-extension.ts";

type RegisteredCommand = Parameters<SdlExtensionAPI["registerCommand"]>[1];
type CustomMessage = Parameters<NonNullable<SdlExtensionAPI["sendMessage"]>>[0];
type FlowCommandName =
	| "changes"
	| "cp"
	| "autobranch"
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
	"autoslot",
	"submit",
	"regenerate-pr",
	"push",
	"land",
	"pull-trunk",
] as const satisfies readonly FlowCommandName[];
const tempDirs: string[] = [];

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

async function createFlowCommandProject(commandName: FlowCommandName): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), `sdl-pi-flow-${commandName}-`));
	tempDirs.push(directory);
	const packageDir = join(directory, ".sdl", "extensions", "flow");
	writeFileSyncWithParents(
		join(packageDir, "package.json"),
		JSON.stringify({
			sdl: {
				group: "flow",
				commands: [
					{
						name: commandName,
						description: `Custom ${commandName}`,
						entry: `./src/commands/${commandName}.ts`,
					},
				],
			},
		}),
	);
	writeFileSyncWithParents(
		join(packageDir, "src", "commands", `${commandName}.ts`),
		`
import { defineExtension, ok } from "@sdl/sdl/sdk";

export default defineExtension({
	commands: [{
	name: "${commandName}",
	summary: "Custom ${commandName}",
	description: "Custom ${commandName}",
	async run(ctx) {
		const result = await ctx.exec("echo", ["pi-custom-${commandName}"]);
		return ok(result.stdout.trim());
	},
}],
});
`,
	);
	return directory;
}

function writeFileSyncWithParents(path: string, content: string): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content);
}

afterEach(() => {
	for (const directory of tempDirs.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

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
		expect(pi.commands.get("sdl:flow:autoslot")?.description).toContain("managed slot worktree");
		expect(pi.commands.get("sdl:flow:land")?.description).toBe(
			"sdl flow land: Land the current PR or Graphite stack into trunk.",
		);
		expect(pi.messageRenderers.has(CLI_COMMAND_OUTPUT_MESSAGE_TYPE)).toBe(true);
	});

	for (const commandName of FLOW_COMMANDS) {
		test(`runs sdl flow ${commandName} through the nested SDL mirror`, async () => {
			const cwd = await createFlowCommandProject(commandName);
			const pi = new FakePi();
			sdlExtension(pi);

			const originalHome = process.env.HOME;
			process.env.HOME = join(cwd, ".home");
			try {
				await commandFor(pi, `sdl:flow:${commandName}`).handler("", createContext(cwd));
			} finally {
				if (originalHome === undefined) {
					delete process.env.HOME;
				} else {
					process.env.HOME = originalHome;
				}
			}

			expectSingleCommandOutput(pi.sentMessages, `pi-custom-${commandName}`);
		});
	}
});
