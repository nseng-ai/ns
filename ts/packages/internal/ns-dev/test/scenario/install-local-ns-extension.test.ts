import { describe, expect, it } from "vitest";

import { parseJsonOutput, runScenario } from "./run-scenario.ts";

const BASE_FILES = {
	"/target/package.json": JSON.stringify({ name: "target" }),
	"/repo/ts/packages/extensions/example/package.json": JSON.stringify({
		name: "@nseng-ai/example-extension",
		version: "1.2.3",
		scripts: { "pack:local": "node pack.js" },
	}),
	"/repo/ts/packages/extensions/example/dist/nseng-ai-example-extension-1.2.3.tgz": "tgz",
	"/repo/ts/packages/capabilities/objectives/package.json": JSON.stringify({
		name: "@nseng-ai/objectives",
		version: "1.0.0",
	}),
	"/repo/tmp/local-npm-packs/nseng-ai-objectives-1.0.0.tgz": "tgz",
};

describe("install-local-ns-extension", () => {
	it("requires target package.json", async () => {
		const run = runScenario(
			[
				"install-local-ns-extension",
				"--target",
				"/missing",
				"--package",
				"@nseng-ai/example-extension",
				"--format",
				"json",
			],
			{
				files: BASE_FILES,
			},
		);
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "usageError",
			data: { argument: "--target", targetPath: "/missing" },
		});
	});

	it("packs with pack:local, copies the tarball, and installs it as dev dependency", async () => {
		const run = runScenario(
			[
				"install-local-ns-extension",
				"--target",
				"/target",
				"--package",
				"@nseng-ai/example-extension",
				"--format",
				"json",
			],
			{
				files: BASE_FILES,
			},
		);
		expect(await run.exit).toBe(0);
		expect(run.calls).toEqual([
			{
				command: "pnpm",
				args: ["--dir", "/repo/ts", "--filter", "@nseng-ai/example-extension", "run", "pack:local"],
				cwd: "/repo",
			},
			{
				command: "npm",
				args: [
					"install",
					"--save-dev",
					"/repo/tmp/local-npm-packs/nseng-ai-example-extension-1.2.3.tgz",
				],
				cwd: "/target",
			},
			{
				command: "pnpm",
				args: ["--dir", "/repo/ts", "--filter", "@nseng-ai/ns", "run", "pack:local"],
				cwd: "/repo",
			},
			{
				command: "npm",
				args: ["install", "--save-dev", "/repo/ts/packages/hosts/ns-cli/dist/publish"],
				cwd: "/target",
			},
		]);
		expect(run.fs.copiedFiles).toEqual([
			{
				source: "/repo/ts/packages/extensions/example/dist/nseng-ai-example-extension-1.2.3.tgz",
				destination: "/repo/tmp/local-npm-packs/nseng-ai-example-extension-1.2.3.tgz",
			},
		]);
		expect(run.stderr.join("")).toContain(
			"ns-dev: running pnpm --dir /repo/ts --filter @nseng-ai/example-extension run pack:local in /repo",
		);
		expect(run.stderr.join("")).toContain(
			"ns-dev: running npm install --save-dev /repo/tmp/local-npm-packs/nseng-ai-example-extension-1.2.3.tgz in /target",
		);
		expect(run.fs.writtenFiles).toContainEqual({
			path: "/target/ns.toml",
			content: 'extensions = ["./node_modules/@nseng-ai/example-extension"]\n',
		});
		expect(parseJsonOutput(run)).toMatchObject({
			status: "ok",
			data: {
				targetPath: "/target",
				packageName: "@nseng-ai/example-extension",
				packageVersion: "1.2.3",
				dependencyType: "dev",
			},
		});
	});

	it("appends extension registration to existing ns.toml", async () => {
		const run = runScenario(
			[
				"install-local-ns-extension",
				"--target",
				"/target",
				"--package",
				"@nseng-ai/objectives",
				"--format",
				"json",
			],
			{
				files: {
					...BASE_FILES,
					"/target/ns.toml": 'harnesses = ["claude-code"]\n',
				},
			},
		);
		expect(await run.exit).toBe(0);
		expect(run.fs.writtenFiles).toContainEqual({
			path: "/target/ns.toml",
			content:
				'harnesses = ["claude-code"]\n\nextensions = ["./node_modules/@nseng-ai/objectives"]\n',
		});
	});

	it("returns subprocess failure envelope", async () => {
		const run = runScenario(
			[
				"install-local-ns-extension",
				"--target",
				"/target",
				"--package",
				"@nseng-ai/example-extension",
				"--format",
				"json",
			],
			{
				files: BASE_FILES,
				commandResults: [{ stdout: "", stderr: "boom", code: 7, killed: false }],
			},
		);
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "failure",
			errorType: "subprocess-failed",
			data: { command: "pnpm", exitCode: 7, stderr: "boom" },
		});
	});

	it("installs objectives and other non-extension workspace packages", async () => {
		const run = runScenario(
			[
				"install-local-ns-extension",
				"--target",
				"/target",
				"--package",
				"@nseng-ai/objectives",
				"--format",
				"json",
			],
			{
				files: BASE_FILES,
			},
		);
		expect(await run.exit).toBe(0);
		expect(run.calls).toEqual([
			{
				command: "npm",
				args: [
					"pack",
					"/repo/ts/packages/capabilities/objectives",
					"--pack-destination",
					"/repo/tmp/local-npm-packs",
				],
				cwd: "/repo",
			},
			{
				command: "npm",
				args: ["install", "--save-dev", "/repo/tmp/local-npm-packs/nseng-ai-objectives-1.0.0.tgz"],
				cwd: "/target",
			},
			{
				command: "pnpm",
				args: ["--dir", "/repo/ts", "--filter", "@nseng-ai/ns", "run", "pack:local"],
				cwd: "/repo",
			},
			{
				command: "npm",
				args: ["install", "--save-dev", "/repo/ts/packages/hosts/ns-cli/dist/publish"],
				cwd: "/target",
			},
		]);
		expect(run.fs.writtenFiles).toContainEqual({
			path: "/target/ns.toml",
			content: 'extensions = ["./node_modules/@nseng-ai/objectives"]\n',
		});
		expect(parseJsonOutput(run)).toMatchObject({
			status: "ok",
			data: {
				packageName: "@nseng-ai/objectives",
				packagePath: "/repo/ts/packages/capabilities/objectives",
			},
		});
	});
});
