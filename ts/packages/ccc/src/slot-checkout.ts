import {
	createSlotClient,
	type SlotClient,
	type SlotCheckoutResult,
	type SlotCheckoutTarget,
} from "@sdl/slot/api";

export type { SlotClient } from "@sdl/slot/api";

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

export interface SlotCheckoutInput {
	cwd: string;
	env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
	slotClient?: SlotClient;
}

export async function checkoutSlot(
	input: SlotCheckoutInput,
	ref: SlotCheckoutRef,
): Promise<CccSlotCheckoutResult> {
	const result = await runPeerCheckout(input, ref);
	if (!result.ok) {
		return {
			ok: false,
			error: formatPeerCheckoutFailure(ref, result.failure),
		};
	}
	return { ok: true, target: mapPeerTarget(result.target) };
}

async function runPeerCheckout(
	input: SlotCheckoutInput,
	ref: SlotCheckoutRef,
): Promise<SlotCheckoutResult> {
	const slotClient =
		input.slotClient ??
		createSlotClient({
			cwd: input.cwd,
			...(input.env === undefined ? {} : { env: input.env }),
		});
	return ref.kind === "branch"
		? await slotClient.checkoutBranch({ branchName: ref.branchName })
		: await slotClient.checkoutCurrent();
}

function mapPeerTarget(target: SlotCheckoutTarget): CccSlotCheckoutTarget {
	return {
		slotName: target.slotName,
		branchName: target.branchName,
		worktreePath: target.worktreePath,
		cdCommand: target.cdCommand,
	};
}

function formatPeerCheckoutFailure(
	ref: SlotCheckoutRef,
	failure: { errorType: string; message: string },
): string {
	return `${checkoutCommandName(ref)} failed (${failure.errorType}): ${failure.message}`;
}

function checkoutCommandName(ref: SlotCheckoutRef): string {
	return ref.kind === "branch" ? "sdl slot checkout" : "sdl slot checkout --current";
}
