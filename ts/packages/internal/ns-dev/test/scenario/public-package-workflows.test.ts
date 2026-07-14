import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveVerifyDelaysMs } from "../../src/commands/public-package-workflows.ts";
import { intendedPublicPackages, workspaceRoot } from "../../src/public-packages/package-set.ts";
import { sdkFoldEntries, sdkPublicExports } from "../../src/public-packages/sdk-public-subpaths.ts";
import { parseJsonOutput, runScenario } from "./run-scenario.ts";

function packageSetFiles(version: string): Record<string, string> {
	const files: Record<string, string> = {
		[resolve(workspaceRoot, "package.json")]: JSON.stringify({ engines: { node: ">=24" } }),
		[resolve(workspaceRoot, "pnpm-workspace.yaml")]: "catalog:\n  '@types/node': 24.0.0\n",
	};
	for (const [index, name] of intendedPublicPackages.entries()) {
		const exports =
			name === "@nseng-ai/sdk"
				? sdkPublicExports()
				: name === "@nseng-ai/ns"
					? Object.fromEntries(
							sdkFoldEntries.map((entry) => [entry.nsExport, `./src/sdk/${entry.name}.ts`]),
						)
					: undefined;
		files[resolve(workspaceRoot, "packages", `fixture-${index}`, "package.json")] = JSON.stringify({
			name,
			version,
			...(exports === undefined ? {} : { exports }),
		});
	}
	return files;
}

describe("typed public-package workflows", () => {
	it("bumps manifests and refreshes the lockfile without executing a legacy script", async () => {
		const files = packageSetFiles("1.0.0");
		const run = runScenario(["bump-public-package-version", "1.2.3", "--format", "json"], {
			files,
		});

		expect(await run.exit).toBe(0);
		expect(run.calls).toEqual([
			{
				command: "corepack",
				args: [
					"pnpm@11.8.0",
					"--config.verify-deps-before-run=false",
					"--dir",
					workspaceRoot,
					"install",
					"--lockfile-only",
				],
				cwd: resolve(workspaceRoot, ".."),
			},
		]);
		expect(run.calls.flatMap((call) => call.args).join(" ")).not.toContain("ts/scripts");
		expect(parseJsonOutput(run)).toMatchObject({
			status: "ok",
			data: { version: "1.2.3", changedPackages: intendedPublicPackages },
		});
	});

	it("prepares the explicitly passed package root and resolves catalog dependencies", async () => {
		const files = packageSetFiles("1.0.0");
		const packageRoot = resolve(workspaceRoot, "packages", "fixture-0");
		files[resolve(workspaceRoot, "pnpm-workspace.yaml")] = "catalog:\n  zod: 4.3.6\n";
		files[resolve(packageRoot, "package.json")] = JSON.stringify({
			name: intendedPublicPackages[0],
			version: "1.0.0",
			type: "module",
			files: ["src"],
			dependencies: { zod: "catalog:" },
		});
		files[resolve(packageRoot, "src", "index.ts")] = "export {};\n";
		const run = runScenario(["prepare-source-publish-package", packageRoot, "--format", "json"], {
			cwd: workspaceRoot,
			files,
		});

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "ok",
			data: { publishRoot: resolve(packageRoot, "dist", "publish") },
		});
		const publishManifestWrite = run.fs.writtenFiles.find(
			(entry) => entry.path === resolve(packageRoot, "dist", "publish", "package.json"),
		);
		expect(publishManifestWrite).toBeDefined();
		const publishManifest = JSON.parse(publishManifestWrite?.content ?? "{}");
		expect(publishManifest.dependencies).toEqual({ zod: "4.3.6" });
		expect(JSON.stringify(publishManifest)).not.toMatch(/workspace:|catalog:/u);
	});

	it("converts legacy verification seconds while retaining repeated millisecond delays", () => {
		expect(
			resolveVerifyDelaysMs({
				verifyDelayMs: ["25", "50"],
				verifyDelaySeconds: ["1", "3"],
			}),
		).toEqual([25, 50, 1_000, 3_000]);
	});

	it("creates and cleans an SDK consumer fixture through injected filesystem and command seams", async () => {
		const run = runScenario(["smoke-sdk-consumer-resolution", "/publish/sdk", "--format", "json"], {
			files: {
				[resolve(workspaceRoot, "pnpm-workspace.yaml")]: "catalog:\n  '@types/node': 24.0.0\n",
			},
		});

		expect(await run.exit).toBe(0);
		expect(run.calls.map((call) => call.command)).toEqual([
			"npm",
			resolve(workspaceRoot, "node_modules", ".bin", "tsc"),
		]);
		expect(run.calls.flatMap((call) => call.args).join(" ")).not.toContain("ts/scripts");
		expect(run.fs.removedPaths).toEqual([expect.stringContaining("ns-sdk-consumer-fake")]);
	});

	it("renders a CLI shim directly from injected environment and filesystem seams", async () => {
		const run = runScenario(["render-cli-shim", "--format", "json"], {
			env: {
				NS_TEMPLATE: "/template",
				NS_OUTPUT: "/output",
				NS_TOOL: "ns",
				NS_CANONICAL_CHECKOUT: "/repo",
				NS_CLI_REL_PATH: "ts/bin/ns.ts",
				NS_INSTALL_HINT: "install ns",
			},
			files: {
				"/template":
					"@@NS_TOOL@@ @@NS_CANONICAL_CHECKOUT@@ @@NS_CLI_REL_PATH@@ @@NS_INSTALL_HINT@@ @@NS_FALLBACK_MODE@@\n",
			},
		});

		expect(await run.exit).toBe(0);
		expect(run.calls).toEqual([]);
		expect(run.fs.writtenFiles).toContainEqual({
			path: "/output",
			content: "ns /repo ts/bin/ns.ts 'install ns' literal\n",
		});
	});
});
