import { describe, expect, it } from "vitest";

import {
	createNodeReleaseReportStore,
	type ReleaseReportFileHandle,
	type ReleaseReportFileOperations,
} from "../src/release/system.ts";
import { buildReleaseReport } from "./release-transaction-builders.ts";

class RecordingReportFileOperations implements ReleaseReportFileOperations {
	readonly operations: string[] = [];
	readonly #failure: "file-sync" | "directory-sync" | undefined;

	constructor(failure?: "file-sync" | "directory-sync") {
		this.#failure = failure;
	}

	async mkdirp(): Promise<void> {
		this.operations.push("mkdir");
	}

	async open(_path: string, flags: "r" | "wx"): Promise<ReleaseReportFileHandle> {
		const role = flags === "wx" ? "temp" : "directory";
		this.operations.push(`open:${role}`);
		return {
			writeFile: async () => {
				this.operations.push(`write:${role}`);
			},
			sync: async () => {
				this.operations.push(`sync:${role}`);
				if (
					(this.#failure === "file-sync" && role === "temp") ||
					(this.#failure === "directory-sync" && role === "directory")
				) {
					throw new Error(`${role} sync failed`);
				}
			},
			close: async () => {
				this.operations.push(`close:${role}`);
			},
		};
	}

	async rename(): Promise<void> {
		this.operations.push("rename");
	}

	async remove(): Promise<void> {
		this.operations.push("cleanup");
	}
}

const report = buildReleaseReport({
	version: "1.2.3",
	branch: "release/1.2.3",
	commit: "release-commit",
	inventory: [],
	candidates: [],
});

describe("durable release report store", () => {
	it("syncs and closes the temp file before rename, then syncs the parent directory", async () => {
		const files = new RecordingReportFileOperations();
		const result = await createNodeReleaseReportStore(files).writeAtomic(
			"/reports/report.json",
			report,
		);

		expect(result).toEqual({ ok: true, value: undefined });
		expect(files.operations).toEqual([
			"mkdir",
			"open:temp",
			"write:temp",
			"sync:temp",
			"close:temp",
			"rename",
			"open:directory",
			"sync:directory",
			"close:directory",
		]);
	});

	it("closes and cleans up without renaming when temp-file sync fails", async () => {
		const files = new RecordingReportFileOperations("file-sync");
		const result = await createNodeReleaseReportStore(files).writeAtomic(
			"/reports/report.json",
			report,
		);

		expect(result).toMatchObject({
			ok: false,
			error: { code: "report-write-failed", message: "temp sync failed" },
		});
		expect(files.operations).toEqual([
			"mkdir",
			"open:temp",
			"write:temp",
			"sync:temp",
			"close:temp",
			"cleanup",
		]);
	});

	it("returns failure when parent-directory sync fails after rename", async () => {
		const files = new RecordingReportFileOperations("directory-sync");
		const result = await createNodeReleaseReportStore(files).writeAtomic(
			"/reports/report.json",
			report,
		);

		expect(result).toMatchObject({
			ok: false,
			error: { code: "report-write-failed", message: "directory sync failed" },
		});
		expect(files.operations).toEqual([
			"mkdir",
			"open:temp",
			"write:temp",
			"sync:temp",
			"close:temp",
			"rename",
			"open:directory",
			"sync:directory",
			"close:directory",
			"cleanup",
		]);
	});
});
