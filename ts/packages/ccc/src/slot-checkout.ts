import type { SlotCheckoutResult, SlotCheckoutTarget, SlotClient } from "@sdl/slot/api";

export type { SlotCheckoutTarget, SlotClient } from "@sdl/slot/api";

export type SlotCheckoutRef = { kind: "branch"; branchName: string } | { kind: "current" };

export type CheckoutSlotResult =
	| { ok: true; target: SlotCheckoutTarget }
	| { ok: false; error: string };

export async function checkoutSlot(
	slotClient: SlotClient,
	ref: SlotCheckoutRef,
): Promise<CheckoutSlotResult> {
	const result = await runPeerCheckout(slotClient, ref);
	if (!result.ok) {
		return {
			ok: false,
			error: formatPeerCheckoutFailure(result.failure),
		};
	}
	return { ok: true, target: result.target };
}

async function runPeerCheckout(
	slotClient: SlotClient,
	ref: SlotCheckoutRef,
): Promise<SlotCheckoutResult> {
	return ref.kind === "branch"
		? await slotClient.checkoutBranch({ branchName: ref.branchName })
		: await slotClient.checkoutCurrent();
}

function formatPeerCheckoutFailure(failure: { errorType: string; message: string }): string {
	return `Slot checkout failed (${failure.errorType}): ${failure.message}`;
}
