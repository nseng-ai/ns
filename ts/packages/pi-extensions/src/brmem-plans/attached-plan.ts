import { readFileSync } from "node:fs";
import { TextEncoder } from "node:util";

import { formatCommand, tailText, type ExecResult } from "../command-runtime.ts";
import { PLAN_BRANCH_NAMESPACE } from "./plan-branch.ts";
import { formatCommandFailure, runBrmem, type BrmemPlanExecApi, type ExecOptions } from "./plan-persistence.ts";

const GIT_TIMEOUT_MS = 10_000;
const MAX_ERROR_CHARS = 4_000;
const IMPL_PLANNED_BRANCH_PROMPT_TEMPLATE = readFileSync(new URL("./prompts/impl-planned-branch.md", import.meta.url), "utf8").trimEnd();

export type AttachedPlanEntry = {
	namespace: string;
	key: string;
	branch: string;
	refName: string;
};

export type LoadedAttachedPlan = {
	branch: string;
	namespace: string;
	selectedKey: string;
	refName: string;
	content: string;
	byteCount: number;
	availableKeys: string[];
};

export type LoadAttachedPlanParams = {
	requestedKey?: string;
};

export type LoadAttachedPlanOptions = {
	cwd: string;
	signal?: AbortSignal | undefined;
};

type CommandRun = {
	result: ExecResult;
	displayCommand: string;
};

type BrmemGetContent = {
	content: string;
	refName: string;
};

export async function loadAttachedPlan(
	pi: BrmemPlanExecApi,
	params: LoadAttachedPlanParams,
	options: LoadAttachedPlanOptions,
): Promise<LoadedAttachedPlan> {
	const branch = await resolveSafeImplementationBranch(pi, options.cwd, options.signal);
	const list = await runBrmem(
		pi,
		options.cwd,
		["list", "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", branch, "--format", "json"],
		options.signal,
	);
	if (list.result.code !== 0 || list.result.killed) {
		throw new Error(formatCommandFailure("brmem list failed", list.displayCommand, list.result));
	}

	const entries = parseBrmemListEntries(list.result.stdout, { namespace: PLAN_BRANCH_NAMESPACE, branch });
	if (entries.length === 0) {
		throw new Error(
			[
				`No brmem-plans entries on branch \`${branch}\`.`,
				"",
				"Create a saved plan with `/write-plan`, attach it to a planned branch with",
				"`/create-planned-branch`, or provide a branch/key that already has a canonical plan.",
			].join("\n"),
		);
	}

	const selectionInput = params.requestedKey === undefined ? { branch, entries } : { branch, requestedKey: params.requestedKey, entries };
	const selectedKey = selectAttachedPlanKey(selectionInput);
	const get = await runBrmem(
		pi,
		options.cwd,
		["get", selectedKey, "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", branch, "--format", "json"],
		options.signal,
	);
	if (get.result.code !== 0 || get.result.killed) {
		throw new Error(formatCommandFailure("brmem get failed", get.displayCommand, get.result));
	}

	const data = parseBrmemGetContent(get.result.stdout, { namespace: PLAN_BRANCH_NAMESPACE, branch, key: selectedKey });
	const availableKeys = sortedUniqueKeys(entries);
	return {
		branch,
		namespace: PLAN_BRANCH_NAMESPACE,
		selectedKey,
		refName: data.refName,
		content: data.content,
		byteCount: new TextEncoder().encode(data.content).length,
		availableKeys,
	};
}

export function normalizeRequestedAttachedPlanKey(requestedKey: string): string {
	const trimmed = requestedKey.trim();
	if (trimmed.length === 0) {
		throw new Error("Requested attached plan key is empty.");
	}
	if (trimmed.startsWith("/")) {
		throw new Error("Requested attached plan key must not start with `/`.");
	}
	if (trimmed.includes("..")) {
		throw new Error("Requested attached plan key must not contain `..`.");
	}
	return trimmed.endsWith(".md") ? trimmed : `${trimmed}.md`;
}

export function selectAttachedPlanKey(input: { branch: string; requestedKey?: string; entries: AttachedPlanEntry[] }): string {
	const availableKeys = sortedUniqueKeys(input.entries);
	const available = new Set(availableKeys);

	if (input.requestedKey !== undefined) {
		const key = normalizeRequestedAttachedPlanKey(input.requestedKey);
		if (!available.has(key)) {
			throw new Error(
				[
					`Requested attached plan key \`${key}\` was not found on branch \`${input.branch}\` in namespace \`${PLAN_BRANCH_NAMESPACE}\`.`,
					"",
					"Available keys:",
					formatAvailableKeys(availableKeys),
				].join("\n"),
			);
		}
		return key;
	}

	const segment = finalBranchSegment(input.branch);
	const branchSegmentKey = `${segment}.md`;
	if (available.has(branchSegmentKey)) {
		return branchSegmentKey;
	}

	if (input.entries.length === 1) {
		const [entry] = input.entries;
		if (entry !== undefined) {
			return entry.key;
		}
	}

	throw new Error(
		[
			`Multiple attached plans exist on branch \`${input.branch}\`, and no branch-segment match was found.`,
			"",
			"Available keys:",
			formatAvailableKeys(availableKeys),
			"",
			"Run `/impl-planned-branch <key>` to choose one.",
		].join("\n"),
	);
}

export function parseBrmemListEntries(stdout: string, expected: { namespace: string; branch: string }): AttachedPlanEntry[] {
	const envelope = parseJsonEnvelope(stdout, "brmem list");
	assertEnvelopeExitCode(envelope, stdout, "brmem list");

	const data = envelope.data;
	if (!isRecord(data)) {
		throw malformedBrmemEnvelope("brmem list", stdout, "expected a data object");
	}

	const entries = data.entries;
	if (!Array.isArray(entries)) {
		throw malformedBrmemEnvelope("brmem list", stdout, "expected data.entries array");
	}

	return entries.map((entry, index) => parseListEntry(entry, index, stdout, expected));
}

export function parseBrmemGetContent(stdout: string, expected: { namespace: string; branch: string; key: string }): BrmemGetContent {
	const envelope = parseJsonEnvelope(stdout, "brmem get");
	assertEnvelopeExitCode(envelope, stdout, "brmem get");

	const data = envelope.data;
	if (!isRecord(data)) {
		throw malformedBrmemEnvelope("brmem get", stdout, "expected a data object");
	}

	const namespace = data.namespace;
	const key = data.key;
	const branch = data.branch;
	const content = data.content;
	const refName = data.ref_name;
	if (
		typeof namespace !== "string" ||
		typeof key !== "string" ||
		typeof branch !== "string" ||
		typeof content !== "string" ||
		typeof refName !== "string"
	) {
		throw malformedBrmemEnvelope(
			"brmem get",
			stdout,
			"expected string fields data.namespace, data.key, data.branch, data.content, and data.ref_name",
		);
	}

	const mismatches = expectedMismatches({ namespace, branch, key }, expected);
	if (mismatches.length > 0) {
		throw malformedBrmemEnvelope("brmem get", stdout, `expected requested data (${mismatches.join(", ")})`);
	}

	return { content, refName };
}

export function buildImplPlannedBranchPrompt(plan: LoadedAttachedPlan): string {
	return renderTemplate(IMPL_PLANNED_BRANCH_PROMPT_TEMPLATE, {
		branch: plan.branch,
		namespace: plan.namespace,
		selected_key: plan.selectedKey,
		ref: plan.refName,
		byte_count: String(plan.byteCount),
		attached_plan: plan.content,
	});
}

function renderTemplate(template: string, values: Record<string, string>): string {
	let rendered = template;
	for (const [key, value] of Object.entries(values)) {
		rendered = rendered.split(`{{${key}}}`).join(value);
	}
	return rendered;
}

export function formatLoadedAttachedPlanEvidence(plan: LoadedAttachedPlan): string {
	return [
		"Loaded attached planned-branch plan.",
		`Branch: ${plan.branch}`,
		`Namespace: ${plan.namespace}`,
		`Selected key: ${plan.selectedKey}`,
		`Ref: ${plan.refName}`,
		`Bytes: ${plan.byteCount}`,
	].join("\n");
}

async function resolveSafeImplementationBranch(
	pi: BrmemPlanExecApi,
	cwd: string,
	signal: AbortSignal | undefined,
): Promise<string> {
	let repoRoot: CommandRun;
	try {
		repoRoot = await runGit(pi, cwd, ["rev-parse", "--show-toplevel"], signal);
	} catch (error) {
		throw new Error(`Cannot load attached plan: not in a Git repository.\n\n${errorMessage(error)}`);
	}
	if (repoRoot.result.code !== 0 || repoRoot.result.killed) {
		throw new Error(
			[
				"Cannot load attached plan: not in a Git repository.",
				"",
				formatCommandFailure("git rev-parse --show-toplevel failed", repoRoot.displayCommand, repoRoot.result),
			].join("\n"),
		);
	}
	const root = firstNonEmptyLine(repoRoot.result.stdout);
	if (root === undefined) {
		throw new Error(`Cannot load attached plan: git rev-parse --show-toplevel returned no repository root.\nCommand: ${repoRoot.displayCommand}`);
	}

	let branchRun: CommandRun;
	try {
		branchRun = await runGit(pi, cwd, ["symbolic-ref", "--short", "HEAD"], signal);
	} catch (error) {
		throw new Error(`Cannot load attached plan from detached HEAD. Check out a feature branch first.\n\n${errorMessage(error)}`);
	}
	if (branchRun.result.code !== 0 || branchRun.result.killed) {
		throw new Error(
			[
				"Cannot load attached plan from detached HEAD. Check out a feature branch first.",
				"",
				formatCommandFailure("git symbolic-ref --short HEAD failed", branchRun.displayCommand, branchRun.result),
			].join("\n"),
		);
	}
	const branch = firstNonEmptyLine(branchRun.result.stdout);
	if (branch === undefined) {
		throw new Error(`Cannot load attached plan from detached HEAD. Check out a feature branch first.\nCommand: ${branchRun.displayCommand}`);
	}

	const defaultBranch = await resolveDefaultBranch(pi, cwd, signal);
	if (branch === "main" || branch === "master" || branch === defaultBranch) {
		throw new Error(`Refusing to implement directly on trunk (\`${branch}\`). Check out a feature branch first.`);
	}

	return branch;
}

async function resolveDefaultBranch(
	pi: BrmemPlanExecApi,
	cwd: string,
	signal: AbortSignal | undefined,
): Promise<string | undefined> {
	let result: CommandRun;
	try {
		result = await runGit(pi, cwd, ["symbolic-ref", "refs/remotes/origin/HEAD", "--short"], signal);
	} catch {
		return undefined;
	}
	if (result.result.code !== 0 || result.result.killed) {
		return undefined;
	}
	const ref = firstNonEmptyLine(result.result.stdout);
	if (ref === undefined) {
		return undefined;
	}
	return ref.startsWith("origin/") ? ref.slice("origin/".length) : ref;
}

async function runGit(
	pi: BrmemPlanExecApi,
	cwd: string,
	args: string[],
	signal: AbortSignal | undefined,
): Promise<CommandRun> {
	const displayCommand = formatCommand("git", args);
	try {
		const result = await pi.exec("git", args, execOptions(cwd, GIT_TIMEOUT_MS, signal));
		return { result, displayCommand };
	} catch (error) {
		throw new Error(`git command failed before completion.\nCommand: ${displayCommand}\nError: ${errorMessage(error)}`);
	}
}

function parseJsonEnvelope(stdout: string, commandName: string): Record<string, unknown> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout);
	} catch (error) {
		throw new Error(
			`Malformed ${commandName} JSON: ${errorMessage(error)}\n\nstdout tail:\n${tailText(stdout, { maxChars: MAX_ERROR_CHARS, maxLines: 80 })}`,
		);
	}

	if (!isRecord(parsed)) {
		throw malformedBrmemEnvelope(commandName, stdout, "expected an envelope object");
	}
	return parsed;
}

function assertEnvelopeExitCode(envelope: Record<string, unknown>, stdout: string, commandName: string): void {
	const exitCode = envelope.exit_code;
	if (exitCode === undefined) {
		return;
	}
	if (typeof exitCode === "number" && exitCode === 0) {
		return;
	}
	throw malformedBrmemEnvelope(commandName, stdout, `expected envelope exit_code 0, got ${JSON.stringify(exitCode)}`);
}

function parseListEntry(
	value: unknown,
	index: number,
	stdout: string,
	expected: { namespace: string; branch: string },
): AttachedPlanEntry {
	if (!isRecord(value)) {
		throw malformedBrmemEnvelope("brmem list", stdout, `expected data.entries[${index}] object`);
	}

	const namespace = value.namespace;
	const key = value.key;
	const branch = value.branch;
	const refName = value.ref_name;
	if (typeof namespace !== "string" || typeof key !== "string" || typeof branch !== "string" || typeof refName !== "string") {
		throw malformedBrmemEnvelope(
			"brmem list",
			stdout,
			`expected string fields data.entries[${index}].namespace, key, branch, and ref_name`,
		);
	}

	const mismatches = expectedMismatches({ namespace, branch }, expected);
	if (mismatches.length > 0) {
		throw malformedBrmemEnvelope("brmem list", stdout, `expected canonical entry at data.entries[${index}] (${mismatches.join(", ")})`);
	}

	return { namespace, key, branch, refName };
}

function expectedMismatches(actual: Record<string, string>, expected: Record<string, string>): string[] {
	const mismatches: string[] = [];
	for (const [field, expectedValue] of Object.entries(expected)) {
		if (actual[field] !== expectedValue) {
			mismatches.push(`${field} ${JSON.stringify(actual[field])} != ${JSON.stringify(expectedValue)}`);
		}
	}
	return mismatches;
}

function malformedBrmemEnvelope(commandName: string, stdout: string, reason: string): Error {
	return new Error(`Malformed ${commandName} JSON: ${reason}.\n\nstdout tail:\n${tailText(stdout, { maxChars: MAX_ERROR_CHARS, maxLines: 80 })}`);
}

function sortedUniqueKeys(entries: AttachedPlanEntry[]): string[] {
	return [...new Set(entries.map((entry) => entry.key))].sort();
}

function formatAvailableKeys(keys: string[]): string {
	return keys.length > 0 ? keys.map((key) => `- ${key}`).join("\n") : "(none)";
}

function finalBranchSegment(branch: string): string {
	const segments = branch.split("/").filter((segment) => segment.length > 0);
	return segments.at(-1) ?? branch;
}

function execOptions(cwd: string, timeout: number, signal: AbortSignal | undefined): ExecOptions {
	if (signal === undefined) {
		return { cwd, timeout };
	}
	return { cwd, timeout, signal };
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstNonEmptyLine(value: string): string | undefined {
	return value
		.split(/\r?\n/)
		.map((line) => line.trim())
		.find((line) => line.length > 0);
}
