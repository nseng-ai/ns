import { describe, expect, test } from "vitest";

import type { ExtensionAPI } from "@ns/capability-kit/cmux/types";

import registerCccPiExtension from "../src/pi/extension.ts";

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

		registerCccPiExtension(pi);

		expect([...commands.keys()].sort()).toEqual([
			"ns:ccc:claude-plan-tab",
			"ns:ccc:sidebar:branch-state-summary",
			"ns:ccc:sidebar:objective-summary",
			"ns:ccc:sidebar:session-summary",
			"ns:ccc:surface:dispatch-plan",
			"ns:ccc:workspace:dispatch-from-trunk",
			"ns:ccc:workspace:dispatch-plan",
			"ns:ccc:workspace:dispatch-prompt",
			"ns:ccc:workspace:open-branch",
		]);
	});
});
