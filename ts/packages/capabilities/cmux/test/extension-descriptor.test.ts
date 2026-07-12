import cmuxExtension from "@nseng-ai/cmux/ns-extension";
import { validateExtensionDescriptor } from "@nseng-ai/sdk/sdk";
import { describe, expect, test } from "vitest";

describe("cmux extension descriptor", () => {
	test("declares the cmux group with a hidden exec subgroup", () => {
		const result = validateExtensionDescriptor(cmuxExtension);

		expect(result).toMatchObject({ ok: true });
		if (!result.ok) return;
		expect(result.descriptor.group).toBe("cmux");
		expect(result.descriptor.entries).toHaveLength(1);
	});

	test("hidden exec subgroup loads the workspace-summary command", async () => {
		const [execGroup] = cmuxExtension.entries;
		if (execGroup === undefined || !("group" in execGroup)) {
			throw new Error("Expected the first cmux extension entry to be a group entry.");
		}
		expect(execGroup).toMatchObject({ group: "exec", hidden: true });

		const [commandEntry] = execGroup.entries;
		if (commandEntry === undefined || !("load" in commandEntry)) {
			throw new Error("Expected the exec group to contain a command entry.");
		}
		expect(commandEntry.name).toBe("workspace-summary");

		const module = await commandEntry.load();
		expect(module.default.name).toBe("workspace-summary");
		expect(module.default.summary).toBe(
			"Apply generated cmux workspace title and description fields.",
		);
	});
});
