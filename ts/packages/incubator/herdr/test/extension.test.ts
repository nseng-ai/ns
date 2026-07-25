import { describe, expect, test } from "vitest";

import type { ExtensionAPI } from "@nseng-ai/extension-kit/pi-types";
import type { HandoffExtensionAPI, ToolDefinition } from "@nseng-ai/handoffs/pi/handoff-launch";
import { HERDR_BASE_COMMAND_NAMES, HERDR_COMMAND_NAMES } from "../src/core/command-surfaces.ts";

import registerHerdrPiExtension from "../src/pi/extension.ts";

function makeFakeExtensionApi(commands: Map<string, unknown>): ExtensionAPI {
	return {
		registerCommand(name, definition) {
			commands.set(name, definition);
		},
		on() {},
		async exec(command, args) {
			return {
				code: 0,
				stdout: command === "gt" && args.join(" ") === "trunk --no-interactive" ? "main\n" : "",
				stderr: "",
				killed: false,
			};
		},
		getCommands() {
			return [];
		},
		getThinkingLevel() {
			return "medium";
		},
		async setModel() {
			return true;
		},
		setThinkingLevel() {},
		sendUserMessage() {},
	};
}

function makeToolExtensionApi(
	commands: Map<string, unknown>,
	tools: Map<string, ToolDefinition>,
): HandoffExtensionAPI & { runSessionStart(): void } {
	const sessionStartHandlers: Array<() => void> = [];
	return {
		on(event, handler) {
			if (event === "session_start") sessionStartHandlers.push(() => handler());
		},
		registerCommand(name, definition) {
			commands.set(name, definition);
		},
		registerTool(definition) {
			tools.set(definition.name, definition);
		},
		async exec(command, args) {
			return {
				code: 0,
				stdout: command === "gt" && args.join(" ") === "trunk --no-interactive" ? "main\n" : "",
				stderr: "",
				killed: false,
			};
		},
		getCommands() {
			return [];
		},
		getAllTools() {
			return [...tools.keys()].map((name) => ({ name }));
		},
		getThinkingLevel() {
			return "medium";
		},
		sendUserMessage() {},
		runSessionStart() {
			for (const handler of sessionStartHandlers) handler();
		},
	};
}

describe("herdr Pi extension", () => {
	test("fails before registration when Graphite trunk resolution fails", async () => {
		const commands = new Map<string, unknown>();
		const pi = makeFakeExtensionApi(commands);
		let trunkCalls = 0;
		pi.exec = async (command, args) => {
			if (command === "gt" && args.join(" ") === "trunk --no-interactive") trunkCalls += 1;
			return { code: 1, stdout: "", stderr: "not a Graphite repository", killed: false };
		};

		await expect(registerHerdrPiExtension(pi)).rejects.toThrow("not a Graphite repository");
		expect(trunkCalls).toBe(1);
		expect(commands.size).toBe(0);
	});

	test("resolves Graphite trunk once at startup and registers the base command surface", async () => {
		const commands = new Map<string, unknown>();
		const pi = makeFakeExtensionApi(commands);
		const trunkCalls: Array<{ command: string; args: string[]; cwd: string | undefined }> = [];
		pi.exec = async (command, args, options) => {
			if (command === "gt" && args.join(" ") === "trunk --no-interactive") {
				trunkCalls.push({ command, args: [...args], cwd: options?.cwd });
				return { code: 0, stdout: "main\n", stderr: "", killed: false };
			}
			return { code: 0, stdout: "", stderr: "", killed: false };
		};

		await registerHerdrPiExtension(pi);

		expect(trunkCalls).toEqual([
			{ command: "gt", args: ["trunk", "--no-interactive"], cwd: process.cwd() },
		]);
		expect(HERDR_COMMAND_NAMES).toEqual([
			"ns:herdr:impl:plan:space",
			"ns:herdr:impl:plan:tab",
			"ns:herdr:impl:prompt:space",
			"ns:herdr:space:goal",
			"ns:herdr:space:new",
			"ns:herdr:space:objective-summary",
			"ns:herdr:tab:goal",
			"ns:herdr:tab:handoff",
			"ns:herdr:tab:new",
		]);
		expect(HERDR_COMMAND_NAMES).toHaveLength(9);
		expect(HERDR_BASE_COMMAND_NAMES).toHaveLength(8);
		expect([...commands.keys()].sort()).toEqual([...HERDR_BASE_COMMAND_NAMES].sort());
		const registered = [...commands.keys()];
		expect(registered.some((name) => name.startsWith("ns:herdr:handoff:"))).toBe(false);
		expect(registered).not.toContain("ns:herdr:tab:plan-dispatch");
		expect(registered).not.toContain("ns:herdr:objective:sidebar-summary");
		for (const oldName of [
			"ns:herdr:launch:prompt:space",
			"ns:herdr:launch:plan:space",
			"ns:herdr:launch:plan:tab",
			"ns:herdr:launch:prompt:br:space",
			"ns:herdr:launch:prompt:tr:space",
			"ns:herdr:launch:plan:br:space",
			"ns:herdr:launch:plan:tr:space",
			"ns:herdr:launch:plan:br:tab",
		]) {
			expect(registered).not.toContain(oldName);
		}
	});

	test("registers the optional Handoffs command and shared slug tool when installed", async () => {
		const commands = new Map<string, unknown>();
		const tools = new Map<string, ToolDefinition>();
		const pi = makeToolExtensionApi(commands, tools);

		await registerHerdrPiExtension(pi);
		pi.runSessionStart();

		expect([...commands.keys()].sort()).toEqual(
			[...HERDR_BASE_COMMAND_NAMES, "ns:herdr:tab:handoff"].sort(),
		);
		expect([...tools.keys()].sort()).toEqual(["derive_handoff_slug_from_content"]);
		expect(tools.has("handoff_tab_launch")).toBe(false);
	});

	test("keeps base commands when the exact optional module is absent", async () => {
		const commands = new Map<string, unknown>();
		const tools = new Map<string, ToolDefinition>();
		const pi = makeToolExtensionApi(commands, tools);
		const absence = Object.assign(
			new Error("Cannot find package '@nseng-ai/handoffs/pi/handoff-launch'"),
			{ code: "ERR_MODULE_NOT_FOUND" },
		);

		await registerHerdrPiExtension(pi, {
			loadHandoffIntegration: async () => Promise.reject(absence),
		});

		expect([...commands.keys()].sort()).toEqual([...HERDR_BASE_COMMAND_NAMES].sort());
		expect(tools.size).toBe(0);
	});

	test("surfaces failures from an installed integration", async () => {
		const commands = new Map<string, unknown>();
		const tools = new Map<string, ToolDefinition>();
		const pi = makeToolExtensionApi(commands, tools);

		await expect(
			registerHerdrPiExtension(pi, {
				loadHandoffIntegration: async () => Promise.reject(new SyntaxError("broken integration")),
			}),
		).rejects.toThrow("broken integration");
	});
});
