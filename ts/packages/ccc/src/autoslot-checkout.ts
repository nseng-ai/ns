import { formatCommand, formatOutputSection } from "@asdl/core/exec";
import { parseMachineEnvelopeData } from "@asdl/pi-extension-runtime/machine-envelope";
import { isRecord } from "./cmux/primitives.ts";

const SLOT_TIMEOUT_MS = 30_000;
const MAX_ERROR_CHARS = 4_000;
const MAX_ERROR_LINES = 80;

export interface AutoslotCheckoutTarget {
	slotName: string;
	branchName: string;
	worktreePath: string;
	cdCommand: string;
	isAlreadyAssigned: boolean;
}

export type AutoslotCheckoutResult =
	| { ok: true; target: AutoslotCheckoutTarget }
	| { ok: false; error: string };

export interface AutoslotCheckoutExecResult {
	stdout: string;
	stderr: string;
	code: number;
	killed?: boolean;
}

export interface AutoslotCheckoutExecAPI {
	exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<AutoslotCheckoutExecResult>;
}

export async function checkoutAutoslot(pi: AutoslotCheckoutExecAPI, cwd: string): Promise<AutoslotCheckoutResult> {
	const args = ["checkout", "--current", "--format", "json"];
	const result = await pi.exec("slot", args, { cwd, timeout: SLOT_TIMEOUT_MS });
	const parsed = parseAutoslotCheckoutTarget(result.stdout);
	if (parsed.ok) {
		return parsed;
	}

	const failure = parseAutoslotFailureEnvelope(result.stdout);
	if (failure !== undefined) {
		return { ok: false, error: failure };
	}

	return {
		ok: false,
		error: formatAutoslotCheckoutFailure(result, args, parsed.error),
	};
}

function parseAutoslotCheckoutTarget(stdout: string): AutoslotCheckoutResult {
	const parsed = parseMachineEnvelopeData(stdout, {
		label: "slot checkout --current JSON",
		stdoutTail: { maxChars: MAX_ERROR_CHARS, maxLines: MAX_ERROR_LINES },
	});
	if (parsed.type !== "valid") {
		return { ok: false, error: parsed.message };
	}

	const target = coerceAutoslotCheckoutTarget(parsed.data);
	if (!target.ok) {
		return target;
	}
	return { ok: true, target: target.target };
}

function coerceAutoslotCheckoutTarget(data: Record<string, unknown>): AutoslotCheckoutResult {
	if (
		typeof data.slot_name !== "string" ||
		typeof data.branch_name !== "string" ||
		typeof data.worktree_path !== "string" ||
		typeof data.cd_command !== "string" ||
		typeof data.already_assigned !== "boolean"
	) {
		return { ok: false, error: "Malformed slot checkout --current JSON: expected slot_name, branch_name, worktree_path, cd_command, and already_assigned data fields." };
	}
	return {
		ok: true,
		target: {
			slotName: data.slot_name,
			branchName: data.branch_name,
			worktreePath: data.worktree_path,
			cdCommand: data.cd_command,
			isAlreadyAssigned: data.already_assigned,
		},
	};
}

function parseAutoslotFailureEnvelope(stdout: string): string | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout);
	} catch {
		return undefined;
	}
	if (!isRecord(parsed) || typeof parsed.exit_code !== "number" || parsed.exit_code === 0) {
		return undefined;
	}
	const status = typeof parsed.error_type === "string" ? ` (${parsed.error_type})` : "";
	if (typeof parsed.message === "string" && parsed.message.length > 0) {
		return `slot checkout --current failed${status}: ${parsed.message}`;
	}
	return `slot checkout --current failed with exit_code ${parsed.exit_code}${status}.`;
}

function formatAutoslotCheckoutFailure(result: AutoslotCheckoutExecResult, args: readonly string[], parseError: string): string {
	return [
		"slot checkout --current failed with unreadable JSON output.",
		parseError,
		`Command: ${formatCommand("slot", args)}`,
		formatOutputSection("stdout", result.stdout, { maxChars: MAX_ERROR_CHARS, maxLines: MAX_ERROR_LINES }),
		formatOutputSection("stderr", result.stderr, { maxChars: MAX_ERROR_CHARS, maxLines: MAX_ERROR_LINES }),
	].join("\n\n");
}
