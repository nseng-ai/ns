import { formatCommand, formatOutputSection } from "../command-runtime.ts";
import { parseMachineEnvelopeData } from "../machine-envelope.ts";
import { isRecord } from "./primitives.ts";
import type { ExecResult, ExtensionAPI } from "./types.ts";

const SLOT_TIMEOUT_MS = 30_000;
const CMUX_TIMEOUT_MS = 10_000;
const MAX_ERROR_CHARS = 4_000;

export interface SlotCheckoutData {
	slotName: string;
	branchName: string;
	worktreePath: string;
	isAlreadyAssigned: boolean;
}

export interface SlotCheckoutSuccessEnvelope {
	exit_code: 0;
	data: SlotCheckoutData;
}

export interface SlotCheckoutFailureEnvelope {
	exit_code: number;
	error_type?: string;
	message?: string;
}

export type SlotCheckoutEnvelope = SlotCheckoutSuccessEnvelope | SlotCheckoutFailureEnvelope;

export interface SlotCheckoutTarget {
	slotName: string;
	branchName: string;
	worktreePath: string;
	isAlreadyAssigned: boolean;
}

export interface OpenCmuxWorkspaceOptions {
	description: string;
	command?: string;
	failureHeading?: string;
	failureDetails?: readonly string[];
}

export async function checkoutSlot(
	pi: Pick<ExtensionAPI, "exec">,
	cwd: string,
	branch: string,
): Promise<SlotCheckoutTarget | { error: string }> {
	const result = await pi.exec("slot", ["checkout", branch, "--format", "json", "--no-clipboard"], {
		cwd,
		timeout: SLOT_TIMEOUT_MS,
	});

	const parsed = parseSlotCheckoutEnvelope(result.stdout);
	if (!parsed) {
		const stderr = result.stderr.trim();
		return {
			error:
				stderr.length > 0
					? `slot checkout failed: ${stderr}`
					: "slot checkout failed with unreadable JSON output.",
		};
	}

	if (isSlotCheckoutSuccessEnvelope(parsed)) {
		return slotCheckoutTargetFromData(parsed.data);
	}

	const failure = parsed;
	return {
		error: failure.message ?? `slot checkout failed${failure.error_type ? ` (${failure.error_type})` : ""}.`,
	};
}

export async function openCmuxWorkspace(
	pi: Pick<ExtensionAPI, "exec">,
	target: SlotCheckoutTarget,
	options: OpenCmuxWorkspaceOptions,
): Promise<{ ok: true } | { error: string }> {
	const args = buildNewWorkspaceArgs(target, options);
	const result = await pi.exec("cmux", args, { cwd: target.worktreePath, timeout: CMUX_TIMEOUT_MS });
	if (result.code === 0 && !result.killed) {
		return { ok: true };
	}

	return {
		error: formatCmuxWorkspaceFailure(result, args, options),
	};
}

export function buildNewWorkspaceArgs(
	target: SlotCheckoutTarget,
	options: Pick<OpenCmuxWorkspaceOptions, "description" | "command">,
): string[] {
	const args = [
		"new-workspace",
		"--name",
		target.branchName,
		"--description",
		options.description,
		"--cwd",
		target.worktreePath,
	];
	if (options.command !== undefined) {
		args.push("--command", options.command);
	}
	return args;
}

export function slotCheckoutTargetFromData(data: SlotCheckoutData): SlotCheckoutTarget {
	return {
		slotName: data.slotName,
		branchName: data.branchName,
		worktreePath: data.worktreePath,
		isAlreadyAssigned: data.isAlreadyAssigned,
	};
}

export function isSlotCheckoutSuccessEnvelope(
	envelope: SlotCheckoutEnvelope,
): envelope is SlotCheckoutSuccessEnvelope {
	return envelope.exit_code === 0 && "data" in envelope;
}

export function parseSlotCheckoutEnvelope(stdout: string): SlotCheckoutEnvelope | undefined {
	const success = parseSlotCheckoutSuccessEnvelope(stdout);
	if (success !== undefined) {
		return success;
	}
	return parseSlotCheckoutFailureEnvelope(stdout);
}

function parseSlotCheckoutSuccessEnvelope(stdout: string): SlotCheckoutSuccessEnvelope | undefined {
	const parsed = parseMachineEnvelopeData(stdout, { label: "slot checkout JSON", stdoutTail: false });
	if (parsed.type === "invalid") {
		// Malformed or non-success slot CLI output is handled by callers or the failure-envelope parser.
		return undefined;
	}
	return coerceSlotCheckoutSuccessEnvelope(parsed.data);
}

function coerceSlotCheckoutSuccessEnvelope(data: Record<string, unknown>): SlotCheckoutSuccessEnvelope | undefined {
	if (
		typeof data.slot_name !== "string" ||
		typeof data.branch_name !== "string" ||
		typeof data.worktree_path !== "string" ||
		typeof data.already_assigned !== "boolean"
	) {
		return undefined;
	}
	return {
		exit_code: 0,
		data: {
			slotName: data.slot_name,
			branchName: data.branch_name,
			worktreePath: data.worktree_path,
			isAlreadyAssigned: data.already_assigned,
		},
	};
}

function parseSlotCheckoutFailureEnvelope(stdout: string): SlotCheckoutFailureEnvelope | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout);
	} catch {
		return undefined;
	}
	if (!isRecord(parsed) || typeof parsed.exit_code !== "number" || parsed.exit_code === 0) {
		return undefined;
	}
	const failure: SlotCheckoutFailureEnvelope = {
		exit_code: parsed.exit_code,
	};
	if (typeof parsed.error_type === "string") {
		failure.error_type = parsed.error_type;
	}
	if (typeof parsed.message === "string") {
		failure.message = parsed.message;
	}
	return failure;
}

function formatCmuxWorkspaceFailure(
	result: ExecResult,
	args: string[],
	options: OpenCmuxWorkspaceOptions,
): string {
	const heading = options.failureHeading ?? "cmux new-workspace failed.";
	const lines = [
		heading,
		...(options.failureDetails ?? []),
		formatCommandFailure("cmux new-workspace failed.", "cmux", args, result),
	];
	return lines.filter((line) => line.length > 0).join("\n");
}

function formatCommandFailure(title: string, command: string, args: string[], result: ExecResult): string {
	const status = result.killed ? `exit code ${result.code}; process was killed or timed out` : `exit code ${result.code}`;
	const sections = [
		`${title} (${status})`,
		`Command: ${formatCommand(command, args)}`,
		formatOutputSection("stdout", result.stdout, { maxChars: MAX_ERROR_CHARS, maxLines: 80 }),
		formatOutputSection("stderr", result.stderr, { maxChars: MAX_ERROR_CHARS, maxLines: 80 }),
	];
	return sections.join("\n\n");
}
