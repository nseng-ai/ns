import { stripAnsi } from "@nseng-ai/clinkr/testing";
import { describe, expect, test } from "vitest";

import type { NsProgressPhaseEvent } from "@nseng-ai/sdk";

import { createStackSquashMatrixProgressController } from "../../src/stack-squash/stack-squash-matrix-progress.ts";
import { streamCapture } from "./stream-test-helpers.ts";

describe("stack squash matrix progress", () => {
	test("shows the full commit-count plan before branch squash progress", async () => {
		const capture = streamCapture();
		const controller = createStackSquashMatrixProgressController({
			caps: {
				isTty: true,
				colorDepth: "none",
				columns: 100,
				canRenderUnicode: true,
			},
			deps: capture.deps,
		});

		controller.setPlan([
			{ branch: "feature/top", parent: "feature/bottom", commitsBefore: 4 },
			{ branch: "feature/bottom", parent: "feature/empty", commitsBefore: 1 },
			{ branch: "feature/empty", parent: "main", commitsBefore: 0 },
		]);

		const planFrame = stripAnsi(capture.redraws.at(-1) ?? "");
		expect(planFrame).toContain("Commits");
		expect(planFrame).toContain("Squash");
		expect(planFrame).toContain("feature/top");
		expect(planFrame).toContain("4");
		expect(planFrame).toContain("feature/bottom");
		expect(planFrame).toContain("no-op");
		expect(planFrame).toContain("feature/empty");
		expect(planFrame).toContain("empty");

		controller.note("Preparing stack");
		expect(stripAnsi(capture.redraws.at(-1) ?? "")).toContain("Preparing stack");

		controller.setSquashStatus("feature/top", { state: "active", text: "4→1" });
		expect(stripAnsi(capture.redraws.at(-1) ?? "")).toContain("4→1");

		controller.setSquashStatus("feature/top", { state: "done", text: "4→1" });
		controller.restoreStarted();
		controller.restoreCompleted();
		await controller.finish();
		await controller.stop();

		const settled = stripAnsi(capture.redraws.at(-1) ?? "");
		expect(settled).toContain("tip restored");
		expect(settled).toContain("4→1");
	});

	test("declares inventory and restore as ordered phases and forwards their lifecycle", async () => {
		const capture = streamCapture();
		const events: NsProgressPhaseEvent[] = [];
		const controller = createStackSquashMatrixProgressController({
			caps: {
				isTty: true,
				colorDepth: "none",
				columns: 100,
				canRenderUnicode: true,
			},
			deps: capture.deps,
			forward: { isLive: true, phase: (event) => events.push(event) },
		});

		controller.setPlan([{ branch: "feature/top", parent: "main", commitsBefore: 2 }]);
		controller.restoreStarted();
		controller.restoreCompleted();
		await controller.finish();

		expect(events[0]).toMatchObject({
			type: "phases-declared",
			phases: [
				{ key: "inventory", name: "Plan" },
				{ key: "restore", name: "Restore" },
			],
		});
		expect(events).toContainEqual({
			type: "phase-done",
			phaseKey: "inventory",
			detail: "1 branch planned",
		});
		expect(events).toContainEqual({
			type: "phase-started",
			phaseKey: "restore",
			label: "checking out tip",
		});
		expect(events).toContainEqual({
			type: "phase-done",
			phaseKey: "restore",
			detail: "tip restored",
		});
	});
});
