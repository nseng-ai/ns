import { describe, expect, it } from "vitest";

import { buildFlowSlotClientOptions } from "../../src/autoslot/slot-checkout.ts";

describe("Flow slot checkout client", () => {
	it("enables parent-shell cd directives for CLI autoslot while suppressing clipboard writes", () => {
		const env = { PATH: "/fake/bin", NS_CD_DIRECTIVE_FILE: "/tmp/ns-cd" };

		const options = buildFlowSlotClientOptions({ cwd: "/repo", env });

		expect(options).toEqual({
			cwd: "/repo",
			env,
			sideEffects: { shouldCopyClipboard: false, shouldWriteCdDirective: true },
		});
	});
});
