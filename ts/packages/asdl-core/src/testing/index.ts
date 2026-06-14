import { spawnSync } from "node:child_process";
import { mkdir, readFile, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
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

export interface TempDirTracker {
	makeTempDir(prefix?: string): Promise<string>;
	makeHomeTempDir(prefix?: string): Promise<string>;
	cleanup(): Promise<void>;
}

export interface TempRepoSkill {
	readonly repoDir: string;
	readonly skillDir: string;
	readonly skillPath: string;
}

export interface TempRepoSkillOptions {
	readonly skillName: string;
	readonly markdown: string;
	readonly prefix?: string;
}

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
			const result = spawnSync(process.execPath, [options.cliSourcePathFromWorkspace, "--runtime"], {
				cwd: workspaceRoot,
				encoding: "utf8",
			});

			expect(result.status, result.stderr).toBe(0);
			expect(result.stdout).toBe(options.runtimeDiagnostics);
		});
	});
}

export function createTempDirTracker(): TempDirTracker {
	const tempDirs: string[] = [];
	const homeTempDirs: string[] = [];

	return {
		async makeTempDir(prefix = "asdl-test-"): Promise<string> {
			const dir = await realpath(await mkdtemp(join(tmpdir(), prefix)));
			tempDirs.push(dir);
			return dir;
		},
		async makeHomeTempDir(prefix = ".asdl-test-"): Promise<string> {
			const dir = await realpath(await mkdtemp(join(homedir(), prefix)));
			homeTempDirs.push(dir);
			return dir;
		},
		async cleanup(): Promise<void> {
			const dirs = tempDirs.splice(0);
			const homes = homeTempDirs.splice(0);
			await Promise.all([...dirs, ...homes].map((dir) => rm(dir, { recursive: true, force: true })));
		},
	};
}

export async function withTempRepoSkill<T>(options: TempRepoSkillOptions, callback: (skill: TempRepoSkill) => Promise<T>): Promise<T> {
	const repoDir = await realpath(await mkdtemp(join(tmpdir(), options.prefix ?? `${options.skillName}-repo-`)));
	const skillDir = join(repoDir, "skills", options.skillName);
	const skillPath = join(skillDir, "SKILL.md");
	await mkdir(skillDir, { recursive: true });
	await writeFile(skillPath, options.markdown, "utf8");
	try {
		return await callback({ repoDir, skillDir, skillPath });
	} finally {
		await rm(repoDir, { recursive: true, force: true });
	}
}
