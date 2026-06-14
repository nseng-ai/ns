import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { CLI_COMMAND_OUTPUT_MESSAGE_TYPE } from "../src/cli-command-extension.ts";
import sdlExtension from "../src/sdl-extension.ts";
import type { CommandContext, ExtensionAPI } from "../src/cli-command-extension.ts";

type RegisteredCommand = Parameters<ExtensionAPI["registerCommand"]>[1];
type CustomMessage = Parameters<NonNullable<ExtensionAPI["sendMessage"]>>[0];

const tempDirs: string[] = [];

class FakePi implements ExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly messageRenderers = new Map<string, unknown>();
	readonly sentMessages: CustomMessage[] = [];

	registerCommand(name: string, command: RegisteredCommand): void {
		this.commands.set(name, command);
	}

	registerMessageRenderer(customType: string, renderer: unknown): void {
		this.messageRenderers.set(customType, renderer);
	}

	readonly sendMessage = (message: CustomMessage): void => {
		this.sentMessages.push(message);
	};
}

function commandFor(pi: FakePi, name: string): RegisteredCommand {
	const command = pi.commands.get(name);
	if (command === undefined) throw new Error(`Expected command to be registered: ${name}`);
	return command;
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

async function createOverrideProject(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "sdl-pi-override-"));
	tempDirs.push(directory);
	const commandPath = join(directory, ".asdl", "commands", "cp.ts");
	mkdirSync(dirname(commandPath), { recursive: true });
	writeFileSync(
		commandPath,
		`
import { defineCommand, ok } from "@asdl/sdl/sdk";

export default defineCommand({
	name: "cp",
	description: "Custom checkpoint",
	async run(ctx) {
		const result = await ctx.exec("echo", ["pi-custom"]);
		return ok(result.stdout.trim());
	},
});
`,
	);
	return directory;
}

afterEach(() => {
	for (const directory of tempDirs.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("sdl Pi extension", () => {
	test("exposes SDL commands under the sdl namespace only", () => {
		const pi = new FakePi();

		sdlExtension(pi);

		expect([...pi.commands.keys()]).toEqual(["sdl:changes", "sdl:cp", "sdl:submit"]);
		expect(pi.commands.has("code:changes")).toBe(false);
		expect(pi.commands.has("code:cp")).toBe(false);
		expect(pi.commands.has("dev:cp")).toBe(false);
		expect(pi.commands.has("code:submit")).toBe(false);
		expect(pi.commands.get("sdl:changes")?.description).toBe("sdl changes: Summarize outstanding worktree changes without committing.");
		expect(pi.commands.get("sdl:cp")?.description).toBe("sdl cp: Create a checkpoint commit for the current diff.");
		expect(pi.commands.get("sdl:submit")?.description).toBe(
			"sdl submit: Checkpoint outstanding changes, then submit the current Graphite stack with gt submit -nps --no-ai --no-interactive.",
		);
		expect(pi.messageRenderers.has(CLI_COMMAND_OUTPUT_MESSAGE_TYPE)).toBe(true);
		expect(pi.messageRenderers.has("code-changes-summary")).toBe(false);
	});

	test("runs the shared cp command-module runner", async () => {
		const cwd = await createOverrideProject();
		const pi = new FakePi();
		sdlExtension(pi);

		await commandFor(pi, "sdl:cp").handler("", createContext(cwd));

		expect(pi.sentMessages).toHaveLength(1);
		expect(String(pi.sentMessages[0]?.content)).toContain("pi-custom");
	});
});
