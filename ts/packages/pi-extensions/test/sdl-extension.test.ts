import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { CLI_COMMAND_OUTPUT_MESSAGE_TYPE } from "../src/cli-command-extension.ts";
import sdlExtension, { type ExtensionAPI } from "../src/sdl-extension.ts";
import type { CommandContext } from "../src/cli-command-extension.ts";

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

	async exec(): Promise<{ stdout: string; stderr: string; code: number; killed: boolean }> {
		throw new Error("unexpected exec during SDL extension registration");
	}
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
	const extensionPath = join(directory, ".asdl", "extensions", "cp.ts");
	mkdirSync(dirname(extensionPath), { recursive: true });
	writeFileSync(
		extensionPath,
		`
import { defineExtension, ok } from "@asdl/sdl/sdk";

export default defineExtension({
	commands: [{
	name: "cp",
	description: "Custom checkpoint",
	async run(ctx) {
		const result = await ctx.exec("echo", ["pi-custom"]);
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
	test("exposes flat SDL commands first plus nested code-lifecycle aliases", () => {
		const pi = new FakePi();

		sdlExtension(pi);

		expect([...pi.commands.keys()]).toEqual([
			"sdl:changes",
			"sdl:cp",
			"sdl:submit",
			"sdl:code:changes",
			"sdl:code:checkpoint",
			"sdl:code:submit",
			"sdl:code:autobranch",
			"sdl:code:autoslot",
			"sdl:code:land",
			"sdl:code:push",
			"sdl:code:regenerate-pr",
		]);
		expect(pi.commands.has("code:changes")).toBe(false);
		expect(pi.commands.has("code:cp")).toBe(false);
		expect(pi.commands.has("code:checkpoint")).toBe(false);
		expect(pi.commands.has("dev:cp")).toBe(false);
		expect(pi.commands.has("code:submit")).toBe(false);
		expect(pi.commands.has("code:autobranch")).toBe(false);
		expect(pi.commands.has("code:autoslot")).toBe(false);
		expect(pi.commands.has("code:land")).toBe(false);
		expect(pi.commands.has("code:push")).toBe(false);
		expect(pi.commands.has("code:pr-regen")).toBe(false);
		expect(pi.commands.get("sdl:changes")?.description).toBe("sdl changes: Summarize outstanding worktree changes without committing.");
		expect(pi.commands.get("sdl:cp")?.description).toBe("sdl cp: Create a checkpoint commit for the current diff.");
		expect(pi.commands.get("sdl:submit")?.description).toBe(
			"sdl submit: Checkpoint outstanding changes, then submit the current Graphite stack with gt submit -nps --no-ai --no-interactive.",
		);
		expect(pi.commands.get("sdl:code:changes")?.description).toBe("sdl changes: Summarize outstanding worktree changes without committing.");
		expect(pi.commands.get("sdl:code:checkpoint")?.description).toBe("sdl cp: Create a checkpoint commit for the current diff.");
		expect(pi.commands.get("sdl:code:submit")?.description).toBe(
			"sdl submit: Checkpoint outstanding changes, then submit the current Graphite stack with gt submit -nps --no-ai --no-interactive.",
		);
		expect(pi.commands.get("sdl:code:autobranch")?.description).toBe(
			"ccc autobranch: Create a Graphite branch from dirty worktree changes or the latest unpushed commit.",
		);
		expect(pi.commands.get("sdl:code:autoslot")?.description).toContain("managed slot worktree");
		expect(pi.commands.get("sdl:code:land")?.description).toBe("Land the current PR or Graphite stack into trunk");
		expect(pi.commands.get("sdl:code:push")?.description).toContain("git push");
		expect(pi.commands.get("sdl:code:regenerate-pr")?.description).toBe(
			"asdl-dev pr-regen: Regenerate the current branch PR's title and description with the asdl PR-description prompt.",
		);
		expect(pi.messageRenderers.has(CLI_COMMAND_OUTPUT_MESSAGE_TYPE)).toBe(true);
		expect(pi.messageRenderers.has("code-changes-summary")).toBe(false);
	});

	test("runs the shared cp command-entry runner through the nested checkpoint alias", async () => {
		const cwd = await createOverrideProject();
		const pi = new FakePi();
		sdlExtension(pi);

		const originalHome = process.env.HOME;
		process.env.HOME = join(cwd, ".home");
		try {
			await commandFor(pi, "sdl:code:checkpoint").handler("", createContext(cwd));
		} finally {
			if (originalHome === undefined) {
				delete process.env.HOME;
			} else {
				process.env.HOME = originalHome;
			}
		}

		expect(pi.sentMessages).toHaveLength(1);
		expect(String(pi.sentMessages[0]?.content)).toContain("pi-custom");
	});
});
