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

	async exec(): Promise<{ stdout: string; stderr: string; code: number; killed: boolean }> {
		throw new Error("unexpected exec during SDL extension registration");
	}
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

async function createCommandProject(
	commandName: "changes" | "cp" | "autobranch" | "submit" | "regenerate-pr" | "push",
): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), `sdl-pi-${commandName}-`));
	tempDirs.push(directory);
	const extensionPath = join(directory, ".sdl", "extensions", `${commandName}.ts`);
	mkdirSync(dirname(extensionPath), { recursive: true });
	writeFileSync(
		extensionPath,
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

afterEach(() => {
	for (const directory of tempDirs.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("sdl Pi extension", () => {
	test("exposes restored SDL mirrors plus unrelated code-lifecycle commands", () => {
		const pi = new FakePi();

		sdlExtension(pi);

		expect([...pi.commands.keys()]).toEqual([
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
		]);
		expect(pi.commands.has("code:changes")).toBe(false);
		expect(pi.commands.has("code:cp")).toBe(false);
		expect(pi.commands.has("code:checkpoint")).toBe(false);
		expect(pi.commands.has("dev:cp")).toBe(false);
		expect(pi.commands.has("code:submit")).toBe(false);
		expect(pi.commands.has("code:autobranch")).toBe(false);
		expect(pi.commands.has("sdl:code:autobranch")).toBe(false);
		expect(pi.commands.has("code:autoslot")).toBe(false);
		expect(pi.commands.has("code:land")).toBe(false);
		expect(pi.commands.has("code:push")).toBe(false);
		expect(pi.commands.has("code:pr-regen")).toBe(false);
		expect(pi.commands.has("sdl:code:checkpoint")).toBe(false);
		expect(pi.commands.has("sdl:code:submit")).toBe(false);
		expect(pi.commands.has("sdl:code:regenerate-pr")).toBe(false);
		expect(pi.commands.has("sdl:code:push")).toBe(false);
		expect(pi.commands.get("sdl:changes")?.description).toBe(
			"sdl changes: Summarize outstanding worktree changes without committing.",
		);
		expect(pi.commands.get("sdl:cp")?.description).toBe(
			"sdl cp: Create a checkpoint commit for the current diff.",
		);
		expect(pi.commands.get("sdl:autobranch")?.description).toBe(
			"sdl autobranch: Create a Graphite branch from dirty worktree changes or the latest unpushed commit.",
		);
		expect(pi.commands.get("sdl:submit")?.description).toBe(
			"sdl submit: Checkpoint outstanding changes, then submit the current Graphite stack.",
		);
		expect(pi.commands.get("sdl:regenerate-pr")?.description).toBe(
			"sdl regenerate-pr: Regenerate the current branch PR title and description.",
		);
		expect(pi.commands.get("sdl:push")?.description).toBe(
			"sdl push: Push already-committed work on the current branch with git push.",
		);
		expect(pi.commands.get("sdl:code:changes")?.description).toBe(
			"sdl changes: Summarize outstanding worktree changes without committing.",
		);
		expect(pi.commands.get("sdl:code:autoslot")?.description).toContain("managed slot worktree");
		expect(pi.commands.get("sdl:code:land")?.description).toBe(
			"Land the current PR or Graphite stack into trunk",
		);
		expect(pi.commands.get("sdl:code:pull-trunk")?.description).toBe(
			"Pull Graphite trunk without running full gt sync",
		);
		expect(pi.messageRenderers.has(CLI_COMMAND_OUTPUT_MESSAGE_TYPE)).toBe(true);
		expect(pi.messageRenderers.has("code-changes-summary")).toBe(false);
	});

	test("runs sdl changes through the nested changes alias", async () => {
		const cwd = await createCommandProject("changes");
		const pi = new FakePi();
		sdlExtension(pi);

		const originalHome = process.env.HOME;
		process.env.HOME = join(cwd, ".home");
		try {
			await commandFor(pi, "sdl:code:changes").handler("", createContext(cwd));
		} finally {
			if (originalHome === undefined) {
				delete process.env.HOME;
			} else {
				process.env.HOME = originalHome;
			}
		}

		expectSingleCommandOutput(pi.sentMessages, "pi-custom-changes");
	});

	test("runs sdl cp through the direct SDL mirror only", async () => {
		const cwd = await createCommandProject("cp");
		const pi = new FakePi();
		sdlExtension(pi);

		const originalHome = process.env.HOME;
		process.env.HOME = join(cwd, ".home");
		try {
			await commandFor(pi, "sdl:cp").handler("", createContext(cwd));
		} finally {
			if (originalHome === undefined) {
				delete process.env.HOME;
			} else {
				process.env.HOME = originalHome;
			}
		}

		expectSingleCommandOutput(pi.sentMessages, "pi-custom-cp");
		expect(pi.commands.has("sdl:code:cp")).toBe(false);
	});

	test("runs sdl autobranch through the flat direct SDL mirror only", async () => {
		const cwd = await createCommandProject("autobranch");
		const pi = new FakePi();
		sdlExtension(pi);

		const originalHome = process.env.HOME;
		process.env.HOME = join(cwd, ".home");
		try {
			await commandFor(pi, "sdl:autobranch").handler("", createContext(cwd));
		} finally {
			if (originalHome === undefined) {
				delete process.env.HOME;
			} else {
				process.env.HOME = originalHome;
			}
		}

		expectSingleCommandOutput(pi.sentMessages, "pi-custom-autobranch");
		expect(pi.commands.has("sdl:code:autobranch")).toBe(false);
	});

	test("runs sdl submit through the flat direct SDL mirror only", async () => {
		const cwd = await createCommandProject("submit");
		const pi = new FakePi();
		sdlExtension(pi);

		const originalHome = process.env.HOME;
		process.env.HOME = join(cwd, ".home");
		try {
			await commandFor(pi, "sdl:submit").handler("", createContext(cwd));
		} finally {
			if (originalHome === undefined) {
				delete process.env.HOME;
			} else {
				process.env.HOME = originalHome;
			}
		}

		expectSingleCommandOutput(pi.sentMessages, "pi-custom-submit");
		expect(pi.commands.has("sdl:code:submit")).toBe(false);
	});

	test("runs sdl regenerate-pr through the flat direct SDL mirror only", async () => {
		const cwd = await createCommandProject("regenerate-pr");
		const pi = new FakePi();
		sdlExtension(pi);

		const originalHome = process.env.HOME;
		process.env.HOME = join(cwd, ".home");
		try {
			await commandFor(pi, "sdl:regenerate-pr").handler("", createContext(cwd));
		} finally {
			if (originalHome === undefined) {
				delete process.env.HOME;
			} else {
				process.env.HOME = originalHome;
			}
		}

		expectSingleCommandOutput(pi.sentMessages, "pi-custom-regenerate-pr");
		expect(pi.commands.has("sdl:code:regenerate-pr")).toBe(false);
	});

	test("runs sdl push through the flat direct SDL mirror only", async () => {
		const cwd = await createCommandProject("push");
		const pi = new FakePi();
		sdlExtension(pi);

		const originalHome = process.env.HOME;
		process.env.HOME = join(cwd, ".home");
		try {
			await commandFor(pi, "sdl:push").handler("", createContext(cwd));
		} finally {
			if (originalHome === undefined) {
				delete process.env.HOME;
			} else {
				process.env.HOME = originalHome;
			}
		}

		expectSingleCommandOutput(pi.sentMessages, "pi-custom-push");
		expect(pi.commands.has("sdl:code:push")).toBe(false);
	});
});
