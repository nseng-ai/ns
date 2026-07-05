import { describe, test } from "vitest";

import { expectPiSurfaceParity } from "@nseng-ai/pi/parity/testing";
import {
	prPreviewsExtensionParity,
	registerPrPreviewsExtension,
} from "../../src/pr-previews/extension.ts";

describe("PR previews Pi extension parity metadata", () => {
	test("registered command surfaces match package metadata", async () => {
		await expectPiSurfaceParity(registerPrPreviewsExtension, prPreviewsExtensionParity);
	});
});
