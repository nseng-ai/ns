import { describe, expect, test } from "vitest";

import type { ExtensionAPI } from "@nseng-ai/capability-kit/pi-types";
import { HERDR_COMMAND_NAMES } from "../src/core/command-surfaces.ts";

import registerHerdrPiExtension from "../src/pi/extension.ts";

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

describe("herdr Pi extension", () => {
	test("registers herdr command surface", () => {
		const commands = new Map<string, unknown>();
		const pi = makeFakeExtensionApi(commands);

		registerHerdrPiExtension(pi);

		expect(HERDR_COMMAND_NAMES).toEqual([
			"ns:herdr:handoff:plan",
			"ns:herdr:handoff:prompt",
			"ns:herdr:handoff:trunk-prompt",
			"ns:herdr:objective:sidebar-summary",
			"ns:herdr:space:goal",
			"ns:herdr:space:new",
			"ns:herdr:space:open-branch",
			"ns:herdr:tab:plan-dispatch",
		]);
		expect([...commands.keys()].sort()).toEqual(HERDR_COMMAND_NAMES);
	});
});
