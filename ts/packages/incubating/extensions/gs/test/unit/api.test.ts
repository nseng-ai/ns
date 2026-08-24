import { describe, expect, it } from "vitest";

import {
	GS_PACKAGE_NAME,
	GS_RESTACK_RESOLVE_COMMAND,
	gsRestackResolveEnvelopeSchema,
} from "../../src/api/index.ts";

describe("gs package scaffold", () => {
	it("exports its package identity", () => {
		expect(GS_PACKAGE_NAME).toBe("@nseng-ai/gs");
	});

	it("exports the stable restack-resolve command descriptor and strict envelope", () => {
		expect(GS_RESTACK_RESOLVE_COMMAND).toMatchObject({
			piSurface: "ns:gs:restack-resolve",
			skillName: "ns-gs-restack-resolve",
			argvPrefix: ["gs", "restack-resolve"],
		});
		expect(
			gsRestackResolveEnvelopeSchema.safeParse({ status: "success", exitCode: 0, data: {} })
				.success,
		).toBe(false);
	});
});
