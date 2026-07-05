import { describe, expect, test } from "vitest";

import { createDeferred, ScriptedQueue } from "@nseng-ai/foundation/test-kit";

describe("test kit helpers", () => {
	test("createDeferred exposes a resolvable promise", async () => {
		const deferred = createDeferred<string>();
		deferred.resolve("done");
		await expect(deferred.promise).resolves.toBe("done");
	});

	test("ScriptedQueue consumes scripted steps", () => {
		const queue = new ScriptedQueue(["a", "b"], (value) => value);
		expect(queue.shiftOrRecordError("missing")).toBe("a");
		expect(queue.shiftOrRecordError("missing")).toBe("b");
		queue.assertDone();
	});
});
