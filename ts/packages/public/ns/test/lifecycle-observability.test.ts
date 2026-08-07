import { describe, expect, it } from "vitest";

import {
	createLifecycleRecorder,
	lifecycleStepSchema,
} from "../src/init/lifecycle-observability.ts";

describe("lifecycle recorder", () => {
	it("owns phase transitions and preserves their exact ordering", () => {
		const recorder = createLifecycleRecorder();

		recorder.beginPhase("repository-preflight");
		recorder.record({ type: "repository-resolved", repoRoot: "/repo", trunkBranch: "main" });
		recorder.beginPhase("configuration-preflight");
		recorder.skipPhase("declaration-planning");
		recorder.beginPhase("activation-preflight");
		recorder.complete();

		expect(recorder.steps()).toEqual([
			{ type: "phase", phase: "repository-preflight", status: "started" },
			{ type: "repository-resolved", repoRoot: "/repo", trunkBranch: "main" },
			{ type: "phase", phase: "repository-preflight", status: "completed" },
			{ type: "phase", phase: "configuration-preflight", status: "started" },
			{ type: "phase", phase: "configuration-preflight", status: "completed" },
			{ type: "phase", phase: "declaration-planning", status: "skipped" },
			{ type: "phase", phase: "activation-preflight", status: "started" },
			{ type: "phase", phase: "activation-preflight", status: "completed" },
			{ type: "phase", phase: "completion", status: "completed" },
		]);
	});

	it("fails the active phase before recording its diagnostic and becomes terminal", () => {
		const recorder = createLifecycleRecorder();
		recorder.beginPhase("acquisition");
		recorder.fail({ code: "fetch-failed", message: "Could not fetch.", path: "ns.toml" });

		expect(recorder.steps()).toEqual([
			{ type: "phase", phase: "acquisition", status: "started" },
			{ type: "phase", phase: "acquisition", status: "failed" },
			{
				type: "failure",
				phase: "acquisition",
				code: "fetch-failed",
				message: "Could not fetch.",
				path: "ns.toml",
			},
		]);
		expect(() => recorder.beginPhase("activation-preflight")).toThrow(/terminal/);
		expect(() => recorder.complete()).toThrow(/terminal/);
	});

	it("normalizes failure diagnostic codes before storing and rendering them", () => {
		const lines: string[] = [];
		const recorder = createLifecycleRecorder({ emit: (line) => lines.push(line) });

		recorder.beginPhase("declaration-planning");
		recorder.fail({
			code: "extension_acquisition_invalid_npm_spec",
			message: "Invalid npm extension source spec.",
		});

		expect(recorder.steps().at(-1)).toMatchObject({
			type: "failure",
			code: "extension-acquisition-invalid-npm-spec",
		});
		expect(lines.at(-1)).toContain("extension-acquisition-invalid-npm-spec");
		expect(lines.at(-1)).not.toContain("extension_acquisition_invalid_npm_spec");
	});

	it("enforces phase ownership while permitting details between phases", () => {
		const recorder = createLifecycleRecorder();

		recorder.record({ type: "effect", effect: "dry-run-no-writes" });
		expect(() => recorder.endPhase()).toThrow(/active phase/);
		expect(() => recorder.fail({ code: "failed", message: "Failed." })).toThrow(/active phase/);

		recorder.beginPhase("activation-apply");
		expect(() => recorder.beginPhase("activation-apply")).toThrow(/already active/);
		expect(() => recorder.skipPhase("activation-apply")).toThrow(/Cannot skip active/);
		recorder.endPhase();
		recorder.record({ type: "effect", effect: "prospective-effects-available" });

		expect(recorder.steps()).toEqual([
			{ type: "effect", effect: "dry-run-no-writes" },
			{ type: "phase", phase: "activation-apply", status: "started" },
			{ type: "phase", phase: "activation-apply", status: "completed" },
			{ type: "effect", effect: "prospective-effects-available" },
		]);
	});

	it("does not validate ingestion but leaves validation at the boundary schema", () => {
		const recorder = createLifecycleRecorder();
		const invalidDetail = {
			type: "activation-planned",
			descriptorCount: -1,
			fileCount: 0,
			consumerDirectoryCount: 0,
		} as const;

		recorder.beginPhase("activation-preflight");
		recorder.record(invalidDetail);
		expect(recorder.steps()[1]).toEqual(invalidDetail);
		expect(() => lifecycleStepSchema.parse(invalidDetail)).toThrow();
	});
});
