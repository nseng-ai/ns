import { describe, expect, it } from "vitest";
import { z } from "zod";

import { activationCompletedSchema } from "../src/init/activation-outcomes.ts";
import { initNsResultSchema } from "../src/init/init-ns.ts";
import { installExtensionResultSchema } from "../src/init/install-extension.ts";
import { lifecycleStepSchema } from "../src/init/lifecycle-observability.ts";
import { uninstallExtensionResultSchema } from "../src/init/uninstall-extension.ts";
import { updateExtensionResultSchema } from "../src/init/update-extension.ts";

describe("activation completion schema", () => {
	it("is shared by command results and remains JSON-schema compatible", () => {
		expect(initNsResultSchema.shape.completed).toBe(activationCompletedSchema);
		for (const schema of [
			installExtensionResultSchema,
			updateExtensionResultSchema,
			uninstallExtensionResultSchema,
		]) {
			expect(schema.options[0]?.shape.completed).toBe(activationCompletedSchema);
			expect(schema.options[0]?.shape.steps.unwrap().element).toBe(lifecycleStepSchema);
		}
		for (const schema of [
			initNsResultSchema,
			installExtensionResultSchema,
			updateExtensionResultSchema,
			uninstallExtensionResultSchema,
		]) {
			expect(() => z.toJSONSchema(schema, { io: "output" })).not.toThrow();
		}
	});

	it("omits unattempted file and consumer-directory outcomes", () => {
		const completed = activationCompletedSchema.parse({
			files: { "agents-instructions": { change: "created" } },
		});
		expect(completed).toEqual({ files: { "agents-instructions": { change: "created" } } });
		expect("ns-toml" in completed.files).toBe(false);
		expect(completed).not.toHaveProperty("consumerDirectories");
	});
});
