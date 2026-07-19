import herdrExtension from "@nseng-ai/herdr/ns-extension";
import { validateExtensionDescriptor } from "@nseng-ai/sdk";
import { describe, expect, test } from "vitest";

describe("Herdr ns extension descriptor", () => {
	test("keeps the agent operation hidden under exec and loads the nested launch command", async () => {
		const validated = validateExtensionDescriptor(herdrExtension);
		expect(validated).toMatchObject({ ok: true });
		expect(herdrExtension.group).toBe("herdr");

		const [exec] = herdrExtension.entries;
		if (exec === undefined || !("group" in exec)) throw new Error("Expected exec group");
		expect(exec).toMatchObject({ group: "exec", hidden: true });
		const [handoffTab] = exec.entries;
		if (handoffTab === undefined || !("group" in handoffTab)) {
			throw new Error("Expected handoff-tab group");
		}
		expect(handoffTab).toMatchObject({ group: "handoff-tab" });
		const [launch] = handoffTab.entries;
		if (launch === undefined || !("load" in launch)) throw new Error("Expected launch command");
		expect(launch.name).toBe("launch");
		const module = await launch.load();
		expect(module.default.name).toBe("launch");
	});
});
