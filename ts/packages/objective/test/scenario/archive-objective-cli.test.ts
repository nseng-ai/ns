import { InMemoryGitGateway } from "@asdl/core/git/testing";
import { describe, expect, test } from "vitest";

import { FakeObjectiveStorageGateway } from "../../src/fake-storage.ts";
import { ObjectiveStorage, type ObjectiveStorageGateway } from "../../src/storage.ts";
import { parseJsonOutput, runScenario } from "../support/run-scenario.ts";

import type { ObjectiveCliContext } from "../../src/context.ts";

function contextFor(gateway: ObjectiveStorageGateway): ObjectiveCliContext {
	return {
		cwd: "/repo",
		env: { PATH: "/fake/bin" },
		repoRoot: "/repo",
		trunkBranch: "master",
		storage: new ObjectiveStorage(gateway),
		git: new InMemoryGitGateway(),
	};
}

function archiveData(options: {
	status: string;
	error: string | null;
	slug: string | null;
	direction: "archive" | "unarchive";
	sourcePath: string;
	destinationPath: string;
	hasSource: boolean;
	hasDestination: boolean;
	hasMoved: boolean;
}) {
	return {
		status: options.status,
		error: options.error,
		slug: options.slug,
		direction: options.direction,
		source_path: options.sourcePath,
		destination_path: options.destinationPath,
		source_exists: options.hasSource,
		destination_exists: options.hasDestination,
		moved: options.hasMoved,
	};
}

describe("objective archive", () => {
	test("help exposes archive command and unarchive flag", async () => {
		const topLevel = runScenario(["--help"]);
		expect(await topLevel.exit).toBe(0);
		expect(topLevel.stdout.join("")).toContain("archive");
		expect(topLevel.stdout.join("")).toContain("Archive or unarchive an Objective record");

		const help = runScenario(["archive", "--help"]);
		expect(await help.exit).toBe(0);
		const output = help.stdout.join("");
		expect(output).toContain("Usage: objective archive");
		expect(output).toContain("Archive or unarchive an Objective record by moving its directory.");
		expect(output).toContain("[slug]");
		expect(output).toContain("--unarchive");
	});

	test("archives active record with stable JSON and filesystem move", async () => {
		const fake = new FakeObjectiveStorageGateway({ records: [{ slug: "alpha" }] });
		const run = runScenario(["archive", "alpha", "--format", "json"], { context: contextFor(fake) });

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toEqual({
			exit_code: 0,
			data: archiveData({
				status: "archived",
				error: null,
				slug: "alpha",
				direction: "archive",
				sourcePath: ".asdl/objectives/alpha",
				destinationPath: ".asdl/objective-archive/alpha",
				hasSource: false,
				hasDestination: true,
				hasMoved: true,
			}),
		});
		await expect(fake.pathKind(".asdl/objectives/alpha")).resolves.toEqual({ ok: true, value: "missing" });
		await expect(fake.pathKind(".asdl/objective-archive/alpha")).resolves.toEqual({ ok: true, value: "directory" });
		await expect(fake.readTextFile(".asdl/objective-archive/alpha/objective.md")).resolves.toEqual({ type: "ok", content: "# alpha\n" });
	});

	test("human success output starts with archived sentence and moved paths", async () => {
		const run = runScenario(["archive", "alpha"], { fake: { records: [{ slug: "alpha" }] } });

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("Archived Objective `alpha`.\n\nMoved:\n  .asdl/objectives/alpha\n  -> .asdl/objective-archive/alpha\n");
		expect(run.stderr).toEqual([]);
	});

	test("unarchives archived record with stable JSON and filesystem move", async () => {
		const fake = new FakeObjectiveStorageGateway({ files: { ".asdl/objective-archive/alpha/objective.md": "# alpha\n" } });
		const run = runScenario(["archive", "alpha", "--unarchive", "--format", "json"], { context: contextFor(fake) });

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toEqual({
			exit_code: 0,
			data: archiveData({
				status: "unarchived",
				error: null,
				slug: "alpha",
				direction: "unarchive",
				sourcePath: ".asdl/objective-archive/alpha",
				destinationPath: ".asdl/objectives/alpha",
				hasSource: false,
				hasDestination: true,
				hasMoved: true,
			}),
		});
		await expect(fake.pathKind(".asdl/objective-archive/alpha")).resolves.toEqual({ ok: true, value: "missing" });
		await expect(fake.pathKind(".asdl/objectives/alpha")).resolves.toEqual({ ok: true, value: "directory" });
	});

	test("human unarchive output starts with unarchived sentence and moved paths", async () => {
		const run = runScenario(["archive", "alpha", "--unarchive"], {
			fake: { files: { ".asdl/objective-archive/alpha/objective.md": "# alpha\n" } },
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("Unarchived Objective `alpha`.\n\nMoved:\n  .asdl/objective-archive/alpha\n  -> .asdl/objectives/alpha\n");
		expect(run.stderr).toEqual([]);
	});

	test("missing active source returns negative JSON without creating destination", async () => {
		const fake = new FakeObjectiveStorageGateway();
		const run = runScenario(["archive", "ghost", "--format", "json"], { context: contextFor(fake) });

		expect(await run.exit).toBe(1);
		expect(parseJsonOutput(run)).toEqual({
			exit_code: 1,
			message: "No active Objective record found for slug 'ghost' at .asdl/objectives/ghost.",
			data: archiveData({
				status: "source_not_found",
				error: "source_not_found",
				slug: "ghost",
				direction: "archive",
				sourcePath: ".asdl/objectives/ghost",
				destinationPath: ".asdl/objective-archive/ghost",
				hasSource: false,
				hasDestination: false,
				hasMoved: false,
			}),
		});
		await expect(fake.pathKind(".asdl/objective-archive/ghost")).resolves.toEqual({ ok: true, value: "missing" });
	});

	test("destination collision fails without mutation", async () => {
		const fake = new FakeObjectiveStorageGateway({
			records: [{ slug: "alpha" }],
			files: {
				".asdl/objectives/alpha/objective.md": "active sentinel\n",
				".asdl/objective-archive/alpha/objective.md": "archived sentinel\n",
			},
		});
		const run = runScenario(["archive", "alpha", "--format", "json"], { context: contextFor(fake) });

		expect(await run.exit).toBe(1);
		expect(parseJsonOutput(run)).toEqual({
			exit_code: 1,
			message: "Destination already exists for slug 'alpha': .asdl/objective-archive/alpha. Refusing to merge or overwrite.",
			data: archiveData({
				status: "destination_exists",
				error: "destination_exists",
				slug: "alpha",
				direction: "archive",
				sourcePath: ".asdl/objectives/alpha",
				destinationPath: ".asdl/objective-archive/alpha",
				hasSource: true,
				hasDestination: true,
				hasMoved: false,
			}),
		});
		await expect(fake.readTextFile(".asdl/objectives/alpha/objective.md")).resolves.toEqual({ type: "ok", content: "active sentinel\n" });
		await expect(fake.readTextFile(".asdl/objective-archive/alpha/objective.md")).resolves.toEqual({ type: "ok", content: "archived sentinel\n" });
	});

	test("invalid and missing slugs return stable negative envelopes", async () => {
		const invalid = runScenario(["archive", "foo/bar", "--format", "json"], { fake: { records: [{ slug: "alpha" }] } });
		expect(await invalid.exit).toBe(1);
		expect(parseJsonOutput(invalid)).toEqual({
			exit_code: 1,
			message: "Invalid Objective slug 'foo/bar'. Pass a single slug, not a path.",
			data: archiveData({
				status: "invalid_slug",
				error: "invalid_slug",
				slug: null,
				direction: "archive",
				sourcePath: ".asdl/objectives",
				destinationPath: ".asdl/objective-archive",
				hasSource: false,
				hasDestination: false,
				hasMoved: false,
			}),
		});

		const missing = runScenario(["archive", "--format", "json"]);
		expect(await missing.exit).toBe(1);
		expect(missing.stderr.join("")).not.toContain("Usage:");
		expect(parseJsonOutput(missing)).toEqual({
			exit_code: 1,
			message: "Missing Objective slug. Pass an explicit slug.",
			data: archiveData({
				status: "missing_slug",
				error: "missing_slug",
				slug: null,
				direction: "archive",
				sourcePath: ".asdl/objectives",
				destinationPath: ".asdl/objective-archive",
				hasSource: false,
				hasDestination: false,
				hasMoved: false,
			}),
		});
	});

	test("non-directory source is refused", async () => {
		const run = runScenario(["archive", "alpha", "--format", "json"], {
			fake: { files: { ".asdl/objectives/alpha": "not a directory\n" } },
		});

		expect(await run.exit).toBe(1);
		expect(parseJsonOutput(run)).toEqual({
			exit_code: 1,
			message: "Objective source path for slug 'alpha' is not a directory: .asdl/objectives/alpha.",
			data: archiveData({
				status: "source_not_directory",
				error: "source_not_directory",
				slug: "alpha",
				direction: "archive",
				sourcePath: ".asdl/objectives/alpha",
				destinationPath: ".asdl/objective-archive/alpha",
				hasSource: true,
				hasDestination: false,
				hasMoved: false,
			}),
		});
	});

	test("archived records are excluded from active list after fake move", async () => {
		const fake = new FakeObjectiveStorageGateway({ records: [{ slug: "alpha" }, { slug: "bravo" }] });
		const context = contextFor(fake);
		const archive = runScenario(["archive", "alpha", "--format", "json"], { context });
		expect(await archive.exit).toBe(0);

		const list = runScenario(["list", "--minimal", "--format", "json", "--status", "all"], { context });
		expect(await list.exit).toBe(0);
		expect(parseJsonOutput(list)).toEqual({
			exit_code: 0,
			data: {
				trunk_branch: "master",
				root_path: ".asdl/objectives",
				status_filter: "all",
				names_only: false,
				records: [{ slug: "bravo", status: "open", latest_update_iso: null }],
			},
		});
	});
});
