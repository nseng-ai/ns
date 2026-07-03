import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "vitest";

export interface TempDirTracker {
	makeTempDir(prefix?: string): Promise<string>;
	makeHomeTempDir(prefix?: string): Promise<string>;
	cleanup(): Promise<void>;
}

export interface TempGitRepo {
	readonly repoDir: string;
	readonly tempDir: string;
}

export interface TempGitRepoOptions {
	readonly prefix?: string;
	readonly repoName?: string;
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
	readonly skillRoot?: string;
}

export interface Deferred<T> {
	readonly promise: Promise<T>;
	readonly resolve: (value: T) => void;
}

/** Internal monorepo testing helper for ordered scripted expectations. */
export class ScriptedQueue<TStep> {
	private readonly errors: string[] = [];
	private readonly steps: TStep[];

	constructor(steps: readonly TStep[], copyStep: (step: TStep) => TStep) {
		this.steps = steps.map(copyStep);
	}

	shiftOrRecordError(message: string): TStep | undefined {
		const stepValue = this.steps.shift();
		if (stepValue === undefined) {
			this.recordError(message);
		}
		return stepValue;
	}

	recordError(message: string): void {
		this.errors.push(message);
	}

	assertDone(): void {
		expect(this.errors).toEqual([]);
		expect(this.steps).toEqual([]);
	}
}

export function createDeferred<T>(): Deferred<T> {
	let resolve: ((value: T) => void) | undefined;
	const promise = new Promise<T>((innerResolve) => {
		resolve = innerResolve;
	});
	if (resolve === undefined) throw new Error("Deferred promise did not initialize");
	return { promise, resolve };
}

export function createTempDirTracker(): TempDirTracker {
	const tempDirs: string[] = [];
	const homeTempDirs: string[] = [];

	return {
		async makeTempDir(prefix = "sdl-test-"): Promise<string> {
			const dir = await realpath(await mkdtemp(join(tmpdir(), prefix)));
			tempDirs.push(dir);
			return dir;
		},
		async makeHomeTempDir(prefix = ".sdl-test-"): Promise<string> {
			const dir = await realpath(await mkdtemp(join(homedir(), prefix)));
			homeTempDirs.push(dir);
			return dir;
		},
		async cleanup(): Promise<void> {
			const dirs = tempDirs.splice(0);
			const homes = homeTempDirs.splice(0);
			await Promise.all(
				[...dirs, ...homes].map((dir) => rm(dir, { recursive: true, force: true })),
			);
		},
	};
}

export async function markGitRepo(repoDir: string): Promise<void> {
	await mkdir(join(repoDir, ".git"), { recursive: true });
}

export async function withTempGitRepo<T>(
	options: TempGitRepoOptions,
	callback: (repo: TempGitRepo) => Promise<T>,
): Promise<T> {
	const tempDir = await realpath(await mkdtemp(join(tmpdir(), options.prefix ?? "sdl-git-repo-")));
	const repoDir = options.repoName === undefined ? tempDir : join(tempDir, options.repoName);
	await markGitRepo(repoDir);
	const realRepoDir = await realpath(repoDir);
	try {
		return await callback({ repoDir: realRepoDir, tempDir });
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
}

export async function withTempRepoSkill<T>(
	options: TempRepoSkillOptions,
	callback: (skill: TempRepoSkill) => Promise<T>,
): Promise<T> {
	return await withTempGitRepo(
		{ prefix: options.prefix ?? `${options.skillName}-repo-` },
		async ({ repoDir }) => {
			const skillRoot = options.skillRoot ?? "skills";
			const skillDir = join(repoDir, skillRoot, options.skillName);
			const skillPath = join(skillDir, "SKILL.md");
			await mkdir(skillDir, { recursive: true });
			await writeFile(skillPath, options.markdown, "utf8");
			return await callback({ repoDir, skillDir, skillPath });
		},
	);
}
