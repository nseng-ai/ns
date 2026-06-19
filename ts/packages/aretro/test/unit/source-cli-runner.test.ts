import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createTempDirTracker } from "@asdl/core/testing";
import { afterEach, describe, expect, test } from "vitest";

const tempDirs = createTempDirTracker();

afterEach(async () => {
	await tempDirs.cleanup();
});

describe("aretro source CLI skill runner", () => {
	test("matches the checked-in runner rendered from the shared template", async () => {
		const tempRoot = await tempDirs.makeTempDir("aretro-runner-render-");
		const outputPath = join(tempRoot, "aretro-run");
		const repoRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
		const renderScriptPath = fileURLToPath(
			new URL("../../../../scripts/render-cli-shim.py", import.meta.url),
		);
		const templatePath = fileURLToPath(
			new URL("../../../../scripts/source-cli-shim-template", import.meta.url),
		);
		const checkedInRunnerPath = join(repoRoot, "skills/branch-retro/scripts/aretro-run");

		const render = spawnSync("python", [renderScriptPath], {
			env: {
				...process.env,
				ASDL_TEMPLATE: templatePath,
				ASDL_OUTPUT: outputPath,
				ASDL_TOOL: "aretro",
				ASDL_CANONICAL_CHECKOUT: "unused-for-script-checkout",
				ASDL_CLI_REL_PATH: "ts/packages/aretro/src/cli.ts",
				ASDL_INSTALL_HINT:
					"run from an asdl checkout with 'just ts-install' available, or install the TypeScript shim with 'just install-aretro'",
				ASDL_FALLBACK_MODE: "script-checkout",
			},
			encoding: "utf8",
		});

		expect(render.status).toBe(0);
		expect(render.stderr).toBe("");

		const rendered = await readFile(outputPath, "utf8");
		const checkedInRunner = await readFile(checkedInRunnerPath, "utf8");
		expect(rendered).toBe(checkedInRunner);

		const syntaxCheck = spawnSync("bash", ["-n", checkedInRunnerPath], { encoding: "utf8" });
		expect(syntaxCheck.status).toBe(0);
		expect(syntaxCheck.stderr).toBe("");
	});
});
