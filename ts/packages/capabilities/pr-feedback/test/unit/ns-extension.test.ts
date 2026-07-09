import { describe, expect, test } from "vitest";

import descriptor from "../../src/ns-extension.ts";
import { EXEC_OPERATIONS } from "../../src/exec-commands.ts";
import type { ExtensionEntry } from "@nseng-ai/kernel/sdk";

function commandEntryNames(entries: readonly ExtensionEntry[] | undefined): readonly string[] {
	return (entries ?? []).flatMap((entry) =>
		"name" in entry ? [entry.name] : commandEntryNames(entry.entries),
	);
}

describe("pr-feedback ns extension descriptor", () => {
	test("keeps descriptor exec entries in sync with operation names", () => {
		expect(commandEntryNames(descriptor.entries)).toEqual(
			EXEC_OPERATIONS.map((operation) => `exec-${operation.name}`),
		);
	});
});
