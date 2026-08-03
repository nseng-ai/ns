import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

import { describe, expect, test } from "vitest";

const root = join(import.meta.dirname, "../../src/cli");

async function files(directory: string): Promise<readonly string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	return (
		await Promise.all(
			entries.map(async (entry) => {
				const path = join(directory, entry.name);
				return entry.isDirectory() ? await files(path) : [relative(root, path)];
			}),
		)
	)
		.flat()
		.sort();
}

describe("Objectives filesystem command structure", () => {
	test("has exact metadata/command pairs and a hidden exec group", async () => {
		const inventory = await files(root);
		const commands = inventory.filter((path) => path.endsWith("/command.ts"));
		expect(commands.map((path) => path.replace(/\/command\.ts$/, ""))).toEqual([
			"objective/check",
			"objective/exec/list-candidates",
			"objective/exec/load-orientations",
			"objective/exec/publication-bind",
			"objective/exec/publication-publish",
			"objective/exec/read-objective",
			"objective/exec/runner-begin",
			"objective/exec/runner-finish",
			"objective/exec/runner-subagent-usage",
			"objective/exec/staleness-check",
			"objective/list",
			"objective/show",
		]);
		for (const command of commands) {
			expect(inventory).toContain(command.replace(/command\.ts$/, "metadata.ts"));
		}
		expect(await readFile(join(root, "objective/exec/group.ts"), "utf8")).toContain("hidden: true");
	});
});
