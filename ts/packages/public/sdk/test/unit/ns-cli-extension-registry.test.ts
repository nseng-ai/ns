import { expect, test } from "vitest";

import { defineRawCommand, ok } from "@nseng-ai/sdk";
import { createTestNsCliExtensionRegistry } from "@nseng-ai/sdk/testing";

const command = defineRawCommand({
	name: "list",
	summary: "List things.",
	description: "List registered things.",
	run: () => ok({}),
});

test("the test ns CLI registry rejects duplicate command keys eagerly", () => {
	expect(() =>
		createTestNsCliExtensionRegistry({
			commands: [
				{ command, segments: ["things", "list"] },
				{ command, segments: ["things", "list"] },
			],
		}),
	).toThrow("Duplicate test ns CLI command registration: things/list");
});
