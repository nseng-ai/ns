import { writeFile } from "node:fs/promises";

import { buildMachineEnvelopeSchema } from "@nseng-ai/clinkr";
import type { ExecResult } from "@nseng-ai/foundation/command";
import { z } from "zod";

const SLOT_CHECKOUT_TIMEOUT_MS = 120_000;
const SLOT_CD_DIRECTIVE_FILE = "SLOT_CD_DIRECTIVE_FILE";
const NS_CD_DIRECTIVE_FILE = "NS_CD_DIRECTIVE_FILE";

const slotCheckoutTargetSchema = z.object({
	slotName: z.string(),
	branchName: z.string(),
	worktreePath: z.string(),
});
const slotCheckoutEnvelopeSchema = buildMachineEnvelopeSchema(slotCheckoutTargetSchema);

export type SlotCheckoutRef = { kind: "branch"; branchName: string } | { kind: "current" };
export type SlotCheckoutTarget = z.infer<typeof slotCheckoutTargetSchema>;

export interface SlotCheckoutFailure {
	errorType: string;
	message: string;
}

export type SlotCheckoutNavigationWarning = {
	type: "cd-directive-write-failed";
	message: string;
};

type SlotCheckoutCommandResult =
	| { ok: true; target: SlotCheckoutTarget }
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

export interface AutoslotDirectiveFilesystem {
	writeText(path: string, content: string): Promise<void>;
}

export type AutoslotDirectiveWriteResult =
	| { status: "inactive" }
	| { status: "written"; path: string }
	| { status: "failed"; path: string; error: string };

export interface AutoslotDirectiveWriter {
	write(destination: string): Promise<AutoslotDirectiveWriteResult>;
}

export function buildSlotCheckoutArgs(ref: SlotCheckoutRef): string[] {
	return [
		"slot",
		"checkout",
		...(ref.kind === "current" ? ["--current"] : [ref.branchName]),
		"--no-clipboard",
		"--no-cd-directive",
		"--format",
		"json",
	];
}

export function createAutoslotDirectiveWriter(options: {
	env: Readonly<Record<string, string | undefined>>;
	filesystem: AutoslotDirectiveFilesystem;
}): AutoslotDirectiveWriter {
	return {
		async write(destination) {
			const path = activeDirectivePath(options.env);
			if (path === null) return { status: "inactive" };
			try {
				await options.filesystem.writeText(path, destination);
				return { status: "written", path };
			} catch (error) {
				return { status: "failed", path, error: errorMessage(error) };
			}
		},
	};
}

export function createRealAutoslotDirectiveWriter(options: {
	env: Readonly<Record<string, string | undefined>>;
}): AutoslotDirectiveWriter {
	return createAutoslotDirectiveWriter({
		env: options.env,
		filesystem: {
			async writeText(path, content) {
				await writeFile(path, content, "utf8");
			},
		},
	});
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
	const envelopeResult = slotCheckoutEnvelopeSchema.safeParse(json);
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
		case "ok":
			return { ok: true, target: envelope.data };
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
	directiveWriter: AutoslotDirectiveWriter,
	ref: SlotCheckoutRef,
): Promise<SlotCheckoutResult> {
	const result = await exec("ns", buildSlotCheckoutArgs(ref), SLOT_CHECKOUT_TIMEOUT_MS);
	const checkout = parseSlotCheckoutResult(result);
	if (!checkout.ok) return checkout;

	const directive = await directiveWriter.write(checkout.target.worktreePath);
	if (directive.status !== "failed") return { ...checkout, warnings: [] };
	return {
		...checkout,
		warnings: [
			{
				type: "cd-directive-write-failed",
				message: `Slot checkout succeeded, but the parent-shell navigation directive could not be written to ${directive.path}: ${directive.error}`,
			},
		],
	};
}

export function formatSlotCheckoutFailureCause(failure: SlotCheckoutFailure): string {
	return `Slot checkout failed (${failure.errorType}): ${failure.message}`;
}

function activeDirectivePath(env: Readonly<Record<string, string | undefined>>): string | null {
	const path = env[SLOT_CD_DIRECTIVE_FILE] ?? env[NS_CD_DIRECTIVE_FILE];
	if (path === undefined || path === "") return null;
	return path;
}

function boundaryFailure(errorType: string, message: string): SlotCheckoutResult {
	return { ok: false, failure: { errorType, message } };
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
