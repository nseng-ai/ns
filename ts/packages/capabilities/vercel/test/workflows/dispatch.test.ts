import { describe, expect, it } from "vitest";

import { dispatchWorkflowId } from "../../workflows/dispatch-id.ts";
import {
	checkHarnessCompletion,
	createSandboxAndLaunchHarness,
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
			createSandboxAndLaunchHarness.name,
			checkHarnessCompletion.name,
			readHarnessResult.name,
			pushAnchorBranch.name,
			stopSandbox.name,
			updateAnchorPrLanded.name,
			updateAnchorPrFailed.name,
			failDispatchRun.name,
		]).toEqual([
			"createSandboxAndLaunchHarness",
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
		expect(createSandboxAndLaunchHarness.maxRetries).toBe(0);
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
		).rejects.toThrow("dispatch failed: invalid-input");
	});

	it("throws only the stable failure code from the terminal step", async () => {
		await expect(failDispatchRun("harness-failed")).rejects.toThrow(
			"dispatch failed: harness-failed",
		);
	});
});
