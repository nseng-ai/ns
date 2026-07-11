import { describe, expect, test } from "vitest";

import type { Caps } from "@nseng-ai/clinkr";
import { stripAnsi } from "@nseng-ai/clinkr/testing";
import { createManualClock } from "@nseng-ai/foundation/time/testing";
import type { ActiveOperation } from "@nseng-ai/kernel/sdk";
import {
	commandOperations,
	createMatrixProgressController,
	matrixFrameOptionalFields,
	type MatrixGlobalRowSpec,
	type MatrixProgressController,
	modelOperation,
	withActiveOperations,
	withCommandOperations,
} from "../../src/phase-stream/matrix-progress-core.ts";
import { streamCapture } from "./stream-test-helpers.ts";

type TestColumnKey = "metadata";
type TestGlobalKey = "hooks" | "checkpoint";

function caps(parts: Partial<Caps> = {}): Caps {
	return {
		isTty: true,
		colorDepth: "none",
		columns: 96,
		canRenderUnicode: true,
		...parts,
	};
}

const TEST_COLUMNS = [{ key: "metadata" as const, label: "Metadata", width: 8 }];

const TEST_GLOBAL_ROWS: readonly MatrixGlobalRowSpec<TestGlobalKey>[] = [
	{
		key: "hooks",
		label: "Hooks",
		detail: "hooks complete",
		activeLabel: "running pre-submit hooks…",
	},
	{
		key: "checkpoint",
		label: "Checkpoint",
		detail: "checkpoint complete",
		activeLabel: "checkpointing pending changes…",
		substeps: [
			{
				key: "inspect",
				label: "Inspect",
				detail: "worktree inspected",
				activeLabel: "inspecting worktree…",
			},
		],
	},
];

function createController(options: { capsParts?: Partial<Caps>; clockNowMs?: number }): {
	controller: MatrixProgressController<TestColumnKey, TestGlobalKey>;
	capture: ReturnType<typeof streamCapture>;
	clock: ReturnType<typeof createManualClock>;
} {
	const capture = streamCapture({ sleep: "pending" });
	const clock = createManualClock(options.clockNowMs ?? 0);
	const controller = createMatrixProgressController<TestColumnKey, TestGlobalKey>({
		caps: caps(options.capsParts ?? {}),
		deps: capture.deps,
		title: "ns flow submit",
		rows: [{ rowKey: "feature/a", label: "feature/a" }],
		columns: TEST_COLUMNS,
		globalRows: TEST_GLOBAL_ROWS,
		phases: [],
		clock: clock.clock,
	});
	return { controller, capture, clock };
}

function lastFrame(capture: ReturnType<typeof streamCapture>): string {
	return stripAnsi(capture.redraws.at(-1) ?? "");
}

function frameLine(frame: string, needle: string): string {
	const line = frame.split("\n").find((item) => item.includes(needle));
	if (line === undefined) throw new Error(`missing frame line containing ${needle}`);
	return line;
}

describe("matrix progress core", () => {
	test("projects only defined optional frame fields from a wider runtime object", () => {
		const widerInput = {
			activeOperations: [{ kind: "command" as const, display: "just" }],
			tailLine: "tests passing",
			tailSinceOutputMs: 125,
			tick: 3,
			rows: ["unkeyed row"],
			title: "must not pass through",
			isSentinel: true,
		};

		expect(matrixFrameOptionalFields(widerInput)).toEqual({
			activeOperations: [{ kind: "command", display: "just" }],
			tailLine: "tests passing",
			tailSinceOutputMs: 125,
			tick: 3,
		});
		const omitted = matrixFrameOptionalFields({});
		expect(Object.hasOwn(omitted, "activeOperations")).toBe(false);
		expect(Object.hasOwn(omitted, "tailLine")).toBe(false);
		expect(Object.hasOwn(omitted, "tailSinceOutputMs")).toBe(false);
		expect(Object.hasOwn(omitted, "tick")).toBe(false);
	});

	test("constructs model operations without an undefined detail", () => {
		expect(modelOperation("generating metadata", "openai/gpt-test")).toEqual({
			kind: "model",
			operation: "generating metadata",
			modelRef: "openai/gpt-test",
		});
		expect(modelOperation("generating metadata", "openai/gpt-test", "branch 1/2")).toEqual({
			kind: "model",
			operation: "generating metadata",
			modelRef: "openai/gpt-test",
			detail: "branch 1/2",
		});
	});

	test("clears command operations when the wrapped work rejects", async () => {
		const operations: string[][] = [];
		const sink = {
			setActiveOperations: (active: readonly ActiveOperation[]) => {
				operations.push(
					active.map((operation) =>
						operation.kind === "command" ? operation.display : operation.operation,
					),
				);
			},
		};

		await expect(
			withCommandOperations(sink, ["gt submit --dry-run"], async () => {
				throw new Error("submit failed");
			}),
		).rejects.toThrow("submit failed");
		expect(operations).toEqual([["gt submit --dry-run"], []]);
	});

	test("clears arbitrary active operations when the wrapped work rejects", async () => {
		const snapshots: ActiveOperation[][] = [];
		const operation = modelOperation("generating PR description", "openai/gpt-test");

		await expect(
			withActiveOperations(
				(operations) => snapshots.push([...operations]),
				[operation],
				async () => {
					throw new Error("generation failed");
				},
			),
		).rejects.toThrow("generation failed");
		expect(snapshots).toEqual([[operation], []]);
	});

	test("renders active operations on a dedicated line while rows keep their own labels", () => {
		const { controller, capture } = createController({});

		controller.setGlobal("hooks", { state: "active", text: "running just…" });
		controller.setActiveOperations(commandOperations(["just"]));
		let frame = lastFrame(capture);
		expect(frameLine(frame, "Hooks")).toContain("running just…");
		expect(frameLine(frame, "Running:")).toBe("Running: just");

		controller.setGlobal("hooks", { state: "done", text: "hooks complete" });
		controller.setGlobal("checkpoint", { state: "active" });
		controller.setGlobalSubstep("checkpoint", "inspect", {
			state: "active",
			text: "inspecting worktree…",
		});
		controller.setActiveOperations(commandOperations(["git status --porcelain"]));
		frame = lastFrame(capture);
		// Active rows keep their own labels; the operation stays on the dedicated line.
		expect(frameLine(frame, "Inspect")).toContain("inspecting worktree…");
		expect(frameLine(frame, "Inspect")).not.toContain("git status --porcelain");
		expect(frameLine(frame, "Running:")).toBe("Running: git status --porcelain");

		controller.setActiveOperations([]);
		frame = lastFrame(capture);
		// Without an operation the slot stays reserved but blank.
		expect(frame).not.toContain("Running:");
		expect(frameLine(frame, "Inspect")).toContain("inspecting worktree…");
	});

	test("reserves a blank tail slot and counts quiet time since the last output line", () => {
		const { controller, capture, clock } = createController({ clockNowMs: 1_000 });

		controller.setGlobal("hooks", { state: "active" });
		expect(lastFrame(capture).split("\n").at(-1)).toBe("");

		controller.note("✓ shell-cli.test.ts (3 tests)\n");
		expect(lastFrame(capture).split("\n").at(-1)).toBe("       ✓ shell-cli.test.ts (3 tests)");

		clock.advanceMs(14_000);
		controller.setGlobal("hooks", { state: "active", text: "still running" });
		expect(lastFrame(capture).split("\n").at(-1)).toBe(
			"       ✓ shell-cli.test.ts (3 tests) · 14s ago",
		);

		controller.note("✓ kernel.test.ts (9 tests)\n");
		const tailLine = lastFrame(capture).split("\n").at(-1);
		expect(tailLine).toContain("✓ kernel.test.ts (9 tests)");
		expect(tailLine).not.toContain("ago");
	});

	test("settled frames drop the operations and tail slots", async () => {
		const { controller, capture } = createController({ capsParts: { isTty: false } });

		controller.setGlobal("hooks", { state: "active" });
		controller.setActiveOperations(commandOperations(["just"]));
		await controller.finish();

		const settled = stripAnsi(capture.writes.join(""));
		expect(settled).toContain("hooks complete");
		expect(settled).not.toContain("Running:");
		expect(settled.trimEnd().split("\n").at(-1)).toContain("feature/a");
	});
});
