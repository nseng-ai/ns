import { describe, expect, it } from "vitest";

import { triggerSuccessResponseSchema, triggerWorkflowValues } from "../../src/http/wire.ts";
import type { TriggerWorkflowName } from "../../src/trigger/contracts.ts";

describe("trigger workflow wire identity", () => {
	it("derives the response schema and trigger type from one literal tuple", () => {
		const typedValues: readonly TriggerWorkflowName[] = triggerWorkflowValues;

		expect(triggerSuccessResponseSchema.shape.workflow.options).toEqual(typedValues);
	});
});
