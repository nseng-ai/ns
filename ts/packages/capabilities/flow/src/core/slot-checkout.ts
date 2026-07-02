import {
	createSlotClient,
	type SlotCheckoutFailure,
	type SlotCheckoutResult,
	type SlotClient,
} from "@sdl/slot/api";

export type {
	SlotCheckoutFailure,
	SlotCheckoutResult,
	SlotCheckoutTarget,
	SlotClient,
} from "@sdl/slot/api";

export type SlotCheckoutRef = { kind: "branch"; branchName: string } | { kind: "current" };

/**
 * Composition-root factory for Flow's in-process slot checkouts. Construction is
 * centralized here so command handlers (the composition roots) build one client
 * per invocation instead of scattering the side-effect defaults across leaf
 * helpers.
 */
export function createFlowSlotClient(options: {
	cwd: string;
	env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
}): SlotClient {
	return createSlotClient({
		cwd: options.cwd,
		...(options.env === undefined ? {} : { env: options.env }),
		// Autoslot is a CLI navigation command: honor the active SDL shell wrapper's cd directive
		// while avoiding an extra clipboard write beyond the explicit success guidance.
		sideEffects: { shouldCopyClipboard: false, shouldWriteCdDirective: true },
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
