import { checkoutBranchSlot, checkoutCurrentSlot } from "@sdl/slot/api";

export interface CccSlotCheckoutTarget {
	slotName: string;
	branchName: string;
	worktreePath: string;
	cdCommand: string;
}

export type SlotCheckoutRef = { kind: "branch"; branchName: string } | { kind: "current" };

export type CccSlotCheckoutResult =
	| { ok: true; target: CccSlotCheckoutTarget }
	| { ok: false; error: string };

export type SlotCheckoutFunction = (
	input: SlotCheckoutInput,
	ref: SlotCheckoutRef,
) => Promise<CccSlotCheckoutResult>;

export interface SlotCheckoutInput {
	cwd: string;
	env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
	checkoutSlot?: SlotCheckoutFunction;
}

export async function checkoutSlot(
	input: SlotCheckoutInput,
	ref: SlotCheckoutRef,
): Promise<CccSlotCheckoutResult> {
	if (input.checkoutSlot !== undefined) {
		return await input.checkoutSlot(input, ref);
	}
	const options = {
		cwd: input.cwd,
		...(input.env === undefined ? {} : { env: input.env }),
	};
	const result =
		ref.kind === "branch"
			? await checkoutBranchSlot({ ...options, branchName: ref.branchName })
			: await checkoutCurrentSlot(options);
	if (!result.ok) {
		return {
			ok: false,
			error: formatPeerCheckoutFailure(ref, result.failure),
		};
	}
	return {
		ok: true,
		target: {
			slotName: result.target.slotName,
			branchName: result.target.branchName,
			worktreePath: result.target.worktreePath,
			cdCommand: result.target.cdCommand,
		},
	};
}

function formatPeerCheckoutFailure(
	ref: SlotCheckoutRef,
	failure: { errorType: string; message: string },
): string {
	return `${slotCheckoutCommandName(ref)} failed (${failure.errorType}): ${failure.message}`;
}

function slotCheckoutCommandName(ref: SlotCheckoutRef): string {
	return ref.kind === "branch" ? "slot checkout" : "slot checkout --current";
}
