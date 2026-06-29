import { describe, expect, test } from "vitest";

import registerCccPiExtension from "../src/extension.ts";

describe("CCC Pi extension", () => {
	test("registers CCC command surface", () => {
		const commands = new Map<string, unknown>();
		const pi = {
			commands,
			registerCommand(name: string, definition: unknown) {
				commands.set(name, definition);
			},
			on() {},
		} as never;

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
