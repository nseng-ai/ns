import { readdirSync, readFileSync, type Dirent } from "node:fs";
import { join } from "node:path";

import { formatErrorMessage } from "@nseng-ai/foundation/primitives";

const HEADS_REF_PREFIX = "refs/heads/";

export type LocalBranchRefReadResult =
	| { ok: true; branches: ReadonlySet<string> }
	| {
			ok: false;
			reason: "branch-ref-read-failed";
			message: string;
			path: string;
			error: unknown;
	  };

export interface LocalBranchRefDirent {
	name: string;
	isDirectory(): boolean;
	isFile(): boolean;
}

export interface LocalBranchRefReaderFs {
	readdir(path: string): readonly LocalBranchRefDirent[];
	readFile(path: string): string;
}

export interface ReadLocalBranchRefsOptions {
	fs?: LocalBranchRefReaderFs;
}

const nodeBranchRefReaderFs: LocalBranchRefReaderFs = {
	readdir(path) {
		return readdirSync(path, { withFileTypes: true }) satisfies Dirent[];
	},
	readFile(path) {
		return readFileSync(path, "utf8");
	},
};

export function readLocalBranchRefs(
	commonGitDir: string,
	options: ReadLocalBranchRefsOptions = {},
): LocalBranchRefReadResult {
	const fs = options.fs ?? nodeBranchRefReaderFs;
	const looseResult = collectLooseBranchRefs({
		fs,
		dir: join(commonGitDir, "refs", "heads"),
		prefix: [],
		shouldAllowMissingDir: true,
	});
	if (!looseResult.ok) return looseResult;

	const packedResult = collectPackedBranchRefs({
		fs,
		packedRefsPath: join(commonGitDir, "packed-refs"),
	});
	if (!packedResult.ok) return packedResult;

	return { ok: true, branches: new Set([...looseResult.branches, ...packedResult.branches]) };
}

type BranchRefCollectResult =
	| Exclude<LocalBranchRefReadResult, { ok: true }>
	| { ok: true; branches: readonly string[] };

interface CollectLooseBranchRefsOptions {
	fs: LocalBranchRefReaderFs;
	dir: string;
	prefix: readonly string[];
	shouldAllowMissingDir: boolean;
}

function collectLooseBranchRefs(options: CollectLooseBranchRefsOptions): BranchRefCollectResult {
	let entries: readonly LocalBranchRefDirent[];
	try {
		entries = options.fs.readdir(options.dir);
	} catch (error) {
		if (options.shouldAllowMissingDir && isErrorCode(error, "ENOENT"))
			return { ok: true, branches: [] };
		return readFailed(options.dir, error);
	}

	const branches: string[] = [];
	for (const entry of entries) {
		const segments = [...options.prefix, entry.name];
		if (entry.isDirectory()) {
			const result = collectLooseBranchRefs({
				fs: options.fs,
				dir: join(options.dir, entry.name),
				prefix: segments,
				shouldAllowMissingDir: false,
			});
			if (!result.ok) return result;
			branches.push(...result.branches);
		} else if (entry.isFile()) {
			branches.push(segments.join("/"));
		}
	}
	return { ok: true, branches };
}

interface CollectPackedBranchRefsOptions {
	fs: LocalBranchRefReaderFs;
	packedRefsPath: string;
}

function collectPackedBranchRefs(options: CollectPackedBranchRefsOptions): BranchRefCollectResult {
	let content: string;
	try {
		content = options.fs.readFile(options.packedRefsPath);
	} catch (error) {
		if (isErrorCode(error, "ENOENT")) return { ok: true, branches: [] };
		return readFailed(options.packedRefsPath, error);
	}

	const branches: string[] = [];
	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith("^")) continue;
		const fields = trimmed.split(/\s+/);
		const refName = fields[1];
		if (refName?.startsWith(HEADS_REF_PREFIX)) {
			branches.push(refName.slice(HEADS_REF_PREFIX.length));
		}
	}
	return { ok: true, branches };
}

function readFailed(path: string, error: unknown): Exclude<LocalBranchRefReadResult, { ok: true }> {
	return {
		ok: false,
		reason: "branch-ref-read-failed",
		message: `Could not read local branch refs at ${path}: ${formatErrorMessage(error)}`,
		path,
		error,
	};
}

function isErrorCode(error: unknown, code: string): boolean {
	if (!(error instanceof Error)) return false;
	return (error as NodeJS.ErrnoException).code === code;
}
