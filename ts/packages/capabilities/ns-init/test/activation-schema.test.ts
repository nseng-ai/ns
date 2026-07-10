import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
	activationCompletedSchema,
	declaredArtifactActivationOutcomeSchema,
} from "../src/activate-ns.ts";
import { initNsResultSchema } from "../src/init-ns.ts";
import { installExtensionResultSchema } from "../src/install-extension.ts";

describe("activation completion schema", () => {
	it("is the shared command-result schema and remains JSON-schema compatible", () => {
		expect(initNsResultSchema.shape.completed).toBe(activationCompletedSchema);
		expect(installExtensionResultSchema.shape.completed).toBe(activationCompletedSchema);

		expect(() => z.toJSONSchema(initNsResultSchema, { io: "output" })).not.toThrow();
		expect(() => z.toJSONSchema(installExtensionResultSchema, { io: "output" })).not.toThrow();
	});

	it("omits absent optional completion and artifact keys", () => {
		expect(activationCompletedSchema.parse({ nsToml: undefined })).toEqual({});

		expect(
			declaredArtifactActivationOutcomeSchema.parse({
				key: "pi:demo",
				action: "unchanged",
				artifactId: "@test/demo:demo",
				skillName: "demo",
				harness: "pi",
				targetArtifactPath: "/repo/.pi/skills/demo",
				manifestPath: "/repo/.pi/skills/.ns-harness-artifacts-manifest.json",
				writtenFiles: [],
				conflictingFiles: [],
				removedFiles: undefined,
				removalReason: undefined,
			}),
		).toEqual({
			key: "pi:demo",
			action: "unchanged",
			artifactId: "@test/demo:demo",
			skillName: "demo",
			harness: "pi",
			targetArtifactPath: "/repo/.pi/skills/demo",
			manifestPath: "/repo/.pi/skills/.ns-harness-artifacts-manifest.json",
			writtenFiles: [],
			conflictingFiles: [],
		});
	});
});
