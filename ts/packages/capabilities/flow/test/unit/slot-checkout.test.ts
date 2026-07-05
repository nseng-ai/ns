import type { SlotClient, SlotClientOptions } from "@nseng-ai/slot/api";
import { describe, expect, it, vi } from "vitest";

const slotClient: SlotClient = {
	checkoutCurrent: async () => ({
		ok: false,
		failure: { errorType: "not-implemented", message: "not used by this test" },
	}),
	checkoutBranch: async () => ({
		ok: false,
		failure: { errorType: "not-implemented", message: "not used by this test" },
	}),
};
const createSlotClient = vi.fn((options: SlotClientOptions) => {
	void options;
	return slotClient;
});

vi.mock("@nseng-ai/slot/api", () => ({
	createSlotClient,
}));
vi.resetModules();

const { createFlowSlotClient } = await import("../../src/autoslot/slot-checkout.ts");

describe("Flow slot checkout client", () => {
	it("enables parent-shell cd directives for CLI autoslot while suppressing clipboard writes", () => {
		const env = { PATH: "/fake/bin", NS_CD_DIRECTIVE_FILE: "/tmp/ns-cd" };

		createFlowSlotClient({ cwd: "/repo", env });

		expect(createSlotClient).toHaveBeenCalledWith({
			cwd: "/repo",
			env,
			sideEffects: { shouldCopyClipboard: false, shouldWriteCdDirective: true },
		});
	});
});
