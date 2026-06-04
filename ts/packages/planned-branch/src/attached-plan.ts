import { readFileSync } from "node:fs";
import { TextEncoder } from "node:util";

import { tailText } from "./command-runtime.ts";
import { RealPlannedBranchGitGateway, type PlannedBranchGitGateway } from "./git-gateway.ts";
import { parseMachineEnvelopeData } from "./machine-envelope.ts";
import { PLAN_BRANCH_NAMESPACE } from "./planned-branch-creation.ts";
import { formatCommandFailure, runBrmem, type PlanCommandExecApi } from "./plan-persistence.ts";
const MAX_ERROR_CHARS = 4_000;
const PLANNED_BRANCH_IMPL_PROMPT_TEMPLATE = readFileSync(new URL("./prompts/planned-branch-impl.md", import.meta.url), "utf8").trimEnd();

export interface AttachedPlanEntry {
	namespace: string;
	key: string;
	branch: string;
	refName: string;
}

export interface LoadedAttachedPlan {
	branch: string;
	namespace: string;
	selectedKey: string;
	refName: string;
	content: string;
	byteCount: number;
	availableKeys: string[];
}

export interface LoadAttachedPlanParams {
	requestedKey?: string;
}

export interface LoadAttachedPlanOptions {
	cwd: string;
	signal?: AbortSignal | undefined;
	git?: PlannedBranchGitGateway | undefined;
}

interface BrmemGetContent {
	content: string;
	refName: string;
}

export async function loadAttachedPlan(
	pi: PlanCommandExecApi,
	params: LoadAttachedPlanParams,
	options: LoadAttachedPlanOptions,
): Promise<LoadedAttachedPlan> {
	const git = options.git ?? new RealPlannedBranchGitGateway(pi);
	const branch = await resolveSafeImplementationBranch(git, options.cwd, options.signal);
	const list = await runBrmem(pi, {
		cwd: options.cwd,
		args: ["list", "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", branch, "--format", "json"],
		signal: options.signal,
	});
	if (list.type === "unavailable") {
		throw new Error(list.message);
	}
	if (list.result.code !== 0 || list.result.killed) {
		throw new Error(formatCommandFailure("brmem list failed", list.displayCommand, list.result));
	}

	const entries = parseBrmemListEntries(list.result.stdout, { namespace: PLAN_BRANCH_NAMESPACE, branch });
	if (entries.length === 0) {
		throw new Error(
			[
				`No planned-branch entries on branch \`${branch}\`.`,
				"",
				"Create a saved plan with `planned-branch exec write-plan-file`, attach it with",
				"`planned-branch exec create`, or provide a branch/key that already has a canonical plan.",
			].join("\n"),
		);
	}

	const selectionInput = params.requestedKey === undefined ? { branch, entries } : { branch, requestedKey: params.requestedKey, entries };
	const selectedKey = selectAttachedPlanKey(selectionInput);
	const get = await runBrmem(pi, {
		cwd: options.cwd,
		args: ["get", selectedKey, "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", branch, "--format", "json"],
		signal: options.signal,
	});
	if (get.type === "unavailable") {
		throw new Error(get.message);
	}
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
			"Run `planned-branch exec load-plan <key>` to choose one.",
		].join("\n"),
	);
}

export function parseBrmemListEntries(stdout: string, expected: { namespace: string; branch: string }): AttachedPlanEntry[] {
	const data = parseMachineEnvelopeData(stdout, {
		label: "brmem list JSON",
		stdoutTail: { maxChars: MAX_ERROR_CHARS, maxLines: 80 },
	});

	const entries = data.entries;
	if (!Array.isArray(entries)) {
		throw malformedBrmemEnvelope("brmem list", stdout, "expected data.entries array");
	}

	return entries.map((entry, index) => parseListEntry(entry, index, stdout, expected));
}

export function parseBrmemGetContent(stdout: string, expected: { namespace: string; branch: string; key: string }): BrmemGetContent {
	const data = parseMachineEnvelopeData(stdout, {
		label: "brmem get JSON",
		stdoutTail: { maxChars: MAX_ERROR_CHARS, maxLines: 80 },
	});

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
	return renderTemplate(PLANNED_BRANCH_IMPL_PROMPT_TEMPLATE, {
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

async function resolveSafeImplementationBranch(git: PlannedBranchGitGateway, cwd: string, signal: AbortSignal | undefined): Promise<string> {
	const repoRoot = await git.repoRoot({ cwd, signal });
	if (!repoRoot.ok) {
		throw new Error(["Cannot load attached plan: not in a Git repository.", "", repoRoot.error.message].join("\n"));
	}

	const branchResult = await git.implementationBranch({ cwd, signal });
	if (!branchResult.ok) {
		throw new Error(["Cannot load attached plan from detached HEAD. Check out a feature branch first.", "", branchResult.error.message].join("\n"));
	}
	const branch = branchResult.value;

	const defaultBranch = await git.defaultBranch({ cwd, signal });
	const defaultBranchValue = defaultBranch.type === "found" ? defaultBranch.value : undefined;
	if (branch === "main" || branch === "master" || branch === defaultBranchValue) {
		throw new Error(`Refusing to implement directly on trunk (\`${branch}\`). Check out a feature branch first.`);
	}

	return branch;
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

