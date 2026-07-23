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

type SlotCheckoutDirectiveResult =
	| {
			cdDirectiveStatus: "inactive";
			cdDirectivePath: string | null;
			cdDirectiveFailureDetail: null;
	  }
	| {
			cdDirectiveStatus: "written";
			cdDirectivePath: string;
			cdDirectiveFailureDetail: null;
	  }
	| {
			cdDirectiveStatus: "failed";
			cdDirectivePath: string;
			cdDirectiveFailureDetail: string;
	  };

type SlotCheckoutCommandResult =
	| ({ ok: true; target: SlotCheckoutTarget } & SlotCheckoutDirectiveResult)
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
			const { slotName, branchName, worktreePath } = envelope.data;
			const target = { slotName, branchName, worktreePath };
			switch (envelope.data.cdDirectiveStatus) {
				case "inactive":
					return {
						ok: true,
						target,
						cdDirectiveStatus: "inactive",
						cdDirectivePath: envelope.data.cdDirectivePath,
						cdDirectiveFailureDetail: null,
					};
				case "written":
					return {
						ok: true,
						target,
						cdDirectiveStatus: "written",
						cdDirectivePath: envelope.data.cdDirectivePath,
						cdDirectiveFailureDetail: null,
					};
				case "failed":
					return {
						ok: true,
						target,
						cdDirectiveStatus: "failed",
						cdDirectivePath: envelope.data.cdDirectivePath,
						cdDirectiveFailureDetail: envelope.data.cdDirectiveFailureDetail,
					};
			}
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

	return {
		ok: true,
		target: checkout.target,
		warnings: [
			{
				type: "cd-directive-write-failed",
				message: `Slot checkout succeeded, but the parent-shell navigation directive could not be written to ${checkout.cdDirectivePath}: ${checkout.cdDirectiveFailureDetail}`,
			},
		],
	};
}

export function formatSlotCheckoutFailureCause(failure: SlotCheckoutFailure): string {
	return `Slot checkout failed (${failure.errorType}): ${failure.message}`;
}

function buildSlotCheckoutEnvelopeSchema() {
	const targetSchema = z.object({
		slotName: z.string(),
		branchName: z.string(),
		worktreePath: z.string(),
	});
	const directiveSchema = z.discriminatedUnion("cdDirectiveStatus", [
		z.object({
			cdDirectiveStatus: z.literal("inactive"),
			cdDirectivePath: z.string().nullable(),
			cdDirectiveFailureDetail: z.null(),
		}),
		z.object({
			cdDirectiveStatus: z.literal("written"),
			cdDirectivePath: z.string(),
			cdDirectiveFailureDetail: z.null(),
		}),
		z.object({
			cdDirectiveStatus: z.literal("failed"),
			cdDirectivePath: z.string(),
			cdDirectiveFailureDetail: z.string(),
		}),
	]);
	return buildMachineEnvelopeSchema(targetSchema.and(directiveSchema));
}

function boundaryFailure(
	errorType: string,
	message: string,
): { ok: false; failure: SlotCheckoutFailure } {
	return { ok: false, failure: { errorType, message } };
}
