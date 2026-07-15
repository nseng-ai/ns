import {
	createSlotClient,
	type SlotCheckoutFailure,
	type SlotCheckoutResult,
	type SlotClient,
} from "@nseng-ai/slots/api";

export type {
	SlotCheckoutFailure,
	SlotCheckoutResult,
	SlotCheckoutTarget,
	SlotClient,
} from "@nseng-ai/slots/api";

export type SlotCheckoutRef = { kind: "branch"; branchName: string } | { kind: "current" };

/**
 * Composition-root factory for the herdr capability's in-process slot
 * checkouts. Construction is centralized here so command handlers build one
 * client per invocation rather than scattering side-effect defaults across
 * leaf helpers.
 */
export function createHerdrSlotClient(options: {
	cwd: string;
	env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
}): SlotClient {
	return createSlotClient({
		cwd: options.cwd,
		...(options.env === undefined ? {} : { env: options.env }),
		sideEffects: { shouldCopyClipboard: false, shouldWriteCdDirective: false },
	});
}

export async function checkoutSlot(
	slotClient: SlotClient,
	ref: SlotCheckoutRef,
): Promise<SlotCheckoutResult> {
	return ref.kind === "branch"
		? await slotClient.checkoutBranch({ branchName: ref.branchName })
		: await slotClient.checkoutCurrent();
}

/** Format a structured slot-checkout failure for human-facing display. */
export function formatSlotCheckoutFailureCause(failure: SlotCheckoutFailure): string {
	return `Slot checkout failed (${failure.errorType}): ${failure.message}`;
}
