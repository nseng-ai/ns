import { describe, expect, test } from "vitest";

import type { ExtensionAPI } from "@nseng-ai/extension-kit/pi-types";
import type { HandoffExtensionAPI, ToolDefinition } from "@nseng-ai/pi-ns-handoffs/handoff-launch";
import { HERDR_BASE_COMMAND_NAMES, HERDR_COMMAND_NAMES } from "@nseng-ai/herdr/api";

import registerHerdrPiExtension from "../src/pi/extension.ts";
import { FakeCommandContext, FakePi, notificationMessages, step } from "./herdr-test-harness.ts";

function makeFakeExtensionApi(commands: Map<string, unknown>): ExtensionAPI {
	return {
		registerCommand(name, definition) {
			commands.set(name, definition);
		},
		on() {},
		async exec() {
			return { code: 0, stdout: "", stderr: "", killed: false };
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
		async exec() {
			return { code: 0, stdout: "", stderr: "", killed: false };
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
	test("registers the base command surface without any Graphite work, even when gt is unusable", async () => {
		const commands = new Map<string, unknown>();
		const pi = makeFakeExtensionApi(commands);
		const gtCalls: string[][] = [];
		pi.exec = async (command, args) => {
			if (command === "gt") {
				gtCalls.push([...args]);
				return { code: 1, stdout: "", stderr: "not a Graphite repository", killed: false };
			}
			return { code: 0, stdout: "", stderr: "", killed: false };
		};

		await registerHerdrPiExtension(pi);

		expect(gtCalls).toEqual([]);
		expect(HERDR_COMMAND_NAMES).toEqual([
			"ns:herdr:impl:plan:space",
			"ns:herdr:impl:plan:tab",
			"ns:herdr:impl:prompt:space",
			"ns:herdr:impl:session:space",
			"ns:herdr:space:goal",
			"ns:herdr:space:new",
			"ns:herdr:space:objective-summary",
			"ns:herdr:tab:goal",
			"ns:herdr:tab:handoff",
			"ns:herdr:tab:new",
		]);
		expect(HERDR_COMMAND_NAMES).toHaveLength(10);
		expect(HERDR_BASE_COMMAND_NAMES).toHaveLength(9);
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

	test("an unaffected registered command executes without any Graphite call", async () => {
		// The scripted FakePi treats any unscripted exec — including any `gt`
		// invocation — as an immediate test failure via assertDone().
		const pi = new FakePi({
			script: [
				step("herdr", ["workspace", "create", "--cwd", "/repo/package"], {
					stdout: JSON.stringify({
						result: {
							workspace: { workspace_id: "w1" },
							root_pane: { pane_id: "p1" },
							tab: { tab_id: "t1" },
						},
					}),
				}),
			],
		});
		await registerHerdrPiExtension(pi);
		const ctx = new FakeCommandContext({ cwd: "/repo/package" });

		await pi.commands.get("ns:herdr:space:new")?.handler("", ctx);

		pi.assertDone();
		expect(pi.execCalls.filter((call) => call.command === "gt")).toEqual([]);
		expect(notificationMessages(ctx)).toContain("Opened Herdr space at /repo/package.");
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
			new Error("Cannot find package '@nseng-ai/pi-ns-handoffs/handoff-launch'"),
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
