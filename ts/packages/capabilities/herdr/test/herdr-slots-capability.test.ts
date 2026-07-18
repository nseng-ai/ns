import { describe, expect, test } from "vitest";

import type { ExtensionAPI, SkillCommandInfoLike } from "@nseng-ai/capability-kit/pi-types";

import { createHerdrSlotsCapabilityProbe } from "../src/pi/slots-capability.ts";

function extensionApiWithCommands(commands: readonly SkillCommandInfoLike[]): ExtensionAPI {
	return {
		on() {},
		registerCommand() {},
		async exec() {
			throw new Error("Slots capability detection must not execute a subprocess.");
		},
		getCommands: () => commands,
		getThinkingLevel: () => "medium",
		setThinkingLevel() {},
		async setModel() {
			return true;
		},
		sendUserMessage() {},
	};
}

function command(name: string): SkillCommandInfoLike {
	return { name, source: "extension", sourceInfo: { path: "/extensions/ns.ts" } };
}

describe("createHerdrSlotsCapabilityProbe", () => {
	test("reports Slots available when an ns SDK Slot command is registered", async () => {
		const pi = extensionApiWithCommands([command("ns:flow:changes"), command("ns:slot:checkout")]);

		expect(await createHerdrSlotsCapabilityProbe(pi)("/slot/worktree")).toBe(true);
	});

	test("reports Slots unavailable when no ns SDK Slot command is registered", async () => {
		const pi = extensionApiWithCommands([command("ns:flow:changes")]);

		expect(await createHerdrSlotsCapabilityProbe(pi)("/repo")).toBe(false);
	});

	test("does not accept a similarly prefixed non-Slot command", async () => {
		const pi = extensionApiWithCommands([command("ns:slots:checkout")]);

		expect(await createHerdrSlotsCapabilityProbe(pi)("/repo")).toBe(false);
	});
});
