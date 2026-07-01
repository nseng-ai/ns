import { spawnSync } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createTempDirTracker } from "@sdl/test-kit";
import { afterEach, describe, expect, test } from "vitest";

const tempDirs = createTempDirTracker();

const renderScriptPath = fileURLToPath(
	new URL("../../../../../scripts/render-cli-shim.mjs", import.meta.url),
);
const templatePath = fileURLToPath(
	new URL("../../../../../scripts/source-cli-shim-template", import.meta.url),
);
const CLI_REL_PATH = "ts/packages/tools/areg/src/cli.ts";

interface RenderShimOptions {
	readonly outputPath: string;
	readonly canonicalCheckout: string;
	readonly installHint: string;
}

function renderShim(options: RenderShimOptions) {
	return spawnSync(process.execPath, [renderScriptPath], {
		env: {
			...process.env,
			SDL_TEMPLATE: templatePath,
			SDL_OUTPUT: options.outputPath,
			SDL_TOOL: "areg",
			SDL_CANONICAL_CHECKOUT: options.canonicalCheckout,
			SDL_CLI_REL_PATH: CLI_REL_PATH,
			SDL_INSTALL_HINT: options.installHint,
		},
		encoding: "utf8",
	});
}

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

		const render = renderShim({ outputPath, canonicalCheckout, installHint });

		expect(render.status).toBe(0);
		expect(render.stderr).toBe("");

		const rendered = await readFile(outputPath, "utf8");
		expect(rendered).not.toContain("@@SDL_");
		expect(rendered).not.toContain("asdl TypeScript CLI");
		expect(rendered).not.toContain("no asdl checkout found");
		expect(rendered).not.toContain("ts/packages/areg/src/cli.ts");
		expect(rendered).not.toContain("/asdl-tools/");

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
		expect(run.stderr).toContain("ts/packages/tools/areg/src/cli.ts");
		expect(run.stderr).toContain(installHint);
		expect(run.stderr).not.toContain("no asdl checkout found");
		expect(run.stderr).not.toContain("ts/packages/areg/src/cli.ts");
	});

	test("runs the enclosing checkout before a missing canonical fallback", async () => {
		const tempRoot = await tempDirs.makeTempDir("areg-shim-checkout-lookup-");
		const checkoutRoot = join(tempRoot, "checkout");
		const checkoutCwd = join(checkoutRoot, "nested", "workdir");
		const cliPath = join(checkoutRoot, CLI_REL_PATH);
		const outputPath = join(tempRoot, "areg-shim");
		const missingCanonicalCheckout = join(tempRoot, "missing-canonical-checkout");
		const installHint = "just install-areg or just install-tools";

		await mkdir(join(checkoutRoot, "ts/node_modules"), { recursive: true });
		await mkdir(join(checkoutRoot, "ts/packages/tools/areg/src"), { recursive: true });
		await mkdir(checkoutCwd, { recursive: true });
		await writeFile(
			cliPath,
			`#!/usr/bin/env node\nconsole.log("fake areg from checkout " + process.argv.slice(2).join(" "));\n`,
			"utf8",
		);

		const gitInit = spawnSync("git", ["init"], { cwd: checkoutRoot, encoding: "utf8" });
		expect(gitInit.status).toBe(0);

		const render = renderShim({
			outputPath,
			canonicalCheckout: missingCanonicalCheckout,
			installHint,
		});

		expect(render.status).toBe(0);
		expect(render.stderr).toBe("");
		await chmod(outputPath, 0o755);

		const run = spawnSync("bash", [outputPath, "hello", "checkout"], {
			cwd: checkoutCwd,
			encoding: "utf8",
		});

		expect(run.status).toBe(0);
		expect(run.stdout).toBe("fake areg from checkout hello checkout\n");
		expect(run.stderr).toBe("");
	});
});
