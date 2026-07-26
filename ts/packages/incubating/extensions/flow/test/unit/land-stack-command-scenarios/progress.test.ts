import type { Caps } from "@nseng-ai/clinkr";
import type { NsExtensionApi, NsProgress, NsProgressPhaseEvent } from "@nseng-ai/sdk";
import { noopNsCommandIo } from "@nseng-ai/sdk";
import { describe, expect, test } from "vitest";
import { formatLandProgressTitle } from "../../../src/land/land-matrix-progress.ts";
import {
	createLandCliProgress,
	createLandMatrixEventForwarder,
} from "../../../src/ns/commands/land.ts";
import { LAND_PHASES } from "../../../src/phase-stream/phase-stream-specs.ts";

import { linearStackLandingScript } from "./linear-stack-fixtures.ts";
import { numberedBranch } from "./repo-fixtures.ts";
import { runLandStack } from "./support.ts";
describe("flow land live progress", () => {
	test("formats merged target PR counter without implying cleanup has finished", () => {
		expect(formatLandProgressTitle({ landedPrs: 8, totalPrs: 11 })).toBe(
			"ns flow land — 8/11 target PRs merged",
		);
		expect(formatLandProgressTitle({ landedPrs: 1 })).toBe("ns flow land — 1 target PR merged");
		expect(formatLandProgressTitle({ landedPrs: 2 })).toBe("ns flow land — 2 target PRs merged");
	});

	test("uses settled merge wording scoped to target PRs", () => {
		expect(LAND_PHASES.find((spec) => spec.key === "merge")?.item.detail).toBe("target PRs merged");
	});
});

describe("flow land matrix progress forwarding", () => {
	function nonTtyCaps(): Caps {
		return { isTty: false, colorDepth: "none", columns: 80, canRenderUnicode: true };
	}

	function recordingProgress(isLive: boolean): {
		events: NsProgressPhaseEvent[];
		sink: NsProgress;
	} {
		const events: NsProgressPhaseEvent[] = [];
		return { events, sink: { isLive, phase: (event) => events.push(event) } };
	}

	function extensionApi(progress: NsProgress): NsExtensionApi {
		return {
			cwd: "/work",
			env: {},
			commandIo: noopNsCommandIo,
			progress,
			renderCapabilities: { canEmitAnsi: false },
			hasExtension: () => false,
			exec: async () => ({ code: 0, stdout: "", stderr: "", type: "exited", signal: null }),
			textGenerator: { generateText: async () => ({ ok: true, text: "" }) },
		};
	}

	test("live non-TTY progress forwards matrix rows and cells alongside phase events", async () => {
		const progress = recordingProgress(true);
		const cli = createLandCliProgress(extensionApi(progress.sink), nonTtyCaps());

		cli.io.phase("preflighting stack");
		expect(cli.landMatrix).toBeDefined();
		cli.landMatrix?.setRows([
			{ branch: "feature-a", prNumber: 1, label: "feature-a (#1)" },
			{ branch: "feature-b", prNumber: 2, label: "feature-b (#2)" },
		]);
		cli.landMatrix?.setCell("feature-a", "merge", { state: "active" });
		cli.landMatrix?.setAllOtherCells("gate", "feature-a", { state: "skipped" });
		cli.landMatrix?.recordMergedPr(1);
		await cli.stop();

		expect(progress.events.map((event) => event.type)).toEqual([
			"phases-declared",
			"phase-started",
			"matrix-declared",
			"matrix-rows",
			"matrix-cell",
			"matrix-cell",
		]);
		expect(progress.events).toContainEqual({
			type: "matrix-rows",
			rows: [
				{ rowKey: "feature-a", label: "feature-a (#1)" },
				{ rowKey: "feature-b", label: "feature-b (#2)" },
			],
		});
		expect(progress.events).toContainEqual({
			type: "matrix-cell",
			rowKey: "feature-a",
			columnKey: "merge",
			state: "active",
		});
		expect(progress.events).toContainEqual({
			type: "matrix-cell",
			rowKey: "feature-b",
			columnKey: "gate",
			state: "skipped",
		});
	});

	test("non-live progress exposes no matrix sink and forwards nothing", async () => {
		const progress = recordingProgress(false);
		const cli = createLandCliProgress(extensionApi(progress.sink), nonTtyCaps());

		expect(cli.landMatrix).toBeUndefined();
		cli.io.phase("preflighting stack");
		await cli.stop();

		expect(progress.events).toEqual([]);
	});

	test("landing a stack drives per-branch matrix cells through the forwarder", async () => {
		const progress = recordingProgress(true);
		const { pi, notifications } = await runLandStack("--yes", linearStackLandingScript(11), {
			executeOptions: {
				observabilityChannels: { landMatrix: createLandMatrixEventForwarder(progress.sink) },
			},
		});

		pi.assertDone();
		expect(notifications.at(-1)?.level).toBe("success");

		const declared = progress.events.filter((event) => event.type === "matrix-declared");
		expect(declared).toHaveLength(1);
		expect(
			progress.events.flatMap((event) =>
				event.type === "matrix-declared" ? event.columns.map((column) => column.key) : [],
			),
		).toEqual(["gate", "merge", "verify", "restack"]);

		const rowSets = progress.events.flatMap((event) =>
			event.type === "matrix-rows" ? [event.rows] : [],
		);
		expect(rowSets.at(-1)?.map((row) => row.rowKey)).toEqual(
			Array.from({ length: 11 }, (_, index) => numberedBranch(index + 1)),
		);

		const mergedRows = new Set(
			progress.events.flatMap((event) =>
				event.type === "matrix-cell" && event.columnKey === "merge" && event.state === "done"
					? [event.rowKey]
					: [],
			),
		);
		for (let index = 1; index <= 11; index += 1) {
			expect(mergedRows.has(numberedBranch(index))).toBe(true);
		}
	});
});
