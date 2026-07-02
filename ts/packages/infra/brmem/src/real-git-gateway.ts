import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { optionalEntry } from "@sdl/core/primitives";
import {
	type CommandExecApi,
	formatCommand,
	type StdinCapableCommandExecApi,
} from "@sdl/core/exec";
import type { GitGateway } from "@sdl/git";

import {
	brmemError,
	brmemFound,
	brmemMissing,
	brmemOk,
	brmemOptionalError,
	type BrmemResult,
	type BrmemOptionalResult,
} from "./contracts.ts";
import { keyBranchFilter } from "./entry-filters.ts";
import type {
	BrmemGateway,
	BrmemReadGateway,
	CopyEntriesResult,
	DeleteEntryResult,
	EntryContent,
	EntryDiagnostic,
	EntryQueryOptions,
	EntryWriteOptions,
	ListedEntry,
	ListEntriesOptions,
	ListedSnapshot,
	ListSnapshotsOptions,
	PutEntryResult,
} from "./gateway.ts";
import { keyGlobMatches } from "./key-glob.ts";
import {
	buildEntryLocator,
	compareEntries,
	mustEntryRef,
	mustSnapshotRef,
	parseSnapshotRef,
	snapshotRefPrefixes,
	type EntryCoordinate,
} from "./ref-layout.ts";
import { normalizeBrmemTimestamp } from "./timestamps.ts";
import {
	validateBranchName,
	validateEntryKey,
	validateKeyGlob,
	validateNamespaceName,
} from "./validation.ts";

const EMPTY_TREE_SHA = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const ZERO_OBJECT_SHA = "0000000000000000000000000000000000000000";
const GIT_BLOB_MODE_FILE = "100644";
const GIT_TREE_MODE = "040000";

interface GitRunResult {
	code: number;
	stdout: string;
	stderr: string;
	displayCommand: string;
}

interface SnapshotValidationContext {
	namespace: string;
	branch: string;
	snapshotRef: string;
}

interface SnapshotStateOptions extends SnapshotValidationContext {
	sha?: string;
}

interface SnapshotInvalidKey {
	key: string;
	reason: string;
}

interface SnapshotTreeNode {
	blobs: Map<string, string>;
	trees: Map<string, SnapshotTreeNode>;
}

interface MktreeEntry {
	mode: typeof GIT_BLOB_MODE_FILE | typeof GIT_TREE_MODE;
	kind: "blob" | "tree";
	sha: string;
	name: string;
}

interface SnapshotRefToCount {
	snapshotRef: string;
	parsed: ListedSnapshotRefParts;
}

type ListedSnapshotRefParts = Pick<ListedSnapshot, "namespace" | "branch" | "refName">;

const SNAPSHOT_CORRUPT_SAMPLE_LIMIT = 5;
const SNAPSHOT_ENTRY_COUNT_CONCURRENCY = 8;

export interface RealGitBrmemReadGatewayOptions {
	cwd: string;
	commands: CommandExecApi;
	git: Pick<GitGateway, "validateBranchRef">;
}

export interface RealGitBrmemGatewayOptions {
	cwd: string;
	commands: StdinCapableCommandExecApi;
	git: GitGateway;
}

export class RealGitBrmemReadGateway implements BrmemReadGateway {
	protected readonly cwd: string;
	protected readonly commands: CommandExecApi;
	protected readonly git: Pick<GitGateway, "validateBranchRef">;

	constructor(options: RealGitBrmemReadGatewayOptions) {
		this.cwd = options.cwd;
		this.commands = options.commands;
		this.git = options.git;
	}

	async listEntries(options: ListEntriesOptions): Promise<BrmemResult<readonly ListedEntry[]>> {
		const validation = validateNamespaceName(options.namespace);
		if (validation.type === "invalid")
			return brmemError<readonly ListedEntry[]>(
				"invalid-namespace",
				formatInvalid("namespace", options.namespace, validation.reason),
			);
		return await this.collectEntries({
			allNamespaces: false,
			namespace: options.namespace,
			...keyBranchFilter(options),
		});
	}

	async getEntry(options: EntryQueryOptions): Promise<BrmemOptionalResult<EntryContent>> {
		const validation = await this.validateEntryAddress(options);
		if (validation.type === "error")
			return brmemOptionalError<EntryContent>(
				validation.error.code,
				validation.error.message,
				validation.error.displayCommand,
			);
		const snapshotRef = mustSnapshotRef(options.namespace, options.branch);
		const gitTarget = options.at ?? snapshotRef;
		const result = await runGit(this.commands, ["show", `${gitTarget}:${options.key}`], {
			cwd: this.cwd,
		});
		if (result.code !== 0) return brmemMissing<EntryContent>();
		return brmemFound({ content: result.stdout });
	}

	async checkEntry(options: EntryQueryOptions): Promise<BrmemOptionalResult<EntryDiagnostic>> {
		const validation = await this.validateEntryAddress(options);
		if (validation.type === "error") {
			return brmemOptionalError<EntryDiagnostic>(
				validation.error.code,
				validation.error.message,
				validation.error.displayCommand,
			);
		}
		const snapshotRef = mustSnapshotRef(options.namespace, options.branch);
		const gitTarget = options.at ?? snapshotRef;
		const existence = await runGit(
			this.commands,
			["cat-file", "-e", `${gitTarget}:${options.key}`],
			{ cwd: this.cwd },
		);
		if (existence.code !== 0) return brmemMissing<EntryDiagnostic>();
		const blobSha = await runGit(this.commands, ["rev-parse", `${gitTarget}:${options.key}`], {
			cwd: this.cwd,
		});
		if (blobSha.code !== 0)
			return brmemOptionalError<EntryDiagnostic>(
				"git-rev-parse-failed",
				commandMessage("Could not resolve blob SHA.", blobSha),
				blobSha.displayCommand,
			);
		const size = await runGit(this.commands, ["cat-file", "-s", `${gitTarget}:${options.key}`], {
			cwd: this.cwd,
		});
		if (size.code !== 0)
			return brmemOptionalError<EntryDiagnostic>(
				"git-cat-file-failed",
				commandMessage("Could not resolve blob size.", size),
				size.displayCommand,
			);
		const log = await runGit(this.commands, ["log", "-1", "--format=%H%x09%cI", gitTarget], {
			cwd: this.cwd,
		});
		if (log.code !== 0)
			return brmemOptionalError<EntryDiagnostic>(
				"git-log-failed",
				commandMessage("Could not resolve snapshot metadata.", log),
				log.displayCommand,
			);
		const [headSha = "", headDate = ""] = log.stdout.trim().split("\t");
		return brmemFound({
			headSha,
			headDate: normalizeBrmemTimestamp(headDate),
			blobSha: blobSha.stdout.trim(),
			sizeBytes: Number(size.stdout.trim()),
		});
	}
	protected async validateEntryAddress(options: EntryCoordinate): Promise<BrmemResult<void>> {
		const namespaceValidation = validateNamespaceName(options.namespace);
		if (namespaceValidation.type === "invalid")
			return brmemError(
				"invalid-namespace",
				formatInvalid("namespace", options.namespace, namespaceValidation.reason),
			);
		const keyValidation = validateEntryKey(options.key);
		if (keyValidation.type === "invalid")
			return brmemError("invalid-key", formatInvalid("key", options.key, keyValidation.reason));
		return await this.validateGitBranch(options.branch);
	}

	protected async validateGitBranch(branch: string): Promise<BrmemResult<void>> {
		const branchValidation = validateBranchName(branch);
		if (branchValidation.type === "invalid")
			return brmemError(
				"invalid-branch-name",
				formatInvalid("branch name", branch, branchValidation.reason),
			);
		const gitValidation = await this.git.validateBranchRef({ cwd: this.cwd, branch });
		if (!gitValidation.ok) {
			const code =
				gitValidation.error.code === "branch-ref-invalid"
					? "invalid-branch-name"
					: gitValidation.error.code;
			return brmemError(code, gitValidation.error.message, gitValidation.error.displayCommand);
		}
		return brmemOk(undefined);
	}

	protected async loadSnapshotState(
		options: SnapshotStateOptions,
	): Promise<BrmemResult<Map<string, string>>> {
		if (options.sha === undefined) return brmemOk(new Map<string, string>());
		return await loadSnapshotEntries(this.commands, this.cwd, options);
	}

	protected async collectEntries(options: {
		allNamespaces: boolean;
		namespace?: string;
		key?: string;
		branch?: string;
	}): Promise<BrmemResult<readonly ListedEntry[]>> {
		if (options.key !== undefined) {
			const keyValidation = validateEntryKey(options.key);
			if (keyValidation.type === "invalid")
				return brmemError("invalid-key", formatInvalid("key", options.key, keyValidation.reason));
		}
		if (options.branch !== undefined) {
			const branchValidation = validateBranchName(options.branch);
			if (branchValidation.type === "invalid")
				return brmemError(
					"invalid-branch-name",
					formatInvalid("branch name", options.branch, branchValidation.reason),
				);
		}
		const result = await runGit(
			this.commands,
			["for-each-ref", "--format=%(refname)", ...snapshotRefPrefixes()],
			{ cwd: this.cwd },
		);
		if (result.code !== 0) return brmemOk([]);
		const entries: ListedEntry[] = [];
		for (const line of result.stdout.split("\n")) {
			const snapshotRef = line.trim();
			if (snapshotRef.length === 0) continue;
			const parsed = parseSnapshotRef(snapshotRef);
			if (parsed === undefined) continue;
			if (!options.allNamespaces && parsed.namespace !== options.namespace) continue;
			if (options.branch !== undefined && parsed.branch !== options.branch) continue;
			const treeEntries = await enumerateTreeEntries(this.commands, this.cwd, snapshotRef);
			const updatedAtByPath = await enumerateEntryUpdatedAt(this.commands, this.cwd, snapshotRef);
			if (updatedAtByPath.type === "error") return updatedAtByPath;
			for (const path of treeEntries.keys()) {
				if (options.key !== undefined && path !== options.key) continue;
				// Defensive: a Snapshot Ref may contain paths that are not valid Entry
				// Keys — e.g. a historically corrupted snapshot that captured unrelated
				// working-tree files. Skip them so a single invalid path cannot abort
				// listing for the entire namespace.
				if (validateEntryKey(path).type === "invalid") continue;
				const updatedAt = updatedAtByPath.value.get(path);
				if (updatedAt === undefined) {
					return brmemError(
						"entry-metadata-unavailable",
						`Could not resolve Entry update metadata for ${JSON.stringify(path)}.`,
					);
				}
				const locator = buildEntryLocator(parsed.namespace, path, parsed.branch);
				if (locator.type === "error") {
					return brmemError(
						"invalid-snapshot-tree",
						`Snapshot Ref ${JSON.stringify(snapshotRef)} contains invalid Entry Key ${JSON.stringify(path)}: ${locator.error.message}`,
					);
				}
				entries.push({
					namespace: parsed.namespace,
					key: path,
					branch: parsed.branch,
					entryLocator: locator.value,
					updatedAt,
				});
			}
		}
		return brmemOk(entries.sort(compareEntries));
	}
}

export class RealGitBrmemGateway extends RealGitBrmemReadGateway implements BrmemGateway {
	private readonly currentBranchGit: GitGateway;

	constructor(options: RealGitBrmemGatewayOptions) {
		super(options);
		this.currentBranchGit = options.git;
	}

	async currentBranch(): Promise<BrmemResult<string>> {
		const result = await this.currentBranchGit.currentBranch({ cwd: this.cwd });
		if (result.type === "branch") return brmemOk(result.branch);
		if (result.type === "detached") {
			return brmemError(
				"detached-head",
				"Could not resolve current branch; HEAD appears detached.",
			);
		}
		return brmemError(result.error.code, result.error.message, result.error.displayCommand);
	}

	async listAllEntries(options: {
		key?: string;
		branch?: string;
	}): Promise<BrmemResult<readonly ListedEntry[]>> {
		return await this.collectEntries({
			allNamespaces: true,
			...keyBranchFilter(options),
		});
	}

	async listSnapshots(
		options: ListSnapshotsOptions,
	): Promise<BrmemResult<readonly ListedSnapshot[]>> {
		if (options.namespace !== undefined) {
			const validation = validateNamespaceName(options.namespace);
			if (validation.type === "invalid") {
				return brmemError(
					"invalid-namespace",
					formatInvalid("namespace", options.namespace, validation.reason),
				);
			}
		}
		const result = await runGit(
			this.commands,
			["for-each-ref", "--format=%(refname)", ...snapshotRefPrefixes()],
			{ cwd: this.cwd },
		);
		if (result.code !== 0) return brmemOk([]);
		const snapshotRefs = parseSnapshotRefsToCount(result.stdout, options.namespace);
		let processed = 0;
		const total = snapshotRefs.length;
		const snapshots = await mapWithConcurrency(
			snapshotRefs,
			SNAPSHOT_ENTRY_COUNT_CONCURRENCY,
			async ({ snapshotRef, parsed }): Promise<ListedSnapshot> => {
				const entryCount = await countTreeEntries(this.commands, this.cwd, snapshotRef);
				processed += 1;
				options.onProgress?.({ processed, total });
				return {
					namespace: parsed.namespace,
					branch: parsed.branch,
					refName: parsed.refName,
					entryCount,
				};
			},
		);
		return brmemOk(snapshots.sort(compareSnapshots));
	}

	async listLocalBranches(): Promise<BrmemResult<ReadonlySet<string>>> {
		const result = await runGit(
			this.commands,
			["for-each-ref", "--format=%(refname:strip=2)", "refs/heads"],
			{ cwd: this.cwd },
		);
		if (result.code !== 0) {
			return gitError("git-for-each-ref-failed", "Could not list local branches.", result);
		}
		return brmemOk(new Set(splitConfigValues(result.stdout)));
	}

	async localBranchPresence(options: {
		branch: string;
	}): Promise<BrmemResult<"present" | "absent">> {
		const validation = validateBranchName(options.branch);
		if (validation.type === "invalid") {
			return brmemError(
				"invalid-branch-name",
				formatInvalid("branch name", options.branch, validation.reason),
			);
		}
		const result = await this.currentBranchGit.localBranchPresence({
			cwd: this.cwd,
			branch: options.branch,
		});
		if (result.type === "present") return brmemOk("present");
		if (result.type === "absent") return brmemOk("absent");
		return brmemError(result.error.code, result.error.message, result.error.displayCommand);
	}

	async deleteSnapshot(options: { namespace: string; branch: string }): Promise<BrmemResult<void>> {
		const namespaceValidation = validateNamespaceName(options.namespace);
		if (namespaceValidation.type === "invalid") {
			return brmemError(
				"invalid-namespace",
				formatInvalid("namespace", options.namespace, namespaceValidation.reason),
			);
		}
		const branchValidation = await this.validateGitBranch(options.branch);
		if (branchValidation.type === "error") return branchValidation;
		const snapshotRef = mustSnapshotRef(options.namespace, options.branch);
		const result = await runGit(this.commands, ["update-ref", "-d", snapshotRef], {
			cwd: this.cwd,
		});
		if (result.code === 0) return brmemOk(undefined);
		return gitError(
			"git-update-ref-delete-failed",
			`Could not delete Snapshot Ref ${JSON.stringify(snapshotRef)}.`,
			result,
		);
	}

	async putEntry(options: EntryWriteOptions): Promise<BrmemResult<PutEntryResult>> {
		const validation = await this.validateEntryAddress(options);
		if (validation.type === "error") return validation;
		return await this.writeEntrySnapshot(options, {
			shouldCreateOnly: false,
			commitMessage: `brmem put ${options.key}`,
		});
	}

	async createEntry(options: EntryWriteOptions): Promise<BrmemResult<PutEntryResult>> {
		const validation = await this.validateEntryAddress(options);
		if (validation.type === "error") return validation;
		return await this.writeEntrySnapshot(options, {
			shouldCreateOnly: true,
			commitMessage: `brmem create ${options.key}`,
		});
	}

	private async writeEntrySnapshot(
		options: EntryWriteOptions,
		behavior: { shouldCreateOnly: boolean; commitMessage: string },
	): Promise<BrmemResult<PutEntryResult>> {
		const snapshotRef = mustSnapshotRef(options.namespace, options.branch);
		const parent = await runGit(this.commands, ["rev-parse", "--verify", snapshotRef], {
			cwd: this.cwd,
		});
		const parentSha = parent.code === 0 ? parent.stdout.trim() : undefined;
		const entriesResult = await this.loadSnapshotState({
			namespace: options.namespace,
			branch: options.branch,
			snapshotRef,
			...optionalEntry("sha", parentSha),
		});
		if (entriesResult.type === "error") return entriesResult;
		const entries = entriesResult.value;
		if (behavior.shouldCreateOnly && entries.has(options.key)) {
			return brmemError<PutEntryResult>(
				"key-already-exists",
				`key ${JSON.stringify(options.key)} already exists`,
			);
		}
		const tempDir = mkdtempSync(join(tmpdir(), "brmem-blob-"));
		try {
			const blobPath = join(tempDir, "content");
			writeFileSync(blobPath, options.content, "utf8");
			const blob = await runGit(this.commands, ["hash-object", "-w", "--no-filters", blobPath], {
				cwd: this.cwd,
			});
			if (blob.code !== 0)
				return gitError("git-hash-object-failed", "Could not write Entry blob.", blob);
			entries.set(options.key, blob.stdout.trim());
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
		const tree = await buildTreeFromEntries(this.commands, this.cwd, entries);
		if (tree.type === "error") return tree;
		const commitArgs = ["commit-tree", tree.value, "-m", behavior.commitMessage];
		if (parentSha !== undefined) commitArgs.splice(2, 0, "-p", parentSha);
		const commit = await runGit(this.commands, commitArgs, { cwd: this.cwd });
		if (commit.code !== 0)
			return gitError(
				"git-commit-tree-failed",
				"Could not create Branch Memory Snapshot commit.",
				commit,
			);
		const update = await updateSnapshotRef(this.commands, this.cwd, {
			ref: snapshotRef,
			newSha: commit.stdout.trim(),
			...optionalEntry("expectedOldSha", parentSha),
		});
		if (update.type === "error") return update;
		return brmemOk({
			commitSha: commit.stdout.trim(),
			entry: mustEntryRef(options.namespace, options.key, options.branch),
		});
	}

	async deleteEntry(options: EntryCoordinate): Promise<BrmemResult<DeleteEntryResult>> {
		const validation = await this.validateEntryAddress(options);
		if (validation.type === "error") return validation;
		const snapshotRef = mustSnapshotRef(options.namespace, options.branch);
		const parent = await runGit(this.commands, ["rev-parse", "--verify", snapshotRef], {
			cwd: this.cwd,
		});
		if (parent.code !== 0)
			return brmemError("key-not-found", `key ${JSON.stringify(options.key)} not found`);
		const entriesResult = await loadSnapshotEntries(this.commands, this.cwd, {
			namespace: options.namespace,
			branch: options.branch,
			snapshotRef,
		});
		if (entriesResult.type === "error") return entriesResult;
		const entries = entriesResult.value;
		if (!entries.has(options.key))
			return brmemError("key-not-found", `key ${JSON.stringify(options.key)} not found`);
		entries.delete(options.key);
		const tree = await buildTreeFromEntries(this.commands, this.cwd, entries);
		if (tree.type === "error") return tree;
		const commit = await runGit(
			this.commands,
			["commit-tree", tree.value, "-p", parent.stdout.trim(), "-m", `brmem delete ${options.key}`],
			{ cwd: this.cwd },
		);
		if (commit.code !== 0)
			return gitError("git-commit-tree-failed", "Could not create delete Snapshot commit.", commit);
		const update = await updateSnapshotRef(this.commands, this.cwd, {
			ref: snapshotRef,
			newSha: commit.stdout.trim(),
			expectedOldSha: parent.stdout.trim(),
		});
		if (update.type === "error") return update;
		return brmemOk({
			commitSha: commit.stdout.trim(),
			entry: mustEntryRef(options.namespace, options.key, options.branch),
			isSnapshotEmpty: entries.size === 0,
		});
	}

	async copyEntries(options: {
		namespace: string;
		fromBranch: string;
		toBranch: string;
		shouldOverwrite: boolean;
		keyGlob?: string;
	}): Promise<BrmemResult<CopyEntriesResult>> {
		const namespaceValidation = validateNamespaceName(options.namespace);
		if (namespaceValidation.type === "invalid")
			return brmemError(
				"invalid-namespace",
				formatInvalid("namespace", options.namespace, namespaceValidation.reason),
			);
		const fromValidation = await this.validateGitBranch(options.fromBranch);
		if (fromValidation.type === "error") return fromValidation;
		const toValidation = await this.validateGitBranch(options.toBranch);
		if (toValidation.type === "error") return toValidation;
		if (options.keyGlob !== undefined) {
			const globValidation = validateKeyGlob(options.keyGlob);
			if (globValidation.type === "invalid")
				return brmemError(
					"invalid-key-glob",
					formatInvalid("Entry Key glob", options.keyGlob, globValidation.reason),
				);
		}
		const sourceRef = mustSnapshotRef(options.namespace, options.fromBranch);
		const sourceSha = await runGit(this.commands, ["rev-parse", "--verify", sourceRef], {
			cwd: this.cwd,
		});
		if (sourceSha.code !== 0) return brmemOk({ entries: [] });
		const destRef = mustSnapshotRef(options.namespace, options.toBranch);
		const destShaResult = await runGit(this.commands, ["rev-parse", "--verify", destRef], {
			cwd: this.cwd,
		});
		const destSha = destShaResult.code === 0 ? destShaResult.stdout.trim() : undefined;
		if (options.keyGlob === undefined) {
			return this.copySnapshot({
				namespace: options.namespace,
				fromBranch: options.fromBranch,
				toBranch: options.toBranch,
				sourceRef,
				sourceSha: sourceSha.stdout.trim(),
				destRef,
				...optionalEntry("destSha", destSha),
				shouldOverwrite: options.shouldOverwrite,
			});
		}
		return this.copyWithGlob({
			...options,
			sourceRef,
			destRef,
			...optionalEntry("destSha", destSha),
			keyGlob: options.keyGlob,
		});
	}

	private async copySnapshot(options: {
		namespace: string;
		fromBranch: string;
		toBranch: string;
		sourceRef: string;
		sourceSha: string;
		destRef: string;
		destSha?: string;
		shouldOverwrite: boolean;
	}): Promise<BrmemResult<CopyEntriesResult>> {
		const sourceEntries = await loadSnapshotEntries(this.commands, this.cwd, {
			namespace: options.namespace,
			branch: options.fromBranch,
			snapshotRef: options.sourceRef,
		});
		if (sourceEntries.type === "error") return sourceEntries;
		const destEntries = await this.loadSnapshotState({
			namespace: options.namespace,
			branch: options.toBranch,
			snapshotRef: options.destRef,
			...optionalEntry("sha", options.destSha),
		});
		if (destEntries.type === "error") return destEntries;
		if (destEntries.value.size > 0 && !options.shouldOverwrite) {
			return brmemError(
				"copy-conflict",
				`destination has conflicting entries: ${[...destEntries.value.keys()].sort().join(", ")}`,
			);
		}
		const update = await updateSnapshotRef(this.commands, this.cwd, {
			ref: options.destRef,
			newSha: options.sourceSha,
			...optionalEntry("expectedOldSha", options.destSha),
		});
		if (update.type === "error") return update;
		const entries = [...sourceEntries.value.keys()]
			.sort()
			.map((key) => mustEntryRef(options.namespace, key, options.toBranch));
		return brmemOk({ entries });
	}

	private async copyWithGlob(options: {
		namespace: string;
		fromBranch: string;
		toBranch: string;
		sourceRef: string;
		destRef: string;
		destSha?: string;
		shouldOverwrite: boolean;
		keyGlob: string;
	}): Promise<BrmemResult<CopyEntriesResult>> {
		const sourceEntries = await loadSnapshotEntries(this.commands, this.cwd, {
			namespace: options.namespace,
			branch: options.fromBranch,
			snapshotRef: options.sourceRef,
		});
		if (sourceEntries.type === "error") return sourceEntries;
		const destEntries = await this.loadSnapshotState({
			namespace: options.namespace,
			branch: options.toBranch,
			snapshotRef: options.destRef,
			...optionalEntry("sha", options.destSha),
		});
		if (destEntries.type === "error") return destEntries;
		const sourceMatching = [...sourceEntries.value].filter(([key]) =>
			keyGlobMatches(key, options.keyGlob),
		);
		if (sourceMatching.length === 0) return brmemOk({ entries: [] });
		const destTree = destEntries.value;
		const destMatching = [...destTree.keys()].filter((key) => keyGlobMatches(key, options.keyGlob));
		if (destMatching.length > 0 && !options.shouldOverwrite) {
			return brmemError(
				"copy-conflict",
				`destination has conflicting entries: ${destMatching.sort().join(", ")}`,
			);
		}
		for (const key of destMatching) destTree.delete(key);
		for (const [key, blobSha] of sourceMatching) destTree.set(key, blobSha);
		const tree = await buildTreeFromEntries(this.commands, this.cwd, destTree);
		if (tree.type === "error") return tree;
		const scopeArg = options.namespace === "base" ? "--base" : `--namespace ${options.namespace}`;
		const commitArgs = [
			"commit-tree",
			tree.value,
			"-m",
			`brmem copy ${scopeArg} --from-branch ${options.fromBranch} --to-branch ${options.toBranch} --key-glob ${options.keyGlob}`,
		];
		if (options.destSha !== undefined) commitArgs.splice(2, 0, "-p", options.destSha);
		const commit = await runGit(this.commands, commitArgs, { cwd: this.cwd });
		if (commit.code !== 0)
			return gitError("git-commit-tree-failed", "Could not create copy Snapshot commit.", commit);
		const update = await updateSnapshotRef(this.commands, this.cwd, {
			ref: options.destRef,
			newSha: commit.stdout.trim(),
			...optionalEntry("expectedOldSha", options.destSha),
		});
		if (update.type === "error") return update;
		return brmemOk({
			entries: sourceMatching
				.map(([key]) => mustEntryRef(options.namespace, key, options.toBranch))
				.sort(compareEntries),
		});
	}

	async getRemoteConfig(
		remote: string,
	): Promise<BrmemOptionalResult<import("./gateway.ts").GitRemoteConfig>> {
		const exists = await runGit(this.commands, ["remote", "get-url", remote], { cwd: this.cwd });
		if (exists.code !== 0) return brmemMissing();

		const push = await runGit(this.commands, ["config", "--get-all", `remote.${remote}.push`], {
			cwd: this.cwd,
		});
		const pushValues = push.code === 0 ? splitConfigValues(push.stdout) : [];

		const fetch = await runGit(this.commands, ["config", "--get-all", `remote.${remote}.fetch`], {
			cwd: this.cwd,
		});
		const fetchValues = fetch.code === 0 ? splitConfigValues(fetch.stdout) : [];

		return brmemFound({ push: pushValues, fetch: fetchValues });
	}

	async addRemoteRefspecs(
		remote: string,
		push: readonly string[],
		fetch: readonly string[],
	): Promise<BrmemResult<void>> {
		for (const p of push) {
			const res = await runGit(
				this.commands,
				["config", "--local", "--add", `remote.${remote}.push`, p],
				{ cwd: this.cwd },
			);
			if (res.code !== 0)
				return gitError(
					"git-config-write-failed",
					`Could not add Git config remote.${remote}.push.`,
					res,
				);
		}
		for (const f of fetch) {
			const res = await runGit(
				this.commands,
				["config", "--local", "--add", `remote.${remote}.fetch`, f],
				{ cwd: this.cwd },
			);
			if (res.code !== 0)
				return gitError(
					"git-config-write-failed",
					`Could not add Git config remote.${remote}.fetch.`,
					res,
				);
		}
		return brmemOk(undefined);
	}
}

function compareSnapshots(left: ListedSnapshot, right: ListedSnapshot): number {
	if (left.namespace !== right.namespace) return left.namespace < right.namespace ? -1 : 1;
	if (left.branch !== right.branch) return left.branch < right.branch ? -1 : 1;
	return 0;
}

function splitConfigValues(stdout: string): readonly string[] {
	return stdout
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

async function runGit(
	commands: CommandExecApi,
	args: readonly string[],
	options: { cwd: string; env?: NodeJS.ProcessEnv; stdin?: string },
): Promise<GitRunResult> {
	const result = await commands.exec("git", [...args], {
		cwd: options.cwd,
		env: options.env ?? process.env,
		...(options.stdin === undefined ? {} : { stdin: options.stdin }),
	});
	return {
		code: result.code,
		stdout: result.stdout,
		stderr: result.stderr.length > 0 ? result.stderr : (result.startupError ?? ""),
		displayCommand: formatCommand("git", args),
	};
}

async function loadSnapshotEntries(
	commands: CommandExecApi,
	cwd: string,
	context: SnapshotValidationContext,
): Promise<BrmemResult<Map<string, string>>> {
	const entries = await enumerateTreeEntries(commands, cwd, context.snapshotRef);
	const invalidKeys = findInvalidSnapshotKeys(entries);
	if (invalidKeys.length > 0) return snapshotCorruptError(context, invalidKeys);
	return brmemOk(entries);
}

function findInvalidSnapshotKeys(
	entries: ReadonlyMap<string, string>,
): readonly SnapshotInvalidKey[] {
	const invalidKeys: SnapshotInvalidKey[] = [];
	for (const key of entries.keys()) {
		const validation = validateEntryKey(key);
		if (validation.type === "invalid") invalidKeys.push({ key, reason: validation.reason });
	}
	return invalidKeys.sort((left, right) => left.key.localeCompare(right.key));
}

function snapshotCorruptError<T>(
	context: SnapshotValidationContext,
	invalidKeys: readonly SnapshotInvalidKey[],
): BrmemResult<T> {
	return brmemError("snapshot-corrupt", formatSnapshotCorruptMessage(context, invalidKeys));
}

function formatSnapshotCorruptMessage(
	context: SnapshotValidationContext,
	invalidKeys: readonly SnapshotInvalidKey[],
): string {
	return [
		`Snapshot Ref ${context.snapshotRef} contains ${invalidKeys.length} invalid Entry Key(s) in Namespace ${context.namespace} on Branch ${context.branch}.`,
		`Invalid keys include: ${formatInvalidKeySamples(invalidKeys)}.`,
		"Refusing to mutate corrupt Branch Memory; repair the Snapshot explicitly before retrying.",
	].join(" ");
}

function formatInvalidKeySamples(invalidKeys: readonly SnapshotInvalidKey[]): string {
	const samples = invalidKeys
		.slice(0, SNAPSHOT_CORRUPT_SAMPLE_LIMIT)
		.map((invalidKey) => `${invalidKey.key} (${invalidKey.reason})`);
	const remaining = invalidKeys.length - samples.length;
	if (remaining > 0) samples.push(`... and ${remaining} more`);
	return samples.join("; ");
}

function validateWritableSnapshotEntries(entries: ReadonlyMap<string, string>): BrmemResult<void> {
	const invalidKeys = findInvalidSnapshotKeys(entries);
	if (invalidKeys.length === 0) return brmemOk(undefined);
	return brmemError(
		"snapshot-corrupt",
		`Refusing to write Snapshot tree containing invalid Entry Key(s): ${formatInvalidKeySamples(invalidKeys)}.`,
	);
}

async function buildTreeFromEntries(
	commands: CommandExecApi,
	cwd: string,
	entries: ReadonlyMap<string, string>,
): Promise<BrmemResult<string>> {
	const validation = validateWritableSnapshotEntries(entries);
	if (validation.type === "error") return validation;
	if (entries.size === 0) return brmemOk(EMPTY_TREE_SHA);
	const snapshotTree = buildSnapshotTree(entries);
	if (snapshotTree.type === "error") return snapshotTree;
	const tree = await writeSnapshotTree(commands, cwd, snapshotTree.value);
	if (tree.type === "error") return tree;
	const verification = await verifyBuiltTreeMatchesEntries(commands, cwd, tree.value, entries);
	if (verification.type === "error") return verification;
	return tree;
}

function buildSnapshotTree(entries: ReadonlyMap<string, string>): BrmemResult<SnapshotTreeNode> {
	const root = createSnapshotTreeNode();
	for (const [key, blobSha] of entries) {
		const added = addSnapshotTreeEntry(root, key, blobSha);
		if (added.type === "error") return added;
	}
	return brmemOk(root);
}

function createSnapshotTreeNode(): SnapshotTreeNode {
	return { blobs: new Map(), trees: new Map() };
}

function addSnapshotTreeEntry(
	root: SnapshotTreeNode,
	key: string,
	blobSha: string,
): BrmemResult<void> {
	const segments = key.split("/");
	let node = root;
	let prefix = "";
	for (let index = 0; index < segments.length; index += 1) {
		const segment = segments[index];
		if (segment === undefined) break;
		const path = prefix.length === 0 ? segment : `${prefix}/${segment}`;
		const isLeaf = index === segments.length - 1;
		if (isLeaf) {
			if (node.trees.has(segment)) return snapshotTreeConflict(key, path);
			node.blobs.set(segment, blobSha);
			return brmemOk(undefined);
		}
		if (node.blobs.has(segment)) return snapshotTreeConflict(key, path);
		let child = node.trees.get(segment);
		if (child === undefined) {
			child = createSnapshotTreeNode();
			node.trees.set(segment, child);
		}
		node = child;
		prefix = path;
	}
	return brmemOk(undefined);
}

function snapshotTreeConflict<T>(key: string, path: string): BrmemResult<T> {
	return brmemError(
		"snapshot-tree-conflict",
		`Entry Key ${JSON.stringify(key)} conflicts with another Entry at ${JSON.stringify(path)}; Git trees cannot store one name as both an Entry and a directory.`,
	);
}

async function writeSnapshotTree(
	commands: CommandExecApi,
	cwd: string,
	node: SnapshotTreeNode,
): Promise<BrmemResult<string>> {
	const entries: MktreeEntry[] = [];
	for (const [name, sha] of node.blobs) {
		entries.push({ mode: GIT_BLOB_MODE_FILE, kind: "blob", sha, name });
	}
	for (const [name, child] of node.trees) {
		const subtree = await writeSnapshotTree(commands, cwd, child);
		if (subtree.type === "error") return subtree;
		entries.push({ mode: GIT_TREE_MODE, kind: "tree", sha: subtree.value, name });
	}
	entries.sort(compareMktreeEntries);
	const tree = await runGit(commands, ["mktree"], {
		cwd,
		stdin: entries.map(formatMktreeEntry).join(""),
	});
	if (tree.code !== 0) return gitError("git-mktree-failed", "Could not build Snapshot tree.", tree);
	return brmemOk(tree.stdout.trim());
}

function compareMktreeEntries(left: MktreeEntry, right: MktreeEntry): number {
	if (left.name === right.name) return 0;
	return left.name < right.name ? -1 : 1;
}

function formatMktreeEntry(entry: MktreeEntry): string {
	return `${entry.mode} ${entry.kind} ${entry.sha}\t${entry.name}\n`;
}

async function verifyBuiltTreeMatchesEntries(
	commands: CommandExecApi,
	cwd: string,
	treeSha: string,
	expected: ReadonlyMap<string, string>,
): Promise<BrmemResult<void>> {
	const actual = await enumerateTreeEntries(commands, cwd, treeSha);
	if (doEntryMapsMatch(expected, actual)) return brmemOk(undefined);
	return brmemError(
		"snapshot-tree-mismatch",
		`Built Snapshot tree ${treeSha} did not match requested Entries; refusing to create Snapshot commit. Expected ${formatEntryMapSummary(expected)} but got ${formatEntryMapSummary(actual)}.`,
	);
}

function doEntryMapsMatch(
	expected: ReadonlyMap<string, string>,
	actual: ReadonlyMap<string, string>,
): boolean {
	if (expected.size !== actual.size) return false;
	for (const [key, blobSha] of expected) {
		if (actual.get(key) !== blobSha) return false;
	}
	return true;
}

function formatEntryMapSummary(entries: ReadonlyMap<string, string>): string {
	const keys = [...entries.keys()].sort();
	const samples = keys.slice(0, SNAPSHOT_CORRUPT_SAMPLE_LIMIT);
	const remaining = keys.length - samples.length;
	if (remaining > 0) samples.push(`... and ${remaining} more`);
	return `${entries.size} Entry Key(s): ${samples.join(", ")}`;
}

async function enumerateTreeEntries(
	commands: CommandExecApi,
	cwd: string,
	refOrTree: string,
): Promise<Map<string, string>> {
	const result = await runGit(
		commands,
		["ls-tree", "-r", "--full-tree", "--format=%(path)%x09%(objectname)", refOrTree],
		{ cwd },
	);
	const entries = new Map<string, string>();
	if (result.code !== 0) return entries;
	for (const line of result.stdout.split("\n")) {
		const [path, blobSha] = line.split("\t");
		if (path === undefined || path.length === 0 || blobSha === undefined || blobSha.length === 0)
			continue;
		entries.set(path, blobSha);
	}
	return entries;
}

function parseSnapshotRefsToCount(
	stdout: string,
	namespace: string | undefined,
): readonly SnapshotRefToCount[] {
	const snapshotRefs: SnapshotRefToCount[] = [];
	for (const line of stdout.split("\n")) {
		const snapshotRef = line.trim();
		if (snapshotRef.length === 0) continue;
		const parsed = parseSnapshotRef(snapshotRef);
		if (parsed === undefined) continue;
		if (namespace !== undefined && parsed.namespace !== namespace) continue;
		snapshotRefs.push({ snapshotRef, parsed });
	}
	return snapshotRefs;
}

async function countTreeEntries(
	commands: CommandExecApi,
	cwd: string,
	refOrTree: string,
): Promise<number> {
	const result = await runGit(
		commands,
		["ls-tree", "-r", "--full-tree", "--name-only", refOrTree],
		{
			cwd,
		},
	);
	if (result.code !== 0) return 0;
	let count = 0;
	for (const line of result.stdout.split("\n")) {
		if (line.length > 0) count += 1;
	}
	return count;
}

async function mapWithConcurrency<T, U>(
	items: readonly T[],
	concurrency: number,
	task: (item: T) => Promise<U>,
): Promise<U[]> {
	const results: U[] = [];
	let nextIndex = 0;
	async function worker(): Promise<void> {
		while (nextIndex < items.length) {
			const index = nextIndex;
			nextIndex += 1;
			const item = items[index];
			if (item === undefined) continue;
			results[index] = await task(item);
		}
	}
	const workerCount = Math.min(concurrency, items.length);
	await Promise.all(Array.from({ length: workerCount }, () => worker()));
	return results;
}

async function enumerateEntryUpdatedAt(
	commands: CommandExecApi,
	cwd: string,
	snapshotRef: string,
): Promise<BrmemResult<Map<string, string>>> {
	const result = await runGit(commands, ["log", "--format=%cI", "--name-status", snapshotRef], {
		cwd,
	});
	if (result.code !== 0)
		return gitError("git-log-failed", "Could not resolve Entry update metadata.", result);
	return brmemOk(parseEntryUpdateLog(result.stdout));
}

function parseEntryUpdateLog(stdout: string): Map<string, string> {
	const updatedAtByPath = new Map<string, string>();
	let currentUpdatedAt: string | undefined;
	for (const rawLine of stdout.split("\n")) {
		const line = rawLine.trimEnd();
		if (line.length === 0) continue;
		if (!line.includes("\t")) {
			currentUpdatedAt = line;
			continue;
		}
		if (currentUpdatedAt === undefined) continue;
		const columns = line.split("\t");
		// Rename lines are Rxxx<TAB>old<TAB>new; the last column is the current path.
		// Entry Keys reject control characters including tabs, so tab splitting is safe for managed paths.
		const path = columns[columns.length - 1];
		if (path === undefined || path.length === 0) continue;
		if (!updatedAtByPath.has(path))
			updatedAtByPath.set(path, normalizeBrmemTimestamp(currentUpdatedAt));
	}
	return updatedAtByPath;
}

async function updateSnapshotRef(
	commands: CommandExecApi,
	cwd: string,
	options: { ref: string; newSha: string; expectedOldSha?: string },
): Promise<BrmemResult<void>> {
	const update = await runGit(
		commands,
		["update-ref", options.ref, options.newSha, options.expectedOldSha ?? ZERO_OBJECT_SHA],
		{ cwd },
	);
	if (update.code === 0) return brmemOk(undefined);
	return brmemError(
		"snapshot-ref-changed",
		commandMessage(
			`Snapshot Ref ${JSON.stringify(options.ref)} changed before it could be updated.`,
			update,
		),
		update.displayCommand,
	);
}

function formatInvalid(label: string, value: string, reason: string): string {
	return `Invalid ${label} ${JSON.stringify(value)}: ${reason}`;
}

function commandMessage(message: string, result: GitRunResult): string {
	const stderr = result.stderr.trim();
	const details = stderr.length > 0 ? stderr : result.stdout.trim();
	return details.length === 0 ? message : `${message}: ${details}`;
}

function gitError<T>(code: string, message: string, result: GitRunResult): BrmemResult<T> {
	return brmemError(code, commandMessage(message, result), result.displayCommand);
}
