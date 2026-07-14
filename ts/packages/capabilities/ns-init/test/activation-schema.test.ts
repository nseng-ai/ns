import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
	activationCompletedSchema,
	declaredArtifactActivationOutcomeSchema,
} from "../src/activate-ns.ts";
import { initNsResultSchema } from "../src/init-ns.ts";
import { installExtensionResultSchema } from "../src/install-extension.ts";
import { lifecycleStepSchema } from "../src/lifecycle-observability.ts";
import { uninstallExtensionResultSchema } from "../src/uninstall-extension.ts";
import { updateExtensionResultSchema } from "../src/update-extension.ts";

describe("activation completion schema", () => {
	it("is the shared command-result schema and remains JSON-schema compatible", () => {
		expect(initNsResultSchema.shape.completed).toBe(activationCompletedSchema);
		expect(installExtensionResultSchema.shape.completed).toBe(activationCompletedSchema);
		expect(updateExtensionResultSchema.shape.completed).toBe(activationCompletedSchema);
		expect(uninstallExtensionResultSchema.shape.completed).toBe(activationCompletedSchema);
		for (const schema of [
			initNsResultSchema,
			installExtensionResultSchema,
			updateExtensionResultSchema,
			uninstallExtensionResultSchema,
		]) {
			expect(schema.shape.steps.unwrap().element).toBe(lifecycleStepSchema);
			expect(() => z.toJSONSchema(schema, { io: "output" })).not.toThrow();
		}
	});

	it("omits unattempted file outcomes and absent artifact keys", () => {
		const completed = activationCompletedSchema.parse({
			files: { "agents-instructions": { change: "created" } },
		});
		expect(completed).toEqual({ files: { "agents-instructions": { change: "created" } } });
		expect("ns-toml" in completed.files).toBe(false);

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
