import { describe, expect, test } from "vitest";

import type { Caps } from "@nseng-ai/clinkr";
import { stripAnsi } from "@nseng-ai/clinkr/testing";
import type { NsProgress, NsProgressPhaseEvent } from "@nseng-ai/sdk";
import {
	applyPrLinksToRows,
	compactSubmitMetadataCellText,
	renderSubmitMatrixProgressFrame,
	resolveSubmitProgress,
	submitMatrixRowsFromTopology,
} from "../../src/submit/submit-matrix-progress.ts";
import {
	SUBMIT_CORE_PHASES,
	SUBMIT_PHASES,
	SUBMIT_PHASES_WITH_HOOKS,
	SUBMIT_PRE_HOOK_PHASES,
} from "../../src/phase-stream/phase-stream-specs.ts";
import { streamCapture } from "./stream-test-helpers.ts";

function recordingProgress(): { events: NsProgressPhaseEvent[]; progress: NsProgress } {
	const events: NsProgressPhaseEvent[] = [];
	return { events, progress: { isLive: true, phase: (event) => events.push(event) } };
}

function caps(parts: Partial<Caps> = {}): Caps {
	return {
		isTty: false,
		colorDepth: "none",
		columns: 96,
		canRenderUnicode: true,
		...parts,
	};
}

describe("submit progress resolution", () => {
	test("TTY-only owns raw output in the terminal controller", () => {
		const capture = streamCapture({ sleep: "pending" });
		const resolved = resolveSubmitProgress({
			caps: caps({ isTty: true }),
			deps: capture.deps,
			hasHooks: false,
		});
		resolved.matrix.setRows([{ branch: "feature/a", label: "feature/a", kind: "new" }]);
		resolved.onOutput?.("stdout", "raw transcript");

		expect(stripAnsi(capture.redraws.at(-1) ?? "")).toContain("raw transcript");
	});

	test("live-only sends raw output and structured events to their live channels", () => {
		const recording = recordingProgress();
		const raw: string[] = [];
		const resolved = resolveSubmitProgress({
			caps: caps(),
			deps: streamCapture().deps,
			liveProgress: recording.progress,
			liveOutput: (_stream, text) => raw.push(text),
			hasHooks: false,
		});
		resolved.matrix.phase({ type: "phase-started", phaseKey: "inventory" });
		resolved.onOutput?.("stdout", "raw transcript");

		expect(recording.events.map((event) => event.type)).toEqual([
			"phases-declared",
			"matrix-declared",
			"phase-started",
		]);
		expect(raw).toEqual(["raw transcript"]);
	});

	test("combined TTY and live fans out structure once without forwarding raw output", () => {
		const capture = streamCapture({ sleep: "pending" });
		const recording = recordingProgress();
		const raw: string[] = [];
		const resolved = resolveSubmitProgress({
			caps: caps({ isTty: true }),
			deps: capture.deps,
			liveProgress: recording.progress,
			liveOutput: (_stream, text) => raw.push(text),
			hasHooks: false,
		});
		resolved.matrix.setRows([{ branch: "feature/a", label: "feature/a", kind: "new" }]);
		resolved.matrix.phase({ type: "phase-started", phaseKey: "inventory" });
		resolved.matrix.setCell("feature/a", "metadata", { state: "active", text: "gen" });
		resolved.matrix.setActiveOperations([{ kind: "command", display: "gt submit" }]);
		resolved.onOutput?.("stdout", "raw transcript");

		const eventTypes = recording.events.map((event) => event.type);
		for (const type of [
			"phases-declared",
			"matrix-declared",
			"matrix-rows",
			"phase-started",
			"matrix-cell",
			"matrix-active-operations",
		] as const) {
			expect(eventTypes.filter((candidate) => candidate === type)).toHaveLength(1);
		}
		expect(raw).toEqual([]);
		const frame = stripAnsi(capture.redraws.at(-1) ?? "");
		expect(frame).toContain("gen");
		expect(frame).toContain("Running: gt submit");
		expect(frame).toContain("raw transcript");
	});

	test("neither TTY nor live resolves a settled transcript controller", async () => {
		const capture = streamCapture();
		const resolved = resolveSubmitProgress({
			caps: caps(),
			deps: capture.deps,
			hasHooks: false,
		});

		resolved.matrix.phase({ type: "phase-started", phaseKey: "inventory" });
		resolved.matrix.phase({ type: "phase-done", phaseKey: "inventory", detail: "one branch" });
		await resolved.matrix.finish();

		const transcript = stripAnsi(capture.writes.join(""));
		expect(transcript).toContain("ns flow submit");
		expect(transcript).toContain("stack inventoried");
		expect(transcript).not.toContain("Branch / PR");
	});
});

describe("submit matrix progress", () => {
	test("declares canonical submit phases and forwards each phase event once", () => {
		const recording = recordingProgress();
		const controller = resolveSubmitProgress({
			caps: caps(),
			deps: streamCapture().deps,
			liveProgress: recording.progress,
			hasHooks: true,
		}).matrix;

		controller.phase({ type: "phase-started", phaseKey: "inventory" });
		controller.phase({ type: "phase-done", phaseKey: "inventory", detail: "one branch" });

		const declaration = recording.events.find((event) => event.type === "phases-declared");
		expect(declaration?.type).toBe("phases-declared");
		if (declaration?.type !== "phases-declared") throw new Error("missing declaration");
		expect(declaration.phases.map((phase) => phase.key)).toEqual([
			"inventory",
			"hooks",
			"checkpoint",
			"preflight",
			"restack",
			"metadata",
			"submit",
			"verification",
			"descriptions",
		]);
		expect(
			declaration.phases
				.find((phase) => phase.key === "checkpoint")
				?.substeps?.map((phase) => phase.key),
		).toEqual(["inspect", "generate", "commit"]);
		expect(recording.events.filter((event) => event.type === "phase-started")).toEqual([
			{ type: "phase-started", phaseKey: "inventory" },
		]);
	});

	test("keeps grid declarations to columns and rows", () => {
		const recording = recordingProgress();
		const controller = resolveSubmitProgress({
			caps: caps(),
			deps: streamCapture().deps,
			liveProgress: recording.progress,
			hasHooks: false,
		}).matrix;
		controller.setRows([{ branch: "feature/a", label: "feature/a", kind: "new" }]);
		controller.setCell("feature/a", "metadata", { state: "done", text: "ready" });

		expect(recording.events.find((event) => event.type === "matrix-declared")).toEqual({
			type: "matrix-declared",
			columns: [
				{ key: "metadata", label: "Metadata", width: 8 },
				{ key: "description", label: "Description", width: 11 },
			],
			labelHeader: "Branch / PR",
		});
		expect(recording.events).toContainEqual({
			type: "matrix-cell",
			rowKey: "feature/a",
			columnKey: "metadata",
			state: "done",
			text: "ready",
		});
	});

	test("composes the optional hook at the named semantic boundary", () => {
		expect(SUBMIT_PRE_HOOK_PHASES.map((phase) => phase.key)).toEqual(["inventory"]);
		expect(SUBMIT_CORE_PHASES[0]?.key).toBe("checkpoint");
		expect(SUBMIT_PHASES.map((phase) => phase.key)).toEqual([
			...SUBMIT_PRE_HOOK_PHASES.map((phase) => phase.key),
			...SUBMIT_CORE_PHASES.map((phase) => phase.key),
		]);
		expect(SUBMIT_PHASES_WITH_HOOKS.map((phase) => phase.key)).toEqual([
			...SUBMIT_PRE_HOOK_PHASES.map((phase) => phase.key),
			"hooks",
			...SUBMIT_CORE_PHASES.map((phase) => phase.key),
		]);
	});

	test("renders row cells without matrix-owned global phase state", () => {
		const lines = renderSubmitMatrixProgressFrame({
			caps: caps(),
			title: "ns flow submit",
			rows: [
				{
					branch: "feature/a",
					label: "feature/a",
					kind: "new",
					cells: { metadata: { state: "done", text: "ready" }, description: { state: "pending" } },
				},
			],
		});
		expect(lines.join("\n")).toContain("feature/a");
		expect(lines.join("\n")).toContain("ready");
	});

	test("applies PR links only when unmatched links align with new rows", () => {
		const rows = [
			{
				branch: "existing",
				label: "existing (#1)",
				kind: "existing" as const,
				pr: { label: "#1", url: "https://github.com/o/r/pull/1" },
			},
			{ branch: "new", label: "new", kind: "new" as const },
		];
		expect(
			applyPrLinksToRows(rows, [{ label: "#2", url: "https://github.com/o/r/pull/2" }]),
		).toEqual([
			{
				branch: "new",
				label: "new (#2)",
				pr: { label: "#2", url: "https://github.com/o/r/pull/2" },
			},
		]);
	});

	test("compact metadata labels and topology rows remain stable", () => {
		expect(compactSubmitMetadataCellText("metadata-prepared")).toBe("ready");
		expect(
			submitMatrixRowsFromTopology({
				currentBranch: "feature/a",
				branches: [{ branch: "feature/a", parentBranch: "main", kind: "new" }],
			}),
		).toEqual([{ branch: "feature/a", label: "feature/a", kind: "new" }]);
	});
});
