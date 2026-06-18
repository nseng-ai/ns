import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { LoadedBundle, RunBundle } from "./models.ts";
import { encodeRunBundle, parseRunBundle } from "./models.ts";

export const RUNS_DIR_NAME = "runs";
export const BUNDLE_FILE_NAME = "bundle.json";
export const PLAN_FILE_NAME = "plan.md";
export const TRANSCRIPT_FILE_NAME = "transcript.txt";
export const DIFF_FILE_NAME = "diff.patch";
export const ARTIFACTS_DIR_NAME = "artifacts";

export class VibechkError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "VibechkError";
	}
}

export function resolveStoreRoot(
	explicit: string | undefined,
	env: Record<string, string | undefined>,
): string {
	if (explicit !== undefined) {
		return expandTilde(explicit);
	}

	const vibechkHome = env["VIBECHK_HOME"];
	if (vibechkHome !== undefined && vibechkHome !== "") {
		return expandTilde(vibechkHome);
	}

	const xdgStateHome = env["XDG_STATE_HOME"];
	if (xdgStateHome !== undefined && xdgStateHome !== "") {
		return join(expandTilde(xdgStateHome), "vibechk");
	}

	const home = env["HOME"];
	if (home === undefined) {
		throw new VibechkError("HOME environment variable is not set");
	}
	return join(expandTilde(home), ".local", "state", "vibechk");
}

function expandTilde(path: string): string {
	if (path.startsWith("~/")) {
		const home = process.env["HOME"];
		if (home === undefined) {
			throw new VibechkError("HOME environment variable is not set");
		}
		return join(home, path.slice(2));
	}
	return path;
}

export async function resolveRunId(storeRoot: string, idOrPrefix: string): Promise<string> {
	const runsDir = join(storeRoot, RUNS_DIR_NAME);

	let runDirs: string[];
	try {
		const entries = await readdir(runsDir, { withFileTypes: true });
		runDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name.toString());
	} catch (error: unknown) {
		if (isNodeError(error) && error.code === "ENOENT") {
			throw new VibechkError(`No run matches prefix '${idOrPrefix}'.`);
		}
		throw error;
	}

	// Check for exact match first
	if (runDirs.includes(idOrPrefix)) {
		return idOrPrefix;
	}

	// Find prefix matches
	const matches = runDirs.filter((name) => name.startsWith(idOrPrefix)).sort();

	if (matches.length === 0) {
		throw new VibechkError(`No run matches prefix '${idOrPrefix}'.`);
	}

	if (matches.length > 1) {
		throw new VibechkError(`Run prefix '${idOrPrefix}' is ambiguous: ${matches.join(", ")}.`);
	}

	return matches[0]!;
}

export async function readBundle(storeRoot: string, idOrPrefix: string): Promise<LoadedBundle> {
	const runId = await resolveRunId(storeRoot, idOrPrefix);
	const runDir = join(storeRoot, RUNS_DIR_NAME, runId);
	return await loadBundleFromRunDir(runDir, `Run '${runId}'`);
}

export async function listBundles(storeRoot: string): Promise<LoadedBundle[]> {
	const runsDir = join(storeRoot, RUNS_DIR_NAME);

	try {
		const entries = await readdir(runsDir, { withFileTypes: true });

		if (entries.length === 0) {
			return [];
		}

		const runDirs = entries.filter((entry) => entry.isDirectory());

		const loaded: LoadedBundle[] = [];
		for (const dir of runDirs) {
			const runDir = join(runsDir, dir.name.toString());
			loaded.push(await loadBundleFromRunDir(runDir, `Run directory ${runDir}`));
		}

		// Sort newest first, with run_id as tie-breaker
		loaded.sort((a, b) => a.bundle.runId.localeCompare(b.bundle.runId));
		loaded.sort((a, b) => b.bundle.startedAt.getTime() - a.bundle.startedAt.getTime());

		return loaded;
	} catch (error: unknown) {
		if (isNodeError(error) && error.code === "ENOENT") {
			return [];
		}
		throw error;
	}
}

async function loadBundleFromRunDir(runDir: string, context: string): Promise<LoadedBundle> {
	const bundlePath = join(runDir, BUNDLE_FILE_NAME);

	let bundleText: string;
	try {
		bundleText = await readFile(bundlePath, "utf-8");
	} catch (error: unknown) {
		if (isNodeError(error) && error.code === "ENOENT") {
			throw new VibechkError(`${context} is missing bundle.json.`);
		}
		throw error;
	}

	let data: unknown;
	try {
		data = JSON.parse(bundleText);
	} catch (error: unknown) {
		throw new VibechkError(`${context} has an invalid bundle.json: ${error}`);
	}

	let bundle: RunBundle;
	try {
		bundle = parseRunBundle(data);
	} catch (error: unknown) {
		throw new VibechkError(`${context} has an invalid bundle.json: ${error}`);
	}

	const planText = await readOptionalFile(join(runDir, PLAN_FILE_NAME));
	const transcript = await readOptionalFile(join(runDir, TRANSCRIPT_FILE_NAME));
	const diffPatch = await readOptionalFile(join(runDir, DIFF_FILE_NAME));

	return {
		bundle,
		runDir,
		planText,
		transcript,
		diffPatch,
	};
}

async function readOptionalFile(path: string): Promise<string> {
	try {
		return await readFile(path, "utf-8");
	} catch (error: unknown) {
		if (isNodeError(error) && error.code === "ENOENT") {
			return "";
		}
		throw error;
	}
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error;
}

export async function createRunDir(
	storeRoot: string,
	idGenerator: () => string,
): Promise<{ runId: string; runDir: string }> {
	const runsDir = join(storeRoot, RUNS_DIR_NAME);
	await mkdir(runsDir, { recursive: true });

	for (let attempt = 0; attempt < 100; attempt++) {
		const runId = idGenerator().toLowerCase();
		const runDir = join(runsDir, runId);

		try {
			await mkdir(runDir, { recursive: false });
			const artifactsDir = join(runDir, ARTIFACTS_DIR_NAME);
			await mkdir(artifactsDir, { recursive: true });
			return { runId, runDir };
		} catch (error: unknown) {
			if (isNodeError(error) && error.code === "EEXIST") {
				continue;
			}
			throw error;
		}
	}

	throw new VibechkError("Failed to allocate a unique run ID after 100 attempts.");
}

export async function writeBundle(runDir: string, bundle: RunBundle): Promise<void> {
	const bundlePath = join(runDir, BUNDLE_FILE_NAME);
	const tempPath = join(runDir, `${BUNDLE_FILE_NAME}.tmp`);

	await writeFile(tempPath, JSON.stringify(encodeRunBundle(bundle), null, 2) + "\n", "utf-8");
	await rename(tempPath, bundlePath);
}
