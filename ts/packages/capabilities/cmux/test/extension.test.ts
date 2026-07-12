import { describe, expect, test } from "vitest";

import type { ExtensionAPI } from "@nseng-ai/capability-kit/cmux/types";
import { CMUX_COMMAND_NAMES } from "@nseng-ai/cmux/api";

import registerCmuxPiExtension from "../src/pi/extension.ts";

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

describe("CCC Pi extension", () => {
	test("registers CCC command surface", () => {
		const commands = new Map<string, unknown>();
		const pi = makeFakeExtensionApi(commands);

		registerCmuxPiExtension(pi);

		expect([...commands.keys()].sort()).toEqual(CMUX_COMMAND_NAMES);
	});
});
