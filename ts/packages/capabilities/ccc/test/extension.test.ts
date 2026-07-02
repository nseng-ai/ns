import { describe, expect, test } from "vitest";

import type { ExtensionAPI } from "@sdl/capability-kit/cmux/types";

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
			"ccc:claude-plan-tab",
			"ccc:sidebar:branch-state-summary",
			"ccc:sidebar:objective-summary",
			"ccc:sidebar:session-summary",
			"ccc:surface:dispatch-plan",
			"ccc:workspace:dispatch-from-trunk",
			"ccc:workspace:dispatch-plan",
			"ccc:workspace:dispatch-prompt",
			"ccc:workspace:open-branch",
		]);
	});
});
