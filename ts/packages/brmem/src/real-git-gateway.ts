import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { brmemError, brmemFound, brmemMissing, brmemOk, brmemOptionalError, type BrmemResult } from "./contracts.ts";
import type {
	BrmemGateway,
	CopyEntriesResult,
	DeleteEntryResult,
	EntryContent,
	EntryDiagnosticResult,
	PutEntryResult,
} from "./gateway.ts";
import { keyGlobMatches } from "./key-glob.ts";
import {
	buildEntryLocator,
	buildSnapshotRef,
	entrySortKey,
	parseSnapshotRef,
	snapshotRefPrefixes,
	type EntryRef,
} from "./ref-layout.ts";
import { validateBranchName, validateEntryKey, validateKeyGlob, validateNamespaceName } from "./validation.ts";

const EMPTY_TREE_SHA = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const GIT_BLOB_MODE_FILE = "100644";

interface GitRunResult {
	code: number;
	stdout: string;
	stderr: string;
	displayCommand: string;
}

export class RealGitBrmemGateway implements BrmemGateway {
	private readonly cwd: string;

	constructor(cwd: string) {
		this.cwd = cwd;
	}

	async currentBranch(options: { cwd: string }): Promise<BrmemResult<string>> {
		const result = runGit(["branch", "--show-current"], { cwd: options.cwd });
		if (result.code !== 0) return gitError("current_branch_failed", "Could not resolve current branch.", result);
		const branch = result.stdout.trim();
		if (branch.length === 0) return brmemError("detached_head", "Could not resolve current branch; HEAD appears detached.");
		return brmemOk(branch);
	}

	async listEntries(options: { namespace: string; key?: string | undefined; branch?: string | undefined }) {
		const validation = validateNamespaceName(options.namespace);
		if (validation.type === "invalid") return brmemError<readonly EntryRef[]>("invalid_namespace", formatInvalid("namespace", options.namespace, validation.reason));
		return this.collectEntries({ allNamespaces: false, namespace: options.namespace, key: options.key, branch: options.branch });
	}

	async listAllEntries(options: { key?: string | undefined; branch?: string | undefined }) {
		return this.collectEntries({ allNamespaces: true, key: options.key, branch: options.branch });
	}

	async getEntry(options: { namespace: string; key: string; branch: string; at?: string | undefined }) {
		const validation = this.validateEntryAddress(options);
		if (validation.type === "error") return brmemOptionalError<EntryContent>(validation.error.code, validation.error.message, validation.error.displayCommand);
		const snapshotRef = mustBuildSnapshotRef(options.namespace, options.branch);
		const locator = mustBuildEntryLocator(options.namespace, options.key, options.branch);
		const gitTarget = options.at ?? snapshotRef;
		const result = runGit(["show", `${gitTarget}:${options.key}`], { cwd: this.cwd });
		if (result.code !== 0) return brmemMissing<EntryContent>();
		return brmemFound({ content: result.stdout, entryLocator: locator, target: options.at ?? locator, at: options.at });
	}

	async checkEntry(options: { namespace: string; key: string; branch: string; at?: string | undefined }) {
		const validation = this.validateEntryAddress(options);
		if (validation.type === "error") {
			return brmemOptionalError<EntryDiagnosticResult>(validation.error.code, validation.error.message, validation.error.displayCommand);
		}
		const snapshotRef = mustBuildSnapshotRef(options.namespace, options.branch);
		const locator = mustBuildEntryLocator(options.namespace, options.key, options.branch);
		const gitTarget = options.at ?? snapshotRef;
		const existence = runGit(["cat-file", "-e", `${gitTarget}:${options.key}`], { cwd: this.cwd });
		if (existence.code !== 0) return brmemMissing<EntryDiagnosticResult>();
		const blobSha = runGit(["rev-parse", `${gitTarget}:${options.key}`], { cwd: this.cwd });
		if (blobSha.code !== 0) return brmemOptionalError<EntryDiagnosticResult>("git_rev_parse_failed", commandMessage("Could not resolve blob SHA.", blobSha), blobSha.displayCommand);
		const size = runGit(["cat-file", "-s", `${gitTarget}:${options.key}`], { cwd: this.cwd });
		if (size.code !== 0) return brmemOptionalError<EntryDiagnosticResult>("git_cat_file_failed", commandMessage("Could not resolve blob size.", size), size.displayCommand);
		const log = runGit(["log", "-1", "--format=%H%x09%cI", gitTarget], { cwd: this.cwd });
		if (log.code !== 0) return brmemOptionalError<EntryDiagnosticResult>("git_log_failed", commandMessage("Could not resolve snapshot metadata.", log), log.displayCommand);
		const [headSha = "", headDate = ""] = log.stdout.trim().split("\t");
		return brmemFound({
			entryLocator: locator,
			target: options.at ?? locator,
			at: options.at,
			headSha,
			headDate,
			blobSha: blobSha.stdout.trim(),
			sizeBytes: Number(size.stdout.trim()),
		});
	}

	async putEntry(options: { namespace: string; key: string; branch: string; content: string }): Promise<BrmemResult<PutEntryResult>> {
		const validation = this.validateEntryAddress(options);
		if (validation.type === "error") return validation;
		const snapshotRef = mustBuildSnapshotRef(options.namespace, options.branch);
		const parent = runGit(["rev-parse", "--verify", snapshotRef], { cwd: this.cwd });
		const parentSha = parent.code === 0 ? parent.stdout.trim() : undefined;
		const entries = parentSha === undefined ? new Map<string, string>() : enumerateTreeEntries(this.cwd, snapshotRef);
		const blob = runGit(["hash-object", "-w", "--stdin"], { cwd: this.cwd, input: options.content });
		if (blob.code !== 0) return gitError("git_hash_object_failed", "Could not write Entry blob.", blob);
		entries.set(options.key, blob.stdout.trim());
		const tree = buildTreeFromEntries(this.cwd, entries);
		if (tree.type === "error") return tree;
		const commitArgs = ["commit-tree", tree.value, "-m", `brmem put ${options.key}`];
		if (parentSha !== undefined) commitArgs.splice(2, 0, "-p", parentSha);
		const commit = runGit(commitArgs, { cwd: this.cwd });
		if (commit.code !== 0) return gitError("git_commit_tree_failed", "Could not create Branch Memory Snapshot commit.", commit);
		const update = runGit(["update-ref", snapshotRef, commit.stdout.trim()], { cwd: this.cwd });
		if (update.code !== 0) return gitError("git_update_ref_failed", "Could not update Snapshot Ref.", update);
		return brmemOk({ commitSha: commit.stdout.trim(), entry: makeEntryRef(options.namespace, options.key, options.branch) });
	}

	async deleteEntry(options: { namespace: string; key: string; branch: string }): Promise<BrmemResult<DeleteEntryResult>> {
		const validation = this.validateEntryAddress(options);
		if (validation.type === "error") return validation;
		const snapshotRef = mustBuildSnapshotRef(options.namespace, options.branch);
		const parent = runGit(["rev-parse", "--verify", snapshotRef], { cwd: this.cwd });
		if (parent.code !== 0) return brmemError("key_not_found", `key ${JSON.stringify(options.key)} not found`);
		const entries = enumerateTreeEntries(this.cwd, snapshotRef);
		if (!entries.has(options.key)) return brmemError("key_not_found", `key ${JSON.stringify(options.key)} not found`);
		entries.delete(options.key);
		const tree = buildTreeFromEntries(this.cwd, entries);
		if (tree.type === "error") return tree;
		const commit = runGit(["commit-tree", tree.value, "-p", parent.stdout.trim(), "-m", `brmem delete ${options.key}`], { cwd: this.cwd });
		if (commit.code !== 0) return gitError("git_commit_tree_failed", "Could not create delete Snapshot commit.", commit);
		const update = runGit(["update-ref", snapshotRef, commit.stdout.trim()], { cwd: this.cwd });
		if (update.code !== 0) return gitError("git_update_ref_failed", "Could not update Snapshot Ref.", update);
		return brmemOk({ commitSha: commit.stdout.trim(), entry: makeEntryRef(options.namespace, options.key, options.branch), isSnapshotEmpty: entries.size === 0 });
	}

	async copyEntries(options: {
		namespace: string;
		fromBranch: string;
		toBranch: string;
		overwrite: boolean;
		keyGlob?: string | undefined;
	}): Promise<BrmemResult<CopyEntriesResult>> {
		const namespaceValidation = validateNamespaceName(options.namespace);
		if (namespaceValidation.type === "invalid") return brmemError("invalid_namespace", formatInvalid("namespace", options.namespace, namespaceValidation.reason));
		const fromValidation = this.validateGitBranch(options.fromBranch);
		if (fromValidation.type === "error") return fromValidation;
		const toValidation = this.validateGitBranch(options.toBranch);
		if (toValidation.type === "error") return toValidation;
		if (options.keyGlob !== undefined) {
			const globValidation = validateKeyGlob(options.keyGlob);
			if (globValidation.type === "invalid") return brmemError("invalid_key_glob", formatInvalid("Entry Key glob", options.keyGlob, globValidation.reason));
		}
		const sourceRef = mustBuildSnapshotRef(options.namespace, options.fromBranch);
		const sourceSha = runGit(["rev-parse", "--verify", sourceRef], { cwd: this.cwd });
		if (sourceSha.code !== 0) return brmemOk({ entries: [] });
		const destRef = mustBuildSnapshotRef(options.namespace, options.toBranch);
		const destShaResult = runGit(["rev-parse", "--verify", destRef], { cwd: this.cwd });
		const destSha = destShaResult.code === 0 ? destShaResult.stdout.trim() : undefined;
		if (options.keyGlob === undefined) {
			return this.copySnapshot({ namespace: options.namespace, toBranch: options.toBranch, sourceRef, sourceSha: sourceSha.stdout.trim(), destRef, overwrite: options.overwrite });
		}
		return this.copyWithGlob({ ...options, sourceRef, destRef, destSha, keyGlob: options.keyGlob });
	}

	private validateEntryAddress(options: { namespace: string; key: string; branch: string }): BrmemResult<void> {
		const namespaceValidation = validateNamespaceName(options.namespace);
		if (namespaceValidation.type === "invalid") return brmemError("invalid_namespace", formatInvalid("namespace", options.namespace, namespaceValidation.reason));
		const keyValidation = validateEntryKey(options.key);
		if (keyValidation.type === "invalid") return brmemError("invalid_key", formatInvalid("key", options.key, keyValidation.reason));
		return this.validateGitBranch(options.branch);
	}

	private validateGitBranch(branch: string): BrmemResult<void> {
		const branchValidation = validateBranchName(branch);
		if (branchValidation.type === "invalid") return brmemError("invalid_branch_name", formatInvalid("branch name", branch, branchValidation.reason));
		const gitValidation = runGit(["check-ref-format", "--branch", branch], { cwd: this.cwd });
		if (gitValidation.code !== 0) return brmemError("invalid_branch_name", commandMessage(formatInvalid("branch name", branch, "invalid git branch name"), gitValidation), gitValidation.displayCommand);
		return brmemOk(undefined);
	}

	private collectEntries(options: {
		allNamespaces: boolean;
		namespace?: string | undefined;
		key?: string | undefined;
		branch?: string | undefined;
	}): BrmemResult<readonly EntryRef[]> {
		if (options.key !== undefined) {
			const keyValidation = validateEntryKey(options.key);
			if (keyValidation.type === "invalid") return brmemError("invalid_key", formatInvalid("key", options.key, keyValidation.reason));
		}
		if (options.branch !== undefined) {
			const branchValidation = validateBranchName(options.branch);
			if (branchValidation.type === "invalid") return brmemError("invalid_branch_name", formatInvalid("branch name", options.branch, branchValidation.reason));
		}
		const result = runGit(["for-each-ref", "--format=%(refname)", ...snapshotRefPrefixes()], { cwd: this.cwd });
		if (result.code !== 0) return brmemOk([]);
		const entries: EntryRef[] = [];
		for (const line of result.stdout.split("\n")) {
			const snapshotRef = line.trim();
			if (snapshotRef.length === 0) continue;
			const parsed = parseSnapshotRef(snapshotRef);
			if (parsed === undefined) continue;
			if (!options.allNamespaces && parsed.namespace !== options.namespace) continue;
			if (options.branch !== undefined && parsed.branch !== options.branch) continue;
			for (const path of enumerateTreeEntries(this.cwd, snapshotRef).keys()) {
				if (options.key !== undefined && path !== options.key) continue;
				entries.push(makeEntryRef(parsed.namespace, path, parsed.branch));
			}
		}
		return brmemOk(entries.sort(compareEntries));
	}

	private copySnapshot(options: {
		namespace: string;
		toBranch: string;
		sourceRef: string;
		sourceSha: string;
		destRef: string;
		overwrite: boolean;
	}): BrmemResult<CopyEntriesResult> {
		const destEntries = enumerateTreeEntries(this.cwd, options.destRef);
		if (destEntries.size > 0 && !options.overwrite) {
			return brmemError("copy_conflict", `destination has conflicting entries: ${[...destEntries.keys()].sort().join(", ")}`);
		}
		const update = runGit(["update-ref", options.destRef, options.sourceSha], { cwd: this.cwd });
		if (update.code !== 0) return gitError("git_update_ref_failed", "Could not update destination Snapshot Ref.", update);
		const entries = [...enumerateTreeEntries(this.cwd, options.sourceRef).keys()]
			.sort()
			.map((key) => makeEntryRef(options.namespace, key, options.toBranch));
		return brmemOk({ entries });
	}

	private copyWithGlob(options: {
		namespace: string;
		fromBranch: string;
		toBranch: string;
		sourceRef: string;
		destRef: string;
		destSha?: string | undefined;
		overwrite: boolean;
		keyGlob: string;
	}): BrmemResult<CopyEntriesResult> {
		const sourceMatching = [...enumerateTreeEntries(this.cwd, options.sourceRef)].filter(([key]) => keyGlobMatches(key, options.keyGlob));
		if (sourceMatching.length === 0) return brmemOk({ entries: [] });
		const destTree = options.destSha === undefined ? new Map<string, string>() : enumerateTreeEntries(this.cwd, options.destRef);
		const destMatching = [...destTree.keys()].filter((key) => keyGlobMatches(key, options.keyGlob));
		if (destMatching.length > 0 && !options.overwrite) {
			return brmemError("copy_conflict", `destination has conflicting entries: ${destMatching.sort().join(", ")}`);
		}
		for (const key of destMatching) destTree.delete(key);
		for (const [key, blobSha] of sourceMatching) destTree.set(key, blobSha);
		const tree = buildTreeFromEntries(this.cwd, destTree);
		if (tree.type === "error") return tree;
		const scopeArg = options.namespace === "base" ? "--base" : `--namespace ${options.namespace}`;
		const commitArgs = [
			"commit-tree",
			tree.value,
			"-m",
			`brmem copy ${scopeArg} --from-branch ${options.fromBranch} --to-branch ${options.toBranch} --key-glob ${options.keyGlob}`,
		];
		if (options.destSha !== undefined) commitArgs.splice(2, 0, "-p", options.destSha);
		const commit = runGit(commitArgs, { cwd: this.cwd });
		if (commit.code !== 0) return gitError("git_commit_tree_failed", "Could not create copy Snapshot commit.", commit);
		const update = runGit(["update-ref", options.destRef, commit.stdout.trim()], { cwd: this.cwd });
		if (update.code !== 0) return gitError("git_update_ref_failed", "Could not update destination Snapshot Ref.", update);
		return brmemOk({ entries: sourceMatching.map(([key]) => makeEntryRef(options.namespace, key, options.toBranch)).sort(compareEntries) });
	}
}

function runGit(args: readonly string[], options: { cwd: string; input?: string | undefined; env?: NodeJS.ProcessEnv | undefined }): GitRunResult {
	const result = spawnSync("git", [...args], {
		cwd: options.cwd,
		input: options.input,
		env: options.env ?? process.env,
		encoding: "utf8",
	});
	return {
		code: result.status ?? 1,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? result.error?.message ?? "",
		displayCommand: `git ${args.join(" ")}`,
	};
}

function buildTreeFromEntries(cwd: string, entries: ReadonlyMap<string, string>): BrmemResult<string> {
	if (entries.size === 0) return brmemOk(EMPTY_TREE_SHA);
	const tempDir = mkdtempSync(join(tmpdir(), "brmem-index-"));
	try {
		const indexPath = join(tempDir, "index");
		const env = { ...process.env, GIT_INDEX_FILE: indexPath };
		for (const [path, blobSha] of entries) {
			const update = runGit(["update-index", "--add", "--cacheinfo", `${GIT_BLOB_MODE_FILE},${blobSha},${path}`], { cwd, env });
			if (update.code !== 0) return gitError("git_update_index_failed", "Could not build Snapshot tree.", update);
		}
		const tree = runGit(["write-tree"], { cwd, env });
		if (tree.code !== 0) return gitError("git_write_tree_failed", "Could not write Snapshot tree.", tree);
		return brmemOk(tree.stdout.trim());
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
}

function enumerateTreeEntries(cwd: string, refOrTree: string): Map<string, string> {
	const result = runGit(["ls-tree", "-r", "--format=%(path)%x09%(objectname)", refOrTree], { cwd });
	const entries = new Map<string, string>();
	if (result.code !== 0) return entries;
	for (const line of result.stdout.split("\n")) {
		const [path, blobSha] = line.split("\t");
		if (path === undefined || path.length === 0 || blobSha === undefined || blobSha.length === 0) continue;
		entries.set(path, blobSha);
	}
	return entries;
}

function makeEntryRef(namespace: string, key: string, branch: string): EntryRef {
	const entryLocator = mustBuildEntryLocator(namespace, key, branch);
	return { namespace, key, branch, refName: entryLocator, entryLocator };
}

function mustBuildSnapshotRef(namespace: string, branch: string): string {
	const result = buildSnapshotRef(namespace, branch);
	if (result.type === "error") throw new Error(result.error.message);
	return result.value;
}

function mustBuildEntryLocator(namespace: string, key: string, branch: string): string {
	const result = buildEntryLocator(namespace, key, branch);
	if (result.type === "error") throw new Error(result.error.message);
	return result.value;
}

function compareEntries(left: EntryRef, right: EntryRef): number {
	return compareTuple(entrySortKey(left), entrySortKey(right));
}

function compareTuple(left: readonly (number | string)[], right: readonly (number | string)[]): number {
	for (let index = 0; index < left.length; index += 1) {
		const leftValue = left[index];
		const rightValue = right[index];
		if (leftValue === rightValue) continue;
		if (leftValue === undefined) return -1;
		if (rightValue === undefined) return 1;
		return leftValue < rightValue ? -1 : 1;
	}
	return 0;
}

function formatInvalid(label: string, value: string, reason: string): string {
	return `Invalid ${label} ${JSON.stringify(value)}: ${reason}`;
}

function commandMessage(message: string, result: GitRunResult): string {
	const details = result.stderr.trim() || result.stdout.trim();
	return details.length === 0 ? message : `${message}: ${details}`;
}

function gitError<T>(code: string, message: string, result: GitRunResult): BrmemResult<T> {
	return brmemError(code, commandMessage(message, result), result.displayCommand);
}
