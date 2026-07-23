import { buildMachineEnvelopeSchema } from "@nseng-ai/clinkr";
import type { ExecResult } from "@nseng-ai/foundation/command";
import { z } from "zod";

const SLOT_CHECKOUT_TIMEOUT_MS = 120_000;

export type SlotCheckoutRef = { kind: "branch"; branchName: string } | { kind: "current" };

export interface SlotCheckoutTarget {
	slotName: string;
	branchName: string;
	worktreePath: string;
}

export interface SlotCheckoutFailure {
	errorType: string;
	message: string;
}

export type SlotCheckoutNavigationWarning = {
	type: "cd-directive-write-failed";
	message: string;
};

type SlotCheckoutCommandResult =
	| {
			ok: true;
			target: SlotCheckoutTarget;
			cdDirectiveStatus: "inactive" | "written" | "failed";
			cdDirectivePath: string | null;
			cdDirectiveFailureDetail: string | null;
	  }
	| { ok: false; failure: SlotCheckoutFailure };

export type SlotCheckoutResult =
	| {
			ok: true;
			target: SlotCheckoutTarget;
			warnings: readonly SlotCheckoutNavigationWarning[];
	  }
	| { ok: false; failure: SlotCheckoutFailure };

export type SlotCheckoutExec = (
	command: string,
	args: string[],
	timeoutMs: number,
) => Promise<ExecResult>;

export function buildSlotCheckoutArgs(ref: SlotCheckoutRef): string[] {
	return [
		"slot",
		"checkout",
		...(ref.kind === "current" ? ["--current"] : [ref.branchName]),
		"--no-clipboard",
		"--format",
		"json",
	];
}

export function parseSlotCheckoutResult(result: ExecResult): SlotCheckoutCommandResult {
	if (result.type === "spawn-failed") {
		return boundaryFailure("slot-checkout-spawn-failed", `Could not start ns: ${result.error}`);
	}
	if (result.type === "cancelled") {
		return boundaryFailure(
			"slot-checkout-cancelled",
			"The ns slot checkout command was cancelled.",
		);
	}
	if (result.type === "timed-out") {
		return boundaryFailure("slot-checkout-timed-out", "The ns slot checkout command timed out.");
	}

	let json: unknown;
	try {
		json = JSON.parse(result.stdout);
	} catch {
		if (result.code !== 0 || result.signal !== null) {
			return boundaryFailure(
				"slot-checkout-process-failed",
				`The ns slot checkout process failed without a valid machine envelope (exit ${String(result.code)}${result.signal === null ? "" : `, signal ${result.signal}`}).`,
			);
		}
		return boundaryFailure(
			"slot-checkout-invalid-json",
			"The ns slot checkout command returned invalid JSON.",
		);
	}
	const envelopeResult = buildSlotCheckoutEnvelopeSchema().safeParse(json);
	if (!envelopeResult.success) {
		return boundaryFailure(
			"slot-checkout-invalid-envelope",
			"The ns slot checkout command returned an invalid machine envelope.",
		);
	}
	const envelope = envelopeResult.data;
	if (result.signal !== null || result.code !== envelope.exitCode) {
		return boundaryFailure(
			"slot-checkout-status-mismatch",
			`The ns slot checkout process status did not match its machine envelope (process ${String(result.code)}, envelope ${envelope.exitCode}).`,
		);
	}

	switch (envelope.status) {
		case "ok": {
			const {
				slotName,
				branchName,
				worktreePath,
				cdDirectiveStatus,
				cdDirectivePath,
				cdDirectiveFailureDetail,
			} = envelope.data;
			return {
				ok: true,
				target: { slotName, branchName, worktreePath },
				cdDirectiveStatus,
				cdDirectivePath,
				cdDirectiveFailureDetail,
			};
		}
		case "failure":
			return { ok: false, failure: { errorType: envelope.errorType, message: envelope.message } };
		case "negative":
		case "usageError":
			return boundaryFailure(
				"slot-checkout-unexpected-envelope",
				`The ns slot checkout command returned unexpected ${envelope.status} status: ${envelope.message}`,
			);
	}
}

export async function checkoutSlot(
	exec: SlotCheckoutExec,
	ref: SlotCheckoutRef,
): Promise<SlotCheckoutResult> {
	const result = await exec("ns", buildSlotCheckoutArgs(ref), SLOT_CHECKOUT_TIMEOUT_MS);
	const checkout = parseSlotCheckoutResult(result);
	if (!checkout.ok) return checkout;
	if (checkout.cdDirectiveStatus !== "failed") {
		return { ok: true, target: checkout.target, warnings: [] };
	}

	const path = checkout.cdDirectivePath ?? "the configured directive path";
	const detail = checkout.cdDirectiveFailureDetail ?? "directive write failed";
	return {
		ok: true,
		target: checkout.target,
		warnings: [
			{
				type: "cd-directive-write-failed",
				message: `Slot checkout succeeded, but the parent-shell navigation directive could not be written to ${path}: ${detail}`,
			},
		],
	};
}

export function formatSlotCheckoutFailureCause(failure: SlotCheckoutFailure): string {
	return `Slot checkout failed (${failure.errorType}): ${failure.message}`;
}

function buildSlotCheckoutEnvelopeSchema() {
	return buildMachineEnvelopeSchema(
		z.object({
			slotName: z.string(),
			branchName: z.string(),
			worktreePath: z.string(),
			cdDirectiveStatus: z.union([
				z.literal("inactive"),
				z.literal("written"),
				z.literal("failed"),
			]),
			cdDirectivePath: z.string().nullable(),
			cdDirectiveFailureDetail: z.string().nullable(),
		}),
	);
}

function boundaryFailure(
	errorType: string,
	message: string,
): { ok: false; failure: SlotCheckoutFailure } {
	return { ok: false, failure: { errorType, message } };
}
