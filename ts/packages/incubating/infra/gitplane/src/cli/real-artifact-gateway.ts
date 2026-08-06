import { execFile } from "node:child_process";
import { link, lstat, mkdir, open, readdir, readFile, rm, rmdir, unlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { ARTIFACT_MARKER_NAME } from "../core/index.ts";
import type {
	ArtifactCandidate,
	ArtifactEntry,
	ArtifactGateway,
	CreateArtifactRequest,
	CreateArtifactResult,
	GatewayError,
	GatewayResult,
	GitObservation,
	TreeInventoryEntry,
} from "../core/index.ts";

const executeFile = promisify(execFile);
export interface GitCommandExecutor {
	execute(
		args: readonly string[],
		options?: { readonly input?: string },
	): Promise<{ readonly stdout: Buffer; readonly stderr: Buffer }>;
}
export class NodeGitCommandExecutor implements GitCommandExecutor {
	private readonly cwd: string;
	constructor(cwd: string) {
		this.cwd = cwd;
	}
	async execute(args: readonly string[], options?: { readonly input?: string }) {
		const invocation = executeFile("git", args, {
			cwd: this.cwd,
			encoding: "buffer",
			maxBuffer: 64 * 1024 * 1024,
		});
		if (options?.input !== undefined) invocation.child.stdin?.end(options.input);
		const result = await invocation;
		return { stdout: result.stdout, stderr: result.stderr };
	}
}
export interface RealArtifactGatewayHooks {
	readonly beforePublish?: (temporaryPath: string) => Promise<void>;
}
export interface RealArtifactGatewayOptions {
	readonly cwd: string;
	readonly git?: GitCommandExecutor;
	readonly hooks?: RealArtifactGatewayHooks;
}
function logical(value: string): string {
	return value.split(path.sep).join("/");
}
function isBeneathMarkerDirectory(value: string): boolean {
	const parts = value.split("/");
	return parts.slice(0, -1).includes(ARTIFACT_MARKER_NAME);
}
function failure(error: unknown) {
	return { code: "source-error", message: error instanceof Error ? error.message : String(error) };
}
function isCode(error: unknown, code: string): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
function isExitCode(error: unknown, code: number): boolean {
	if (typeof error !== "object" || error === null || !("code" in error)) return false;
	return error.code === code || error.code === String(code);
}
type GitFailureClassification =
	| { readonly type: "unavailable"; readonly reason: "missing-object" }
	| { readonly type: "operational"; readonly error: GatewayError };
export class RealArtifactGateway implements ArtifactGateway {
	private readonly cwd: string;
	private readonly git: GitCommandExecutor;
	private readonly hooks: RealArtifactGatewayHooks;
	constructor(options: RealArtifactGatewayOptions) {
		this.cwd = path.resolve(options.cwd);
		this.git = options.git ?? new NodeGitCommandExecutor(this.cwd);
		this.hooks = options.hooks ?? {};
	}
	private host(logicalPath: string): string {
		const result = path.resolve(this.cwd, logicalPath);
		if (result !== this.cwd && !result.startsWith(`${this.cwd}${path.sep}`))
			throw new Error("Path escapes invocation directory.");
		return result;
	}
	async createArtifact(request: CreateArtifactRequest): Promise<CreateArtifactResult> {
		let directory: string;
		try {
			directory = this.host(request.directory);
		} catch (error) {
			return { type: "error", error: failure(error) };
		}
		const parent = path.dirname(directory);
		try {
			if (!(await lstat(parent)).isDirectory()) return { type: "parent-missing" };
		} catch (error) {
			return isCode(error, "ENOENT")
				? { type: "parent-missing" }
				: { type: "error", error: failure(error) };
		}
		try {
			await mkdir(directory);
		} catch (error) {
			return isCode(error, "EEXIST")
				? { type: "target-exists" }
				: { type: "error", error: failure(error) };
		}
		const temporaryPath = path.join(directory, `.${ARTIFACT_MARKER_NAME}.${process.pid}.tmp`);
		try {
			const file = await open(temporaryPath, "wx");
			try {
				await file.writeFile(request.marker, "utf8");
				await file.sync();
			} finally {
				await file.close();
			}
			await this.hooks.beforePublish?.(temporaryPath);
			await link(temporaryPath, path.join(directory, ARTIFACT_MARKER_NAME));
			await unlink(temporaryPath).catch(() => undefined);
			return { type: "created", directory: request.directory, artifactId: request.artifactId };
		} catch (error) {
			await rm(temporaryPath, { force: true }).catch(() => undefined);
			await rmdir(directory).catch(() => undefined);
			return { type: "error", error: failure(error) };
		}
	}
	async inventoryWorkingTree(request: {
		readonly artifactRoot: string;
	}): Promise<GatewayResult<readonly TreeInventoryEntry[]>> {
		try {
			const entries: TreeInventoryEntry[] = [];
			const walk = async (directory: string): Promise<void> => {
				const items = await readdir(this.host(directory), { withFileTypes: true });
				items.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
				for (const item of items) {
					const itemPath = logical(path.join(directory, item.name));
					const facts = await lstat(this.host(itemPath));
					const kind = facts.isSymbolicLink()
						? "symlink"
						: facts.isFile()
							? "regular-file"
							: facts.isDirectory()
								? "directory"
								: "special";
					entries.push({ path: itemPath, kind });
					if (kind === "directory" && item.name !== ARTIFACT_MARKER_NAME) await walk(itemPath);
				}
			};
			await walk(request.artifactRoot);
			return { ok: true, value: entries };
		} catch (error) {
			return { ok: false, error: failure(error) };
		}
	}
	async readWorkingTreeCandidate(request: {
		readonly path: string;
	}): Promise<GatewayResult<ArtifactCandidate>> {
		const inventory = await this.inventoryWorkingTree({ artifactRoot: request.path });
		if (!inventory.ok) return inventory;
		try {
			const entries: ArtifactEntry[] = [];
			for (const item of inventory.value) {
				const relative = item.path.slice(request.path.length + 1);
				entries.push(
					item.kind === "regular-file"
						? { path: relative, kind: item.kind, bytes: await readFile(this.host(item.path)) }
						: { path: relative, kind: item.kind },
				);
			}
			return { ok: true, value: { path: request.path, entries } };
		} catch (error) {
			return { ok: false, error: failure(error) };
		}
	}
	async resolveCommit(request: {
		readonly commitish: string;
	}): Promise<GatewayResult<GitObservation<string>>> {
		try {
			const output = (
				await this.git.execute([
					"rev-parse",
					"--verify",
					"--quiet",
					`${request.commitish}^{commit}`,
				])
			).stdout
				.toString()
				.trim();
			if (output === "") throw new Error("Unexpected git rev-parse output.");
			return { ok: true, value: { type: "found", value: output } };
		} catch (error) {
			return isExitCode(error, 1)
				? { ok: true, value: { type: "unavailable", reason: "missing-object" } }
				: { ok: false, error: failure(error) };
		}
	}
	async inventoryCommitTree(request: {
		readonly commit: string;
		readonly artifactRoot: string;
	}): Promise<GatewayResult<GitObservation<readonly TreeInventoryEntry[]>>> {
		if (path.isAbsolute(request.artifactRoot) || request.artifactRoot.split("/").includes(".."))
			return { ok: false, error: failure(new Error("Path escapes invocation directory.")) };
		return this.gitObservation(
			["ls-tree", "-rz", "-r", "-t", request.commit, "--", request.artifactRoot],
			[request.commit],
			(output) =>
				output
					.toString()
					.split("\0")
					.filter(Boolean)
					.map((record) => {
						const match = /^(\d+) (\w+) [0-9a-f]+\t([\s\S]*)$/.exec(record);
						if (match === null) throw new Error("Unexpected git ls-tree output.");
						const mode = match[1];
						const type = match[2];
						const entryPath = logical(match[3] ?? "");
						const kind: TreeInventoryEntry["kind"] =
							mode === "160000"
								? "submodule"
								: type === "tree"
									? "directory"
									: mode === "120000"
										? "symlink"
										: mode === "100644" || mode === "100755"
											? "regular-file"
											: "special";
						return { path: entryPath, kind };
					})
					.filter((entry) => !isBeneathMarkerDirectory(entry.path)),
		);
	}
	async readCommitTreeCandidate(request: {
		readonly commit: string;
		readonly path: string;
	}): Promise<GatewayResult<GitObservation<ArtifactCandidate>>> {
		const inventory = await this.inventoryCommitTree({
			commit: request.commit,
			artifactRoot: request.path,
		});
		if (!inventory.ok) return inventory;
		if (inventory.value.type === "unavailable") return { ok: true, value: inventory.value };
		try {
			const files = inventory.value.value.filter(
				(item) => item.kind === "regular-file" && item.path !== request.path,
			);
			const contents = await this.readCommitBlobs(
				request.commit,
				files.map((item) => item.path),
			);
			const entries: ArtifactEntry[] = [];
			for (const item of inventory.value.value) {
				const relative = item.path.slice(request.path.length + 1);
				if (relative === "") continue;
				if (item.kind === "regular-file") {
					const bytes = contents.get(item.path);
					if (bytes === undefined) throw new Error("Unexpected git cat-file output.");
					entries.push({ path: relative, kind: item.kind, bytes });
				} else entries.push({ path: relative, kind: item.kind });
			}
			return { ok: true, value: { type: "found", value: { path: request.path, entries } } };
		} catch (error) {
			return { ok: false, error: failure(error) };
		}
	}
	// One `git cat-file --batch` invocation reads every blob; the line-oriented batch
	// protocol cannot carry paths containing a newline, so those fall back to `git show`.
	private async readCommitBlobs(
		commit: string,
		paths: readonly string[],
	): Promise<Map<string, Buffer>> {
		const bytes = new Map<string, Buffer>();
		const batched = paths.filter((blobPath) => !blobPath.includes("\n"));
		if (batched.length > 0) {
			const input = `${batched.map((blobPath) => `${commit}:${blobPath}`).join("\n")}\n`;
			const { stdout } = await this.git.execute(["cat-file", "--batch"], { input });
			let offset = 0;
			for (const blobPath of batched) {
				const headerEnd = stdout.indexOf(0x0a, offset);
				const match =
					headerEnd === -1
						? null
						: /^\S+ \S+ (\d+)$/.exec(stdout.subarray(offset, headerEnd).toString());
				if (match === null) throw new Error(`Unable to read ${commit}:${blobPath}.`);
				const size = Number(match[1]);
				const start = headerEnd + 1;
				const recordEnd = start + size;
				if (recordEnd >= stdout.length || stdout[recordEnd] !== 0x0a)
					throw new Error(`Unable to read ${commit}:${blobPath}.`);
				bytes.set(blobPath, Buffer.from(stdout.subarray(start, recordEnd)));
				offset = recordEnd + 1;
			}
		}
		for (const blobPath of paths) {
			if (blobPath.includes("\n"))
				bytes.set(blobPath, (await this.git.execute(["show", `${commit}:${blobPath}`])).stdout);
		}
		return bytes;
	}
	private async gitObservation<T>(
		args: readonly string[],
		commits: readonly string[],
		map: (stdout: Buffer) => T,
	): Promise<GatewayResult<GitObservation<T>>> {
		let stdout: Buffer;
		try {
			stdout = (await this.git.execute(args)).stdout;
		} catch (error) {
			const classification = await this.classifyGitFailure(error, commits);
			return classification.type === "unavailable"
				? { ok: true, value: { type: "unavailable", reason: classification.reason } }
				: { ok: false, error: classification.error };
		}
		try {
			return { ok: true, value: { type: "found", value: map(stdout) } };
		} catch (error) {
			return { ok: false, error: failure(error) };
		}
	}
	private async classifyGitFailure(
		error: unknown,
		commits: readonly string[],
	): Promise<GitFailureClassification> {
		if (!isExitCode(error, 128)) return { type: "operational", error: failure(error) };
		for (const commit of new Set(commits)) {
			try {
				await this.git.execute(["rev-parse", "--verify", "--quiet", `${commit}^{commit}`]);
			} catch (probeError) {
				if (!isExitCode(probeError, 1)) return { type: "operational", error: failure(error) };
				return { type: "unavailable", reason: "missing-object" };
			}
		}
		return { type: "operational", error: failure(error) };
	}
}
