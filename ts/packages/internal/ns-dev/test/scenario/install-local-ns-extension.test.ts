import { parse as parseToml } from "smol-toml";
import { describe, expect, it } from "vitest";

import { exitedResult, parseJsonOutput, runScenario, type ScenarioRun } from "./run-scenario.ts";

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
				args: ["install", "--save-dev", "/repo/ts/packages/hosts/ns/dist/publish"],
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
		expect(extensionsFromWrittenToml(run)).toEqual(["./node_modules/@nseng-ai/example-extension"]);
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
		const parsedToml = parsedWrittenToml(run);
		expect(parsedToml.harnesses).toEqual(["claude-code"]);
		expect(parsedToml.extensions).toEqual(["./node_modules/@nseng-ai/objectives"]);
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
				commandResults: [exitedResult({ stderr: "boom", code: 7 })],
			},
		);
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "failure",
			errorType: "subprocess-failed",
			data: {
				command: "pnpm",
				exitCode: 7,
				termination: "exited",
				signal: null,
				stderr: "boom",
			},
		});
	});

	it("returns spawn failure evidence without reconstructing an exit", async () => {
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
				commandResults: [
					{
						type: "spawn-failed",
						stdout: "",
						stderr: "spawn pnpm ENOENT",
						error: "spawn pnpm ENOENT",
					},
				],
			},
		);
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "failure",
			errorType: "subprocess-failed",
			data: {
				command: "pnpm",
				exitCode: null,
				termination: "spawn-failed",
				error: "spawn pnpm ENOENT",
				stderr: "spawn pnpm ENOENT",
			},
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
				args: ["install", "--save-dev", "/repo/ts/packages/hosts/ns/dist/publish"],
				cwd: "/target",
			},
		]);
		expect(extensionsFromWrittenToml(run)).toEqual(["./node_modules/@nseng-ai/objectives"]);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "ok",
			data: {
				packageName: "@nseng-ai/objectives",
				packagePath: "/repo/ts/packages/capabilities/objectives",
			},
		});
	});

	it("adds the extension to an existing extensions array", async () => {
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
				files: {
					...BASE_FILES,
					"/target/ns.toml":
						'extensions = ["./node_modules/@nseng-ai/objectives", "./node_modules/other"]\n',
				},
			},
		);
		expect(await run.exit).toBe(0);
		expect(extensionsFromWrittenToml(run)).toEqual([
			"./node_modules/@nseng-ai/objectives",
			"./node_modules/other",
			"./node_modules/@nseng-ai/example-extension",
		]);
	});

	it("skips rewriting ns.toml when the extension is already registered", async () => {
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
					"/target/ns.toml": 'extensions = ["./node_modules/@nseng-ai/objectives"]\n',
				},
			},
		);
		expect(await run.exit).toBe(0);
		expect(run.fs.writtenFiles.find((file) => file.path === "/target/ns.toml")).toBeUndefined();
	});

	it("fails when ns.toml extensions is not an array", async () => {
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
				files: {
					...BASE_FILES,
					"/target/ns.toml": 'extensions = "./node_modules/other"\n',
				},
			},
		);
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "failure",
			errorType: "ns-toml-invalid",
			data: { path: "/target/ns.toml", message: "ns.toml extensions must be an array of strings." },
		});
	});

	it("fails when ns.toml cannot be parsed", async () => {
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
				files: {
					...BASE_FILES,
					"/target/ns.toml": "extensions = [\n",
				},
			},
		);
		expect(await run.exit).toBe(2);
		const output = parseJsonOutput(run) as { data?: { path?: string; message?: string } };
		expect(output).toMatchObject({ status: "failure", errorType: "ns-toml-invalid" });
		expect(output.data?.path).toBe("/target/ns.toml");
		expect(typeof output.data?.message).toBe("string");
	});
});

function parsedWrittenToml(run: ScenarioRun, path = "/target/ns.toml"): Record<string, unknown> {
	const file = run.fs.writtenFiles.find((entry) => entry.path === path);
	if (file === undefined) throw new Error(`Expected written file at ${path}.`);
	return parseToml(file.content) as Record<string, unknown>;
}

function extensionsFromWrittenToml(run: ScenarioRun, path = "/target/ns.toml"): readonly string[] {
	const parsed = parsedWrittenToml(run, path);
	const extensions = parsed.extensions;
	expect(Array.isArray(extensions)).toBe(true);
	return extensions as string[];
}
