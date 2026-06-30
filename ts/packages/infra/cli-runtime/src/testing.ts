import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

export interface NodeRuntimeCliEntrypointOptions {
	readonly name: string;
	readonly workspaceRoot: URL;
	readonly cliSourcePathFromWorkspace: string;
	readonly cliSourceUrl: URL;
	readonly helpAssertions: readonly NodeRuntimeHelpAssertion[];
	readonly runtimeDiagnostics: string;
}

export type NodeRuntimeHelpAssertion =
	| { readonly type: "contains"; readonly text: string }
	| { readonly type: "not_contains"; readonly text: string };

export function describeNodeRuntimeCliEntrypoint(options: NodeRuntimeCliEntrypointOptions): void {
	const workspaceRoot = fileURLToPath(options.workspaceRoot);

	describe(options.name, () => {
		test("the committed source has a Node shebang", async () => {
			const source = await readFile(options.cliSourceUrl, "utf8");

			expect(source.split("\n", 1)[0]).toBe("#!/usr/bin/env node");
		});

		test("Node executes the TypeScript source entrypoint directly", () => {
			const result = spawnSync(process.execPath, [options.cliSourcePathFromWorkspace, "--help"], {
				cwd: workspaceRoot,
				encoding: "utf8",
			});

			expect(result.status, result.stderr).toBe(0);
			for (const assertion of options.helpAssertions) {
				if (assertion.type === "contains") {
					expect(result.stdout).toContain(assertion.text);
				} else {
					expect(result.stdout).not.toContain(assertion.text);
				}
			}
		});

		test("prints TypeScript runtime diagnostics", () => {
			const result = spawnSync(
				process.execPath,
				[options.cliSourcePathFromWorkspace, "--runtime"],
				{
					cwd: workspaceRoot,
					encoding: "utf8",
				},
			);

			expect(result.status, result.stderr).toBe(0);
			expect(result.stdout).toBe(options.runtimeDiagnostics);
		});
	});
}
