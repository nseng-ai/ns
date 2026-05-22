import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runCommand, type ExecFunction } from "./command.ts";
import { escapeBranchForKey, deriveHandoffKey } from "./keys.ts";
import { parseSliceLedgerMarkdown } from "./ledger.ts";
import { parseStackPlanMarkdown } from "./plan.ts";

const COMMAND_TIMEOUT_MS = 30_000;

export type StackSliceDonePayload = {
	summary: string;
	validation: string;
	handoff_markdown: string;
	semantic_update_file?: string;
	followups?: string[];
};

export type StackSliceBlockedPayload = {
	reason: string;
	attempted: string;
	next_steps?: string;
};

export type PendingCloseouts = Map<string, StackSliceDonePayload>;

export type CloseoutDependencies = {
	cwd: string;
	exec: ExecFunction;
	writeTempFile?: ((content: string) => Promise<string>) | undefined;
	signal?: AbortSignal | undefined;
};

export type CloseoutResult = {
	branch: string;
	handoffKey: string;
	handoffNamespace: string;
	brmemOutput: string;
};

async function defaultWriteTempFile(content: string): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "asdl-stack-closeout-"));
	const path = join(directory, "handoff.md");
	await writeFile(path, content, "utf8");
	return path;
}

async function currentGitBranch(deps: CloseoutDependencies): Promise<string> {
	const result = await runCommand(deps.exec, "git", ["branch", "--show-current"], {
		cwd: deps.cwd,
		signal: deps.signal,
		timeout: COMMAND_TIMEOUT_MS,
	});
	const branch = result.stdout.trim();
	if (branch.length === 0) {
		throw new Error("Cannot close out a stack slice from a detached HEAD; current git branch is empty.");
	}
	return branch;
}

function parseBrmemListKeys(stdout: string): string[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to parse brmem list JSON: ${message}`);
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new Error("Invalid brmem list JSON: expected an envelope object.");
	}
	const data = (parsed as { data?: unknown }).data;
	if (typeof data !== "object" || data === null || Array.isArray(data)) {
		throw new Error("Invalid brmem list JSON: expected data object.");
	}
	const entries = (data as { entries?: unknown }).entries;
	if (!Array.isArray(entries)) {
		throw new Error("Invalid brmem list JSON: expected data.entries array.");
	}
	return entries.map((entry, index) => {
		if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
			throw new Error(`Invalid brmem list entry at index ${index}: expected object.`);
		}
		const key = (entry as { key?: unknown }).key;
		if (typeof key !== "string") {
			throw new Error(`Invalid brmem list entry at index ${index}: expected key string.`);
		}
		return key;
	});
}

async function findLedgerKey(branch: string, deps: CloseoutDependencies): Promise<string> {
	const result = await runCommand(
		deps.exec,
		"brmem",
		["list", "--namespace", "stack-runs", "--branch", branch, "--format", "json"],
		{
			cwd: deps.cwd,
			signal: deps.signal,
			timeout: COMMAND_TIMEOUT_MS,
		},
	);
	const escapedBranch = escapeBranchForKey(branch);
	const matchingKeys = parseBrmemListKeys(result.stdout).filter((key) =>
		key.endsWith(`/${escapedBranch}.md`),
	);
	if (matchingKeys.length === 0) {
		throw new Error(`No stack-runs ledger found for current branch ${branch}.`);
	}
	if (matchingKeys.length > 1) {
		throw new Error(
			`Multiple stack-runs ledgers match current branch ${branch}: ${matchingKeys.join(", ")}.`,
		);
	}
	return matchingKeys[0]!;
}

async function brmemGet(
	deps: CloseoutDependencies,
	args: { namespace: string; key: string; branch: string },
): Promise<string> {
	const result = await runCommand(
		deps.exec,
		"brmem",
		["get", args.key, "--namespace", args.namespace, "--branch", args.branch],
		{
			cwd: deps.cwd,
			signal: deps.signal,
			timeout: COMMAND_TIMEOUT_MS,
		},
	);
	return result.stdout;
}

export function takePendingCloseout(pending: PendingCloseouts, id: string): StackSliceDonePayload {
	const payload = pending.get(id);
	if (!payload) {
		throw new Error(
			`No pending stack_slice_done payload found for ${id}. Ask the agent to call stack_slice_done again, then retry /stack-closeout with the new id.`,
		);
	}
	return payload;
}

export async function closeoutStackSlice(
	payload: StackSliceDonePayload,
	deps: CloseoutDependencies,
): Promise<CloseoutResult> {
	const branch = await currentGitBranch(deps);
	const ledgerKey = await findLedgerKey(branch, deps);
	const ledgerContent = await brmemGet(deps, { namespace: "stack-runs", key: ledgerKey, branch });
	const ledger = parseSliceLedgerMarkdown(ledgerContent);
	const planContent = await brmemGet(deps, {
		namespace: ledger.plan.namespace,
		key: ledger.plan.key,
		branch: ledger.plan.branch,
	});
	const plan = parseStackPlanMarkdown(planContent);
	if (plan.sha256 !== ledger.plan.sha256) {
		throw new Error(
			`Plan hash drift detected for ${ledger.plan.namespace}/${ledger.plan.key} on ${ledger.plan.branch}: ledger has ${ledger.plan.sha256}, current content has ${plan.sha256}.`,
		);
	}

	const handoffLocator = { ...deriveHandoffKey(plan.objective, branch), branch };
	const writeTempFile = deps.writeTempFile ?? defaultWriteTempFile;
	const handoffPath = await writeTempFile(payload.handoff_markdown);
	const putResult = await runCommand(
		deps.exec,
		"brmem",
		[
			"put",
			handoffLocator.key,
			"--namespace",
			handoffLocator.namespace,
			"--branch",
			handoffLocator.branch,
			"--file",
			handoffPath,
		],
		{
			cwd: deps.cwd,
			signal: deps.signal,
			timeout: COMMAND_TIMEOUT_MS,
		},
	);

	return {
		branch,
		handoffNamespace: handoffLocator.namespace,
		handoffKey: handoffLocator.key,
		brmemOutput: putResult.stdout.trimEnd(),
	};
}

export function formatCloseoutResult(result: CloseoutResult): string {
	return [
		`Stored stack slice handoff for ${result.branch}.`,
		`Entry: ${result.handoffNamespace}/${result.handoffKey}`,
		result.brmemOutput,
	]
		.filter((line) => line.length > 0)
		.join("\n");
}
