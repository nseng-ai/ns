import { rmSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { loadSdlCommandCatalog, loadSelectedSdlCommand } from "../../src/extension-registry.ts";
import { installCheckedInFlowExtension } from "../helpers/flow-extension.ts";

const tempDirs: string[] = [];

afterEach(() => {
	for (const directory of tempDirs.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("checked-in flow SDL extension registry loading", () => {
	test("real loader discovers and imports every checked-in flow command entry", async () => {
		const directory = await mkdtemp(join(tmpdir(), "sdl-flow-extension-registry-"));
		tempDirs.push(directory);
		const cwd = join(directory, "project");
		const homeDir = join(directory, "home");
		installCheckedInFlowExtension(cwd);

		const catalog = await loadSdlCommandCatalog({ cwd, homeDir });

		expect(catalog.diagnostics).toEqual([]);
		expect([...catalog.candidates.keys()]).toEqual([
			"flow/autobranch",
			"flow/autoslot",
			"flow/branch-latest-commit",
			"flow/changes",
			"flow/cp",
			"flow/land",
			"flow/pull-trunk",
			"flow/push",
			"flow/regenerate-pr",
			"flow/submit",
		]);

		const failures: string[] = [];
		for (const [key, candidate] of catalog.candidates) {
			const loaded = await loadSelectedSdlCommand(candidate);
			if (!loaded.ok) failures.push(`${key}: ${loaded.diagnostic.message}`);
		}
		expect(failures).toEqual([]);
	});
});
