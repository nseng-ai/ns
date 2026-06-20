import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { createTempDirTracker } from "@asdl/core/testing";
import { afterEach, describe, expect, test } from "vitest";

const tempDirs = createTempDirTracker();

afterEach(async () => {
	await tempDirs.cleanup();
});

describe("areg source CLI shim rendering", () => {
	const renderScriptPath = fileURLToPath(
		new URL("../../../../scripts/render-cli-shim.mjs", import.meta.url),
	);
	const templatePath = fileURLToPath(
		new URL("../../../../scripts/source-cli-shim-template", import.meta.url),
	);

	test("renders adversarial canonical checkout paths as shell literals", async () => {
		const tempRoot = await tempDirs.makeTempDir("areg-shim-render-");
		const executionRoot = await tempDirs.makeTempDir("areg-shim-cwd-");
		const outputPath = join(tempRoot, "areg-shim");
		const canonicalCheckout = join(tempRoot, "checkout with spaces & pipes | back\\slash ' quote");
		const installHint = "just install-areg or just install-tools";

		const render = spawnSync("node", [renderScriptPath], {
			env: {
				...process.env,
				ASDL_TEMPLATE: templatePath,
				ASDL_OUTPUT: outputPath,
				ASDL_TOOL: "areg",
				ASDL_CANONICAL_CHECKOUT: canonicalCheckout,
				ASDL_CLI_REL_PATH: "ts/packages/areg/src/cli.ts",
				ASDL_INSTALL_HINT: installHint,
			},
			encoding: "utf8",
		});

		expect(render.status).toBe(0);
		expect(render.stderr).toBe("");

		const rendered = await readFile(outputPath, "utf8");
		expect(rendered).not.toContain("@@ASDL_");
		expect(rendered).toContain("tool=areg\n");
		expect(rendered).toContain("fallback_mode=literal\n");
		expect(rendered).toContain("canonical_checkout='");
		expect(rendered).toContain("'\"'\"'");
		expect(rendered).not.toContain(`canonical_checkout=${canonicalCheckout}\n`);

		const syntaxCheck = spawnSync("bash", ["-n", outputPath], { encoding: "utf8" });
		expect(syntaxCheck.status).toBe(0);
		expect(syntaxCheck.stderr).toBe("");

		const run = spawnSync("bash", [outputPath], {
			cwd: executionRoot,
			encoding: "utf8",
		});
		expect(run.status).toBe(2);
		expect(run.stdout).toBe("");
		expect(run.stderr).toContain("areg: no asdl checkout found");
		expect(run.stderr).toContain(canonicalCheckout);
		expect(run.stderr).toContain("ts/packages/areg/src/cli.ts");
		expect(run.stderr).toContain(installHint);
	});

	test("rejects unknown fallback modes", async () => {
		const tempRoot = await tempDirs.makeTempDir("areg-shim-render-invalid-");
		const outputPath = join(tempRoot, "areg-shim");

		const render = spawnSync("node", [renderScriptPath], {
			env: {
				...process.env,
				ASDL_TEMPLATE: templatePath,
				ASDL_OUTPUT: outputPath,
				ASDL_TOOL: "areg",
				ASDL_CANONICAL_CHECKOUT: tempRoot,
				ASDL_CLI_REL_PATH: "ts/packages/areg/src/cli.ts",
				ASDL_INSTALL_HINT: "just install-areg",
				ASDL_FALLBACK_MODE: "surprise",
			},
			encoding: "utf8",
		});

		expect(render.status).toBe(2);
		expect(render.stdout).toBe("");
		expect(render.stderr).toContain("invalid ASDL_FALLBACK_MODE 'surprise'");
		expect(render.stderr).toContain("literal, script-checkout");
	});
});
