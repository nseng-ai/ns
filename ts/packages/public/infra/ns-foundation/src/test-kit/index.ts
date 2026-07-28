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

export interface RequestObjectToArgvOptions {
	readonly positionalKeys?: readonly string[];
	readonly negatedBooleanKeys?: readonly string[];
}

/** Internal monorepo testing helper for ordered scripted expectations. */
export class ScriptedQueue<TStep> {
	private readonly errors: string[] = [];
	private readonly steps: TStep[];

	constructor(steps: readonly TStep[], copyStep: (step: TStep) => TStep) {
		this.steps = steps.map(copyStep);
	}

	peek(): TStep | undefined {
		return this.steps[0];
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

export function requestObjectToArgv(
	request: unknown,
	options: RequestObjectToArgvOptions = {},
): readonly string[] {
	if (typeof request !== "object" || request === null || Array.isArray(request)) return [];
	const entries = Object.entries(request);
	const positionalKeys = new Set(options.positionalKeys ?? []);
	const negatedBooleanKeys = new Set(options.negatedBooleanKeys ?? []);
	const positionals = entries.flatMap(([key, value]) =>
		positionalKeys.has(key) ? positionalRequestEntryToArgv(value) : [],
	);
	const flags = entries.flatMap(([key, value]) =>
		positionalKeys.has(key) ? [] : requestEntryToArgv(key, value, negatedBooleanKeys),
	);
	return [...positionals, ...flags];
}

function positionalRequestEntryToArgv(value: unknown): readonly string[] {
	if (value === undefined) return [];
	if (Array.isArray(value)) return value.map((entry) => String(entry));
	return [String(value)];
}

function requestEntryToArgv(
	key: string,
	value: unknown,
	negatedBooleanKeys: ReadonlySet<string>,
): readonly string[] {
	const flag = `--${kebabCase(key)}`;
	if (value === true) return [flag];
	if (value === false) return negatedBooleanKeys.has(key) ? [`--no-${kebabCase(key)}`] : [];
	if (value === undefined) return [];
	if (Array.isArray(value)) return value.flatMap((entry) => [flag, String(entry)]);
	return [flag, String(value)];
}

function kebabCase(value: string): string {
	return value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

export function createTempDirTracker(): TempDirTracker {
	const tempDirs: string[] = [];
	const homeTempDirs: string[] = [];

	return {
		async makeTempDir(prefix = "ns-test-"): Promise<string> {
			const dir = await realpath(await mkdtemp(join(tmpdir(), prefix)));
			tempDirs.push(dir);
			return dir;
		},
		async makeHomeTempDir(prefix = ".ns-test-"): Promise<string> {
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
	const tempDir = await realpath(await mkdtemp(join(tmpdir(), options.prefix ?? "ns-git-repo-")));
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
			const skillRoot = options.skillRoot ?? join(".agents", "skills");
			const skillDir = join(repoDir, skillRoot, options.skillName);
			const skillPath = join(skillDir, "SKILL.md");
			await mkdir(skillDir, { recursive: true });
			await writeFile(skillPath, options.markdown, "utf8");
			return await callback({ repoDir, skillDir, skillPath });
		},
	);
}
