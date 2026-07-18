import { describe, expect, test } from "vitest";

import type { CommandDefinition, ExtensionAPI } from "@nseng-ai/capability-kit/pi-types";
import { HERDR_COMMAND_NAMES } from "../src/core/command-surfaces.ts";

import registerHerdrPiExtension from "../src/pi/extension.ts";
import { FakeCommandContext, fakeNsExtensionApi } from "./herdr-test-harness.ts";

function makeFakeExtensionApi(commands: Map<string, CommandDefinition>): ExtensionAPI {
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

describe("herdr Pi extension", () => {
	test("registers herdr command surface without constructing the ns API", () => {
		const commands = new Map<string, CommandDefinition>();
		const pi = makeFakeExtensionApi(commands);
		const factoryCalls: string[] = [];

		registerHerdrPiExtension(pi, async (cwd) => {
			factoryCalls.push(cwd);
			return fakeNsExtensionApi(cwd);
		});

		expect([...commands.keys()].sort()).toEqual(HERDR_COMMAND_NAMES);
		expect(factoryCalls).toEqual([]);
	});

	test("unrelated dispatch and new-space commands never construct the ns API", async () => {
		const commands = new Map<string, CommandDefinition>();
		const pi = makeFakeExtensionApi(commands);
		const factoryCalls: string[] = [];
		registerHerdrPiExtension(pi, async (cwd) => {
			factoryCalls.push(cwd);
			return fakeNsExtensionApi(cwd);
		});
		const ctx = new FakeCommandContext({ cwd: "/repo", hasUI: false });

		await commands.get("ns:herdr:dispatch:plan")?.handler("--help", ctx);
		await commands.get("ns:herdr:space:new")?.handler("", ctx);

		expect(factoryCalls).toEqual([]);
	});
});
