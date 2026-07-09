import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { runCliWithFakes } from "./ns-cli-fakes.ts";
import {
	createExtensionRegistryWorkspace,
	writeWorkspaceFile,
} from "../helpers/extension-workspace.ts";

const npmInstallArgsPrefix =
	"install --no-save --package-lock=false --ignore-scripts --legacy-peer-deps";

describe("ns install", () => {
	test("installs a local package and records the source spec", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		writeDescriptorPackage(workspace.cwd, "tools");

		const run = runCliWithFakes(
			{
				args: ["install", "./extensions/tools", "--format", "json"],
				cwd: workspace.cwd,
				homeDir: workspace.homeDir,
				state: {
					exec: [
						{
							match: (call) =>
								call.command === "npm" &&
								call.args.join(" ").startsWith(npmInstallArgsPrefix) &&
								call.options?.cwd === join(workspace.cwd, ".ns", "managed-extensions", "npm"),
							result: { stdout: "installed\n" },
						},
					],
				},
			},
			{ execResponses: () => [], textGenerationResults: () => [] },
		);

		expect(await run.exit).toBe(0);
		expect(JSON.parse(run.stdout.join(""))).toMatchObject({
			status: "ok",
			data: {
				sourceSpec: "./extensions/tools",
				packageName: "tools",
				packageVersion: "1.0.0",
				managedRoot: join(
					workspace.cwd,
					".ns",
					"managed-extensions",
					"npm",
					"node_modules",
					"tools",
				),
				nsTomlPath: join(workspace.cwd, "ns.toml"),
				isRecorded: true,
			},
		});
		expect(readFileSync(join(workspace.cwd, "ns.toml"), "utf8")).toBe(
			'extensions = ["./extensions/tools"]\n',
		);
	});

	test("rerun is idempotent for ns.toml recording", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		writeDescriptorPackage(workspace.cwd, "tools");
		writeWorkspaceFile(join(workspace.cwd, "ns.toml"), 'extensions = ["./extensions/tools"]\n');

		const run = runInstall(workspace.cwd, workspace.homeDir, [
			{ match: /^npm install/u, result: { stdout: "installed\n" } },
		]);

		expect(await run.exit).toBe(0);
		expect(JSON.parse(run.stdout.join(""))).toMatchObject({
			status: "ok",
			data: { isRecorded: false },
		});
		expect(readFileSync(join(workspace.cwd, "ns.toml"), "utf8")).toBe(
			'extensions = ["./extensions/tools"]\n',
		);
	});

	test("rejects future remote source forms as usage errors", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		const run = runCliWithFakes(
			{
				args: ["install", "npm:@acme/tools", "--format", "json"],
				cwd: workspace.cwd,
				homeDir: workspace.homeDir,
				state: { exec: [] },
			},
			{ execResponses: () => [], textGenerationResults: () => [] },
		);

		expect(await run.exit).toBe(2);
		expect(JSON.parse(run.stdout.join(""))).toMatchObject({
			status: "usageError",
			errorType: "usageError",
			data: { sourceSpec: "npm:@acme/tools", unsupportedType: "npm" },
		});
	});

	test.each([
		{
			name: "missing source",
			setup: () => undefined,
			expectedErrorType: "missing-source",
		},
		{
			name: "invalid package.json",
			setup: (cwd: string) =>
				writeWorkspaceFile(join(cwd, "extensions", "tools", "package.json"), "{}"),
			expectedErrorType: "invalid-package-json",
		},
		{
			name: "missing descriptor export",
			setup: (cwd: string) =>
				writeWorkspaceFile(
					join(cwd, "extensions", "tools", "package.json"),
					JSON.stringify({ name: "tools", version: "1.0.0" }),
				),
			expectedErrorType: "missing-descriptor-export",
		},
		{
			name: "npm failure",
			setup: (cwd: string) => writeDescriptorPackage(cwd, "tools"),
			exec: [{ match: /^npm install/u, result: { code: 1, stderr: "nope\n" } }],
			expectedErrorType: "npm-install-failed",
		},
		{
			name: "invalid ns.toml",
			setup: (cwd: string) => {
				writeDescriptorPackage(cwd, "tools");
				writeWorkspaceFile(join(cwd, "ns.toml"), "extensions = [\n");
			},
			exec: [{ match: /^npm install/u, result: { stdout: "installed\n" } }],
			expectedErrorType: "ns-toml-parse-failed",
		},
	])("returns a failure envelope for $name", async (testCase) => {
		const workspace = await createExtensionRegistryWorkspace();
		testCase.setup(workspace.cwd);

		const run = runInstall(workspace.cwd, workspace.homeDir, testCase.exec ?? []);

		expect(await run.exit).toBe(2);
		expect(JSON.parse(run.stdout.join(""))).toMatchObject({
			status: "failure",
			errorType: testCase.expectedErrorType,
		});
	});
});

function runInstall(
	cwd: string,
	homeDir: string,
	exec: NonNullable<Parameters<typeof runCliWithFakes>[0]["state"]>["exec"],
) {
	return runCliWithFakes(
		{
			args: ["install", "./extensions/tools", "--format", "json"],
			cwd,
			homeDir,
			state: exec === undefined ? {} : { exec },
		},
		{ execResponses: () => [], textGenerationResults: () => [] },
	);
}

function writeDescriptorPackage(cwd: string, packageName: string): void {
	writeWorkspaceFile(
		join(cwd, "extensions", packageName, "package.json"),
		JSON.stringify({
			name: packageName,
			version: "1.0.0",
			exports: { "./ns-extension": "./src/ns/extension.ts" },
		}),
	);
	writeWorkspaceFile(
		join(cwd, "extensions", packageName, "src", "ns", "extension.ts"),
		"export default {};\n",
	);
}
