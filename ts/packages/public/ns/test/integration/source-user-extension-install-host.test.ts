import { lstat, mkdir, readFile, readdir, readlink, realpath, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

import { describe, expect, test } from "vitest";

import { installExtensionResultSchema, listExtensionsResultSchema } from "../../src/init/index.ts";
import { runNsCli } from "../../src/cli/index.ts";
import { createEmptyProject, parseJsonOutput } from "../support/cli-harness.ts";

interface SourceExtensionCase {
	readonly directoryName: string;
	readonly packageName: string;
}

interface TreeEntry {
	readonly path: string;
	readonly type: "directory" | "file" | "symlink";
	readonly mode: number;
	readonly content?: string;
	readonly target?: string;
}

interface CliRun {
	readonly exit: number;
	readonly stdout: string;
	readonly stderr: string;
}

const SOURCE_EXTENSIONS = [
	{ directoryName: "branch-context", packageName: "@nseng-ai/branch-context" },
	{ directoryName: "flow", packageName: "@nseng-ai/flow" },
	{ directoryName: "handoffs", packageName: "@nseng-ai/handoffs" },
	{ directoryName: "herdr", packageName: "@nseng-ai/herdr" },
	{ directoryName: "objectives", packageName: "@nseng-ai/objectives" },
	{ directoryName: "pr-feedback", packageName: "@nseng-ai/pr-feedback" },
	{ directoryName: "reviews", packageName: "@nseng-ai/reviews" },
	{ directoryName: "slots", packageName: "@nseng-ai/slots" },
] as const satisfies readonly SourceExtensionCase[];

const SKILL_EXPOSURE_PACKAGE = "@nseng-ai/skill-exposure";

describe("source user extension install host", () => {
	test.each(SOURCE_EXTENSIONS)(
		"installs $packageName for user command availability without activating the invocation directory",
		async ({ directoryName, packageName }) => {
			const root = await createEmptyProject();
			const invocation = join(root, "unrelated-non-git-invocation");
			const xdgConfigHome = join(root, "fresh-xdg-config");
			await mkdir(join(invocation, "existing", "nested"), { recursive: true });
			await writeFile(join(invocation, "existing", "nested", "marker.txt"), "unchanged\n");
			const packageRoot = await realpath(
				fileURLToPath(
					new URL(`../../../../incubating/extensions/${directoryName}/`, import.meta.url),
				),
			);
			const beforeInvocation = await snapshotTree(invocation);

			const installed = await runJson(
				["extension", "install", packageRoot, "--scope", "user"],
				invocation,
				xdgConfigHome,
			);

			expect(installed.exit).toBe(0);
			expect(installed.stderr).toBe("");
			const installedEnvelope = parseJsonOutput(installed);
			expect(installedEnvelope).toMatchObject({ status: "ok", exitCode: 0 });
			const installedResult = installExtensionResultSchema.parse(installedEnvelope.data);
			expect(installedResult).toEqual({
				scope: "user",
				sourceSpec: packageRoot,
				sourceKind: "local",
				packageName,
				packageVersion: expect.any(String),
				moduleRoot: packageRoot,
				configPath: join(xdgConfigHome, "ns", "ns.toml"),
				declarationAction: "appended",
				acquisitionOutcome: "local-in-place",
				commandAvailability: "available",
				activation: "not-performed",
			});

			const configBytes = await readFile(join(xdgConfigHome, "ns", "ns.toml"), "utf8");
			expect(configBytes).toBe(`extensions = [${JSON.stringify(packageRoot)}]\n`);
			expect(configBytes).not.toContain(SKILL_EXPOSURE_PACKAGE);

			const listed = await runJson(
				["extension", "list", "--scope", "user"],
				invocation,
				xdgConfigHome,
			);
			expect(listed.exit).toBe(0);
			expect(listed.stderr).toBe("");
			const listedEnvelope = parseJsonOutput(listed);
			expect(listedEnvelope).toMatchObject({ status: "ok", exitCode: 0 });
			const listedResult = listExtensionsResultSchema.parse(listedEnvelope.data);
			expect(listedResult).toEqual({
				scope: "user",
				configPath: join(xdgConfigHome, "ns", "ns.toml"),
				extensions: [
					{
						sourceSpec: packageRoot,
						sourceKind: "local",
						packageName,
						packageVersion: expect.any(String),
						moduleRoot: packageRoot,
						acquisitionStatus: "installed",
						commandAvailability: "available",
						diagnostics: [],
					},
				],
			});
			expect(JSON.stringify(listedResult)).not.toContain(SKILL_EXPOSURE_PACKAGE);
			expect(await snapshotTree(invocation)).toEqual(beforeInvocation);
		},
	);
});

async function runJson(
	args: readonly string[],
	cwd: string,
	xdgConfigHome: string,
): Promise<CliRun> {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const exit = await runNsCli([...args, "--format", "json"], {
		cwd,
		homeDir: cwd,
		env: { HOME: cwd, XDG_CONFIG_HOME: xdgConfigHome },
		stdout: (text) => stdout.push(text),
		stderr: (text) => stderr.push(text),
	});
	return { exit, stdout: stdout.join(""), stderr: stderr.join("") };
}

async function snapshotTree(root: string): Promise<readonly TreeEntry[]> {
	const entries: TreeEntry[] = [];
	async function visit(path: string): Promise<void> {
		const metadata = await lstat(path);
		const entryPath = relative(root, path) || ".";
		if (metadata.isDirectory()) {
			entries.push({ path: entryPath, type: "directory", mode: metadata.mode });
			const children = await readdir(path);
			for (const child of children.toSorted()) await visit(join(path, child));
			return;
		}
		if (metadata.isSymbolicLink()) {
			entries.push({
				path: entryPath,
				type: "symlink",
				mode: metadata.mode,
				target: await readlink(path),
			});
			return;
		}
		entries.push({
			path: entryPath,
			type: "file",
			mode: metadata.mode,
			content: (await readFile(path)).toString("base64"),
		});
	}
	await visit(root);
	return entries;
}
