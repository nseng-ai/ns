import { describe, expect, it } from "vitest";

import { dispatchWorkflowId } from "../../workflows/dispatch-id.ts";
import {
	checkHarnessCompletion,
	createDispatchSandbox,
	prepareAndLaunchHarness,
	dispatchWorkflow,
	failDispatchRun,
	pushAnchorBranch,
	readHarnessResult,
	stopSandbox,
	updateAnchorPrFailed,
	updateAnchorPrLanded,
} from "../../workflows/dispatch.ts";

describe("dispatchWorkflow", () => {
	it("derives its metadata id from the unchanged workflow export", () => {
		expect(dispatchWorkflowId).toBe(`workflow//./workflows/dispatch//${dispatchWorkflow.name}`);
	});

	it("exposes operator-oriented step names", () => {
		expect([
			createDispatchSandbox.name,
			prepareAndLaunchHarness.name,
			checkHarnessCompletion.name,
			readHarnessResult.name,
			pushAnchorBranch.name,
			stopSandbox.name,
			updateAnchorPrLanded.name,
			updateAnchorPrFailed.name,
			failDispatchRun.name,
		]).toEqual([
			"createDispatchSandbox",
			"prepareAndLaunchHarness",
			"checkHarnessCompletion",
			"readHarnessResult",
			"pushAnchorBranch",
			"stopSandbox",
			"updateAnchorPrLanded",
			"updateAnchorPrFailed",
			"failDispatchRun",
		]);
	});

	it("caps launch and terminal failure at a single attempt", () => {
		expect(createDispatchSandbox.maxRetries).toBe(0);
		expect(prepareAndLaunchHarness.maxRetries).toBe(0);
		expect(failDispatchRun.maxRetries).toBe(0);
	});

	it("turns invalid input into a safe fatal terminal failure", async () => {
		await expect(
			dispatchWorkflow({
				revision: "main",
				anchorBranch: "dispatch/widget",
				anchorPrNumber: 421,
				prompt: "plaintext prompt must not appear in the error",
			}),
		).rejects.toThrow("revision must be a 40-character commit SHA. Code: invalid-input.");
	});

	it("throws an actionable bounded terminal diagnostic", async () => {
		await expect(
			failDispatchRun({
				ok: false,
				code: "launch-failed",
				message: "Sandbox creation failed.",
				anchorPrNumber: 3612,
				failureReported: true,
				diagnostic: {
					operation: "create_sandbox",
					reason: "vercel-sandbox-api-error",
					httpStatus: 403,
					message: "Status code 403 is not ok.",
				},
			}),
		).rejects.toThrow(
			"Sandbox creation failed. Status code 403 is not ok. Code: launch-failed. Operation: create_sandbox. HTTP status: 403. Anchor PR: #3612.",
		);
	});
});
