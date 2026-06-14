import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeCommandExecApi, formatCommand, type CommandExecApi } from "@asdl/core/exec";

import { brmemError, brmemFound, brmemMissing, brmemOk, brmemOptionalError, type BrmemResult } from "./contracts.ts";
import type {
	BrmemGateway,
	CopyEntriesResult,
	DeleteEntryResult,
	EntryContent,
	EntryDiagnostic,
	PutEntryResult,
} from "./gateway.ts";
import { keyGlobMatches } from "./key-glob.ts";
import {
	compareEntries,
	mustEntryRef,
	mustSnapshotRef,
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
	private readonly commands: CommandExecApi;

	constructor(cwd: string, commands: CommandExecApi = new NodeCommandExecApi()) {
		this.cwd = cwd;
		this.commands = commands;
	}

	async currentBranch(): Promise<BrmemResult<string>> {
		const result = await runGit(this.commands, ["branch", "--show-current"], { cwd: this.cwd });
		if (result.code !== 0) return gitError("current_branch_failed", "Could not resolve current branch.", result);
		const branch = result.stdout.trim();
		if (branch.length === 0) return brmemError("detached_head", "Could not resolve current branch; HEAD appears detached.");
		return brmemOk(branch);
	}

	async listEntries(options: { namespace: string; key?: string | undefined; branch?: string | undefined }) {
		const validation = validateNamespaceName(options.namespace);
		if (validation.type === "invalid") return brmemError<readonly EntryRef[]>("invalid_namespace", formatInvalid("namespace", options.namespace, validation.reason));
		return await this.collectEntries({ allNamespaces: false, namespace: options.namespace, key: options.key, branch: options.branch });
	}

	async listAllEntries(options: { key?: string | undefined; branch?: string | undefined }) {
		return await this.collectEntries({ allNamespaces: true, key: options.key, branch: options.branch });
	}

	async getEntry(options: { namespace: string; key: string; branch: string; at?: string | undefined }) {
		const validation = await this.validateEntryAddress(options);
		if (validation.type === "error") return brmemOptionalError<EntryContent>(validation.error.code, validation.error.message, validation.error.displayCommand);
		const snapshotRef = mustSnapshotRef(options.namespace, options.branch);
		const gitTarget = options.at ?? snapshotRef;
		const result = await runGit(this.commands, ["show", `${gitTarget}:${options.key}`], { cwd: this.cwd });
		if (result.code !== 0) return brmemMissing<EntryContent>();
		return brmemFound({ content: result.stdout });
	}

	async checkEntry(options: { namespace: string; key: string; branch: string; at?: string | undefined }) {
		const validation = await this.validateEntryAddress(options);
		if (validation.type === "error") {
			return brmemOptionalError<EntryDiagnostic>(validation.error.code, validation.error.message, validation.error.displayCommand);
		}
		const snapshotRef = mustSnapshotRef(options.namespace, options.branch);
		const gitTarget = options.at ?? snapshotRef;
		const existence = await runGit(this.commands, ["cat-file", "-e", `${gitTarget}:${options.key}`], { cwd: this.cwd });
		if (existence.code !== 0) return brmemMissing<EntryDiagnostic>();
		const blobSha = await runGit(this.commands, ["rev-parse", `${gitTarget}:${options.key}`], { cwd: this.cwd });
		if (blobSha.code !== 0) return brmemOptionalError<EntryDiagnostic>("git_rev_parse_failed", commandMessage("Could not resolve blob SHA.", blobSha), blobSha.displayCommand);
		const size = await runGit(this.commands, ["cat-file", "-s", `${gitTarget}:${options.key}`], { cwd: this.cwd });
		if (size.code !== 0) return brmemOptionalError<EntryDiagnostic>("git_cat_file_failed", commandMessage("Could not resolve blob size.", size), size.displayCommand);
		const log = await runGit(this.commands, ["log", "-1", "--format=%H%x09%cI", gitTarget], { cwd: this.cwd });
		if (log.code !== 0) return brmemOptionalError<EntryDiagnostic>("git_log_failed", commandMessage("Could not resolve snapshot metadata.", log), log.displayCommand);
		const [headSha = "", headDate = ""] = log.stdout.trim().split("\t");
		return brmemFound({
			headSha,
			headDate,
			blobSha: blobSha.stdout.trim(),
			sizeBytes: Number(size.stdout.trim()),
		});
	}

	async putEntry(options: { namespace: string; key: string; branch: string; content: string }): Promise<BrmemResult<PutEntryResult>> {
		const validation = await this.validateEntryAddress(options);
		if (validation.type === "error") return validation;
		const snapshotRef = mustSnapshotRef(options.namespace, options.branch);
		const parent = await runGit(this.commands, ["rev-parse", "--verify", snapshotRef], { cwd: this.cwd });
		const parentSha = parent.code === 0 ? parent.stdout.trim() : undefined;
		const entries = parentSha === undefined ? new Map<string, string>() : await enumerateTreeEntries(this.commands, this.cwd, snapshotRef);
		const tempDir = mkdtempSync(join(tmpdir(), "brmem-blob-"));
		try {
			const blobPath = join(tempDir, "content");
			writeFileSync(blobPath, options.content, "utf8");
			const blob = await runGit(this.commands, ["hash-object", "-w", "--no-filters", blobPath], { cwd: this.cwd });
			if (blob.code !== 0) return gitError("git_hash_object_failed", "Could not write Entry blob.", blob);
			entries.set(options.key, blob.stdout.trim());
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
		const tree = await buildTreeFromEntries(this.commands, this.cwd, entries);
		if (tree.type === "error") return tree;
		const commitArgs = ["commit-tree", tree.value, "-m", `brmem put ${options.key}`];
		if (parentSha !== undefined) commitArgs.splice(2, 0, "-p", parentSha);
		const commit = await runGit(this.commands, commitArgs, { cwd: this.cwd });
		if (commit.code !== 0) return gitError("git_commit_tree_failed", "Could not create Branch Memory Snapshot commit.", commit);
		const update = await runGit(this.commands, ["update-ref", snapshotRef, commit.stdout.trim()], { cwd: this.cwd });
		if (update.code !== 0) return gitError("git_update_ref_failed", "Could not update Snapshot Ref.", update);
		return brmemOk({ commitSha: commit.stdout.trim(), entry: mustEntryRef(options.namespace, options.key, options.branch) });
	}

	async deleteEntry(options: { namespace: string; key: string; branch: string }): Promise<BrmemResult<DeleteEntryResult>> {
		const validation = await this.validateEntryAddress(options);
		if (validation.type === "error") return validation;
		const snapshotRef = mustSnapshotRef(options.namespace, options.branch);
		const parent = await runGit(this.commands, ["rev-parse", "--verify", snapshotRef], { cwd: this.cwd });
		if (parent.code !== 0) return brmemError("key_not_found", `key ${JSON.stringify(options.key)} not found`);
		const entries = await enumerateTreeEntries(this.commands, this.cwd, snapshotRef);
		if (!entries.has(options.key)) return brmemError("key_not_found", `key ${JSON.stringify(options.key)} not found`);
		entries.delete(options.key);
		const tree = await buildTreeFromEntries(this.commands, this.cwd, entries);
		if (tree.type === "error") return tree;
		const commit = await runGit(this.commands, ["commit-tree", tree.value, "-p", parent.stdout.trim(), "-m", `brmem delete ${options.key}`], { cwd: this.cwd });
		if (commit.code !== 0) return gitError("git_commit_tree_failed", "Could not create delete Snapshot commit.", commit);
		const update = await runGit(this.commands, ["update-ref", snapshotRef, commit.stdout.trim()], { cwd: this.cwd });
		if (update.code !== 0) return gitError("git_update_ref_failed", "Could not update Snapshot Ref.", update);
		return brmemOk({ commitSha: commit.stdout.trim(), entry: mustEntryRef(options.namespace, options.key, options.branch), isSnapshotEmpty: entries.size === 0 });
	}

	async copyEntries(options: {
		namespace: string;
		fromBranch: string;
		toBranch: string;
		shouldOverwrite: boolean;
		keyGlob?: string | undefined;
	}): Promise<BrmemResult<CopyEntriesResult>> {
		const namespaceValidation = validateNamespaceName(options.namespace);
		if (namespaceValidation.type === "invalid") return brmemError("invalid_namespace", formatInvalid("namespace", options.namespace, namespaceValidation.reason));
		const fromValidation = await this.validateGitBranch(options.fromBranch);
		if (fromValidation.type === "error") return fromValidation;
		const toValidation = await this.validateGitBranch(options.toBranch);
		if (toValidation.type === "error") return toValidation;
		if (options.keyGlob !== undefined) {
			const globValidation = validateKeyGlob(options.keyGlob);
			if (globValidation.type === "invalid") return brmemError("invalid_key_glob", formatInvalid("Entry Key glob", options.keyGlob, globValidation.reason));
		}
		const sourceRef = mustSnapshotRef(options.namespace, options.fromBranch);
		const sourceSha = await runGit(this.commands, ["rev-parse", "--verify", sourceRef], { cwd: this.cwd });
		if (sourceSha.code !== 0) return brmemOk({ entries: [] });
		const destRef = mustSnapshotRef(options.namespace, options.toBranch);
		const destShaResult = await runGit(this.commands, ["rev-parse", "--verify", destRef], { cwd: this.cwd });
		const destSha = destShaResult.code === 0 ? destShaResult.stdout.trim() : undefined;
		if (options.keyGlob === undefined) {
			return this.copySnapshot({ namespace: options.namespace, toBranch: options.toBranch, sourceRef, sourceSha: sourceSha.stdout.trim(), destRef, shouldOverwrite: options.shouldOverwrite });
		}
		return this.copyWithGlob({ ...options, sourceRef, destRef, destSha, keyGlob: options.keyGlob });
	}

	private async validateEntryAddress(options: { namespace: string; key: string; branch: string }): Promise<BrmemResult<void>> {
		const namespaceValidation = validateNamespaceName(options.namespace);
		if (namespaceValidation.type === "invalid") return brmemError("invalid_namespace", formatInvalid("namespace", options.namespace, namespaceValidation.reason));
		const keyValidation = validateEntryKey(options.key);
		if (keyValidation.type === "invalid") return brmemError("invalid_key", formatInvalid("key", options.key, keyValidation.reason));
		return await this.validateGitBranch(options.branch);
	}

	private async validateGitBranch(branch: string): Promise<BrmemResult<void>> {
		const branchValidation = validateBranchName(branch);
		if (branchValidation.type === "invalid") return brmemError("invalid_branch_name", formatInvalid("branch name", branch, branchValidation.reason));
		const gitValidation = await runGit(this.commands, ["check-ref-format", "--branch", branch], { cwd: this.cwd });
		if (gitValidation.code !== 0) return brmemError("invalid_branch_name", commandMessage(formatInvalid("branch name", branch, "invalid git branch name"), gitValidation), gitValidation.displayCommand);
		return brmemOk(undefined);
	}

	private async collectEntries(options: {
		allNamespaces: boolean;
		namespace?: string | undefined;
		key?: string | undefined;
		branch?: string | undefined;
	}): Promise<BrmemResult<readonly EntryRef[]>> {
		if (options.key !== undefined) {
			const keyValidation = validateEntryKey(options.key);
			if (keyValidation.type === "invalid") return brmemError("invalid_key", formatInvalid("key", options.key, keyValidation.reason));
		}
		if (options.branch !== undefined) {
			const branchValidation = validateBranchName(options.branch);
			if (branchValidation.type === "invalid") return brmemError("invalid_branch_name", formatInvalid("branch name", options.branch, branchValidation.reason));
		}
		const result = await runGit(this.commands, ["for-each-ref", "--format=%(refname)", ...snapshotRefPrefixes()], { cwd: this.cwd });
		if (result.code !== 0) return brmemOk([]);
		const entries: EntryRef[] = [];
		for (const line of result.stdout.split("\n")) {
			const snapshotRef = line.trim();
			if (snapshotRef.length === 0) continue;
			const parsed = parseSnapshotRef(snapshotRef);
			if (parsed === undefined) continue;
			if (!options.allNamespaces && parsed.namespace !== options.namespace) continue;
			if (options.branch !== undefined && parsed.branch !== options.branch) continue;
			for (const path of (await enumerateTreeEntries(this.commands, this.cwd, snapshotRef)).keys()) {
				if (options.key !== undefined && path !== options.key) continue;
				entries.push(mustEntryRef(parsed.namespace, path, parsed.branch));
			}
		}
		return brmemOk(entries.sort(compareEntries));
	}

	private async copySnapshot(options: {
		namespace: string;
		toBranch: string;
		sourceRef: string;
		sourceSha: string;
		destRef: string;
		shouldOverwrite: boolean;
	}): Promise<BrmemResult<CopyEntriesResult>> {
		const destEntries = await enumerateTreeEntries(this.commands, this.cwd, options.destRef);
		if (destEntries.size > 0 && !options.shouldOverwrite) {
			return brmemError("copy_conflict", `destination has conflicting entries: ${[...destEntries.keys()].sort().join(", ")}`);
		}
		const update = await runGit(this.commands, ["update-ref", options.destRef, options.sourceSha], { cwd: this.cwd });
		if (update.code !== 0) return gitError("git_update_ref_failed", "Could not update destination Snapshot Ref.", update);
		const entries = [...(await enumerateTreeEntries(this.commands, this.cwd, options.sourceRef)).keys()]
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
		destSha?: string | undefined;
		shouldOverwrite: boolean;
		keyGlob: string;
	}): Promise<BrmemResult<CopyEntriesResult>> {
		const sourceMatching = [...(await enumerateTreeEntries(this.commands, this.cwd, options.sourceRef))].filter(([key]) => keyGlobMatches(key, options.keyGlob));
		if (sourceMatching.length === 0) return brmemOk({ entries: [] });
		const destTree = options.destSha === undefined ? new Map<string, string>() : await enumerateTreeEntries(this.commands, this.cwd, options.destRef);
		const destMatching = [...destTree.keys()].filter((key) => keyGlobMatches(key, options.keyGlob));
		if (destMatching.length > 0 && !options.shouldOverwrite) {
			return brmemError("copy_conflict", `destination has conflicting entries: ${destMatching.sort().join(", ")}`);
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
		if (commit.code !== 0) return gitError("git_commit_tree_failed", "Could not create copy Snapshot commit.", commit);
		const update = await runGit(this.commands, ["update-ref", options.destRef, commit.stdout.trim()], { cwd: this.cwd });
		if (update.code !== 0) return gitError("git_update_ref_failed", "Could not update destination Snapshot Ref.", update);
		return brmemOk({ entries: sourceMatching.map(([key]) => mustEntryRef(options.namespace, key, options.toBranch)).sort(compareEntries) });
	}
}

async function runGit(commands: CommandExecApi, args: readonly string[], options: { cwd: string; env?: NodeJS.ProcessEnv | undefined }): Promise<GitRunResult> {
	const result = await commands.exec("git", [...args], {
		cwd: options.cwd,
		env: options.env ?? process.env,
	});
	return {
		code: result.code,
		stdout: result.stdout,
		stderr: result.stderr.length > 0 ? result.stderr : (result.startupError ?? ""),
		displayCommand: formatCommand("git", args),
	};
}

async function buildTreeFromEntries(commands: CommandExecApi, cwd: string, entries: ReadonlyMap<string, string>): Promise<BrmemResult<string>> {
	if (entries.size === 0) return brmemOk(EMPTY_TREE_SHA);
	const tempDir = mkdtempSync(join(tmpdir(), "brmem-index-"));
	try {
		const indexPath = join(tempDir, "index");
		const env = { ...process.env, GIT_INDEX_FILE: indexPath };
		for (const [path, blobSha] of entries) {
			const update = await runGit(commands, ["update-index", "--add", "--cacheinfo", `${GIT_BLOB_MODE_FILE},${blobSha},${path}`], { cwd, env });
			if (update.code !== 0) return gitError("git_update_index_failed", "Could not build Snapshot tree.", update);
		}
		const tree = await runGit(commands, ["write-tree"], { cwd, env });
		if (tree.code !== 0) return gitError("git_write_tree_failed", "Could not write Snapshot tree.", tree);
		return brmemOk(tree.stdout.trim());
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
}

async function enumerateTreeEntries(commands: CommandExecApi, cwd: string, refOrTree: string): Promise<Map<string, string>> {
	const result = await runGit(commands, ["ls-tree", "-r", "--format=%(path)%x09%(objectname)", refOrTree], { cwd });
	const entries = new Map<string, string>();
	if (result.code !== 0) return entries;
	for (const line of result.stdout.split("\n")) {
		const [path, blobSha] = line.split("\t");
		if (path === undefined || path.length === 0 || blobSha === undefined || blobSha.length === 0) continue;
		entries.set(path, blobSha);
	}
	return entries;
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
