import { formatCommand, formatOutputSection } from "@asdl/core/exec";
import { parseMachineEnvelopeData } from "@asdl/pi-extension-runtime/machine-envelope";
import type { ExecResult, ExtensionAPI } from "@asdl/pi-extension-runtime/cmux/types";

const SLOT_TIMEOUT_MS = 30_000;
const MAX_ERROR_CHARS = 4_000;
const MAX_ERROR_LINES = 80;

export interface SlotCheckoutTarget {
	slotName: string;
	branchName: string;
	worktreePath: string;
	cdCommand: string;
}

export type SlotCheckoutRef = { kind: "branch"; branchName: string } | { kind: "current" };

export type SlotCheckoutResult =
	| { ok: true; target: SlotCheckoutTarget }
	| { ok: false; error: string };

export async function checkoutSlot(
	pi: Pick<ExtensionAPI, "exec">,
	cwd: string,
	ref: SlotCheckoutRef,
): Promise<SlotCheckoutResult> {
	const args = buildSlotCheckoutArgs(ref);
	const result = await pi.exec("slot", args, { cwd, timeout: SLOT_TIMEOUT_MS });
	const parsed = parseMachineEnvelopeData(result.stdout, {
		label: slotCheckoutLabel(ref),
		stdoutTail: { maxChars: MAX_ERROR_CHARS, maxLines: MAX_ERROR_LINES },
	});
	if (parsed.type === "failure") {
		return { ok: false, error: formatSlotCheckoutCliFailure(slotCheckoutCommandName(ref), parsed) };
	}
	if (parsed.type === "invalid") {
		return { ok: false, error: formatSlotCheckoutUnreadableFailure(result, args, parsed.message) };
	}

	const target = coerceSlotCheckoutTarget(parsed.data);
	if (target === undefined) {
		return {
			ok: false,
			error: formatSlotCheckoutUnreadableFailure(
				result,
				args,
				`Malformed ${slotCheckoutLabel(ref)}: expected slot_name, branch_name, worktree_path, and cd_command data fields.`,
			),
		};
	}
	return { ok: true, target };
}

function buildSlotCheckoutArgs(ref: SlotCheckoutRef): string[] {
	return ref.kind === "branch"
		? ["checkout", ref.branchName, "--format", "json", "--no-clipboard"]
		: ["checkout", "--current", "--format", "json", "--no-clipboard"];
}

function slotCheckoutCommandName(ref: SlotCheckoutRef): string {
	return ref.kind === "branch" ? "slot checkout" : "slot checkout --current";
}

function slotCheckoutLabel(ref: SlotCheckoutRef): string {
	return `${slotCheckoutCommandName(ref)} JSON`;
}

function coerceSlotCheckoutTarget(data: Record<string, unknown>): SlotCheckoutTarget | undefined {
	if (
		typeof data.slot_name !== "string" ||
		typeof data.branch_name !== "string" ||
		typeof data.worktree_path !== "string" ||
		typeof data.cd_command !== "string"
	) {
		return undefined;
	}
	return {
		slotName: data.slot_name,
		branchName: data.branch_name,
		worktreePath: data.worktree_path,
		cdCommand: data.cd_command,
	};
}

function formatSlotCheckoutCliFailure(
	commandName: string,
	failure: { exitCode: number; errorType?: string; cliMessage?: string },
): string {
	const status = failure.errorType === undefined ? "" : ` (${failure.errorType})`;
	if (failure.cliMessage !== undefined) {
		return `${commandName} failed${status}: ${failure.cliMessage}`;
	}
	return `${commandName} failed with exit_code ${failure.exitCode}${status}.`;
}

function formatSlotCheckoutUnreadableFailure(
	result: ExecResult,
	args: readonly string[],
	parseError: string,
): string {
	return [
		`slot checkout failed with unreadable JSON output (${formatSlotCheckoutStatus(result)}).`,
		parseError,
		`Command: ${formatCommand("slot", args)}`,
		formatOutputSection("stdout", result.stdout, {
			maxChars: MAX_ERROR_CHARS,
			maxLines: MAX_ERROR_LINES,
		}),
		formatOutputSection("stderr", result.stderr, {
			maxChars: MAX_ERROR_CHARS,
			maxLines: MAX_ERROR_LINES,
		}),
	].join("\n\n");
}

function formatSlotCheckoutStatus(result: ExecResult): string {
	return result.killed
		? `exit code ${result.code}; process was killed or timed out`
		: `exit code ${result.code}`;
}
