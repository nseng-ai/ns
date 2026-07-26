import { describe, test } from "vitest";

import { expectPiSurfaceParity } from "@nseng-ai/pi-runtime/parity/testing";
import prFeedbackWatchExtension, {
	prFeedbackWatchParity,
} from "../../src/pr-feedback-watch/extension.ts";

describe("PR feedback watch Pi extension parity metadata", () => {
	test("registered command surfaces match package metadata", async () => {
		await expectPiSurfaceParity(prFeedbackWatchExtension, prFeedbackWatchParity);
	});
});
