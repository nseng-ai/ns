import path from "node:path";
import { readdir } from "node:fs/promises";

import herdrExtension from "@nseng-ai/herdr/ns-extension";
import { describe, expect, test } from "vitest";

import { herdrHandoffTabLaunchCommand } from "../src/ns/commands/handoff-tab-launch.ts";

const EXPECTED_ROUTES = ["herdr exec handoff-tab launch"];

describe("Herdr ns extension descriptor", () => {
	test("declares an absolute filesystem command directory", () => {
		expect(herdrExtension).toEqual({
			description: "Run Herdr destination workflows.",
			commandDirectory: path.join(import.meta.dirname, "../src/ns/cli"),
		});
		expect(path.isAbsolute(herdrExtension.commandDirectory)).toBe(true);
	});

	test("keeps the agent operation hidden under exec with route-local metadata", async () => {
		const herdrDirectory = path.join(herdrExtension.commandDirectory, "herdr");
		const execGroup = await import("../src/ns/cli/herdr/exec/group.ts");
		expect(execGroup.group()).toMatchObject({ hidden: true });

		const launchDirectory = path.join(herdrDirectory, "exec", "handoff-tab", "launch");
		const routeFiles = (await readdir(launchDirectory)).sort();
		expect(routeFiles).toEqual(["command.ts", "metadata.ts"]);
		const loaded = await import("../src/ns/cli/herdr/exec/handoff-tab/launch/command.ts");
		expect(Object.keys(loaded)).toEqual(["command"]);
		await expect(loaded.command()).resolves.toBe(herdrHandoffTabLaunchCommand);
		const launchMetadata = await import("../src/ns/cli/herdr/exec/handoff-tab/launch/metadata.ts");
		expect(launchMetadata.metadata()).toMatchObject({
			summary: "Launch a stored handoff in a focused Herdr tab.",
		});
		expect(EXPECTED_ROUTES).toEqual(["herdr exec handoff-tab launch"]);
	});
});
