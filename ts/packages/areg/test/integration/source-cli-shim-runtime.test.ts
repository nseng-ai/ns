import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createTempDirTracker } from "@sdl/core/testing";
import { afterEach, describe, expect, test } from "vitest";

const tempDirs = createTempDirTracker();

const renderScriptPath = fileURLToPath(
	new URL("../../../../scripts/render-cli-shim.mjs", import.meta.url),
);
const templatePath = fileURLToPath(
	new URL("../../../../scripts/source-cli-shim-template", import.meta.url),
);

afterEach(async () => {
	await tempDirs.cleanup();
});

describe("areg source CLI shim runtime", () => {
	test("renders with real Node and preserves shell runtime failure behavior", async () => {
		const tempRoot = await tempDirs.makeTempDir("areg-shim-render-");
		const executionRoot = await tempDirs.makeTempDir("areg-shim-cwd-");
		const outputPath = join(tempRoot, "areg-shim");
		const canonicalCheckout = join(tempRoot, "checkout with spaces & pipes | back\\slash ' quote");
		const installHint = "just install-areg or just install-tools";

		const render = spawnSync(process.execPath, [renderScriptPath], {
			env: {
				...process.env,
				SDL_TEMPLATE: templatePath,
				SDL_OUTPUT: outputPath,
				SDL_TOOL: "areg",
				SDL_CANONICAL_CHECKOUT: canonicalCheckout,
				SDL_CLI_REL_PATH: "ts/packages/areg/src/cli.ts",
				SDL_INSTALL_HINT: installHint,
			},
			encoding: "utf8",
		});

		expect(render.status).toBe(0);
		expect(render.stderr).toBe("");

		const rendered = await readFile(outputPath, "utf8");
		expect(rendered).not.toContain("@@SDL_");

		const syntaxCheck = spawnSync("bash", ["-n", outputPath], { encoding: "utf8" });
		expect(syntaxCheck.status).toBe(0);
		expect(syntaxCheck.stderr).toBe("");

		const run = spawnSync("bash", [outputPath], {
			cwd: executionRoot,
			encoding: "utf8",
		});
		expect(run.status).toBe(2);
		expect(run.stdout).toBe("");
		expect(run.stderr).toContain("areg: no sdl checkout found");
		expect(run.stderr).toContain(canonicalCheckout);
		expect(run.stderr).toContain("ts/packages/areg/src/cli.ts");
		expect(run.stderr).toContain(installHint);
	});
});
