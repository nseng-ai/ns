import { describe, expect, test } from "vitest";

import type { ExtensionAPI } from "@nseng-ai/capability-kit/cmux/types";
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

		expect([...commands.keys()].sort()).toEqual(HERDR_COMMAND_NAMES);
	});
});
