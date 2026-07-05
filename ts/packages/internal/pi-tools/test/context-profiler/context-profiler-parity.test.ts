import { describe, test } from "vitest";

import { expectPiSurfaceParity } from "@nseng-ai/pi/parity/testing";
import {
	contextProfilerParity,
	registerContextProfilerExtension,
} from "../../src/context-profiler/extension.ts";

describe("context-profiler Pi extension parity metadata", () => {
	test("registered command surface matches package metadata", async () => {
		await expectPiSurfaceParity(registerContextProfilerExtension, contextProfilerParity);
	});
});
