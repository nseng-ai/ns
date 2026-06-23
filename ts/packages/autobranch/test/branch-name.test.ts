import { describe, expect, test } from "vitest";
import { findAvailableBranchName } from "@sdl/autobranch/branch-name";
import { fail, ok, type CommandResult } from "./autobranch-test-helpers.ts";

interface BranchAvailabilityHarnessOptions {
	existingBranches?: ReadonlySet<string>;
	invalidBranches?: ReadonlySet<string>;
	childRefs?: readonly string[];
}

function createBranchAvailabilityHarness(options: BranchAvailabilityHarnessOptions = {}) {
	const calls: Array<{ command: string; args: string[] }> = [];
	const existingBranches = options.existingBranches ?? new Set<string>();
	const invalidBranches = options.invalidBranches ?? new Set<string>();
	const childRefs = options.childRefs ?? [];

	return {
		calls,
		input: {
			cwd: "/repo",
			exec: async (command: string, args: string[]): Promise<CommandResult> => {
				calls.push({ command, args });
				if (command === "git" && args[0] === "check-ref-format") {
					const branchName = args.at(-1) ?? "";
					return invalidBranches.has(branchName) ? fail("invalid ref") : ok();
				}
				if (command === "git" && args[0] === "show-ref") {
					const branchName = (args.at(-1) ?? "").replace(/^refs\/heads\//, "");
					return existingBranches.has(branchName) ? ok() : fail("missing ref");
				}
				if (command === "git" && args[0] === "for-each-ref") {
					const prefix = args.at(-1) ?? "";
					return ok(childRefs.filter((ref) => ref.startsWith(prefix)).join("\n"));
				}
				return ok();
			},
		},
	};
}

function candidate(name: string, hasSuffix = false): { name: string; hasSuffix: boolean } {
	return { name, hasSuffix };
}

describe("findAvailableBranchName", () => {
	test("returns the first exact branch name that has no existing ref", async () => {
		const harness = createBranchAvailabilityHarness();

		const result = await findAvailableBranchName(harness.input, [candidate("feature/new")]);

		expect(result).toEqual({ ok: true, name: "feature/new", hasSuffix: false });
		expect(harness.calls.map((call) => [call.command, ...call.args].join(" "))).toEqual([
			"git check-ref-format --branch feature/new",
			"git show-ref --verify --quiet refs/heads/feature/new",
			"git show-ref --verify --quiet refs/heads/feature",
			"git for-each-ref --format=%(refname) refs/heads/feature/new/",
		]);
	});

	test("skips exact existing branch refs", async () => {
		const harness = createBranchAvailabilityHarness({
			existingBranches: new Set(["feature/new"]),
		});

		const result = await findAvailableBranchName(harness.input, [
			candidate("feature/new"),
			candidate("feature/new-2", true),
		]);

		expect(result).toEqual({ ok: true, name: "feature/new-2", hasSuffix: true });
	});

	test("skips candidates blocked by an existing parent ref", async () => {
		const harness = createBranchAvailabilityHarness({
			existingBranches: new Set(["autobranch-backup"]),
		});

		const result = await findAvailableBranchName(harness.input, [
			candidate("autobranch-backup/feature/source/123456789"),
			candidate("autobranch-backup-2/feature/source/123456789", true),
		]);

		expect(result).toEqual({
			ok: true,
			name: "autobranch-backup-2/feature/source/123456789",
			hasSuffix: true,
		});
	});

	test("skips candidates blocked by an existing child ref", async () => {
		const harness = createBranchAvailabilityHarness({
			childRefs: ["refs/heads/feature/source/child"],
		});

		const result = await findAvailableBranchName(harness.input, [
			candidate("feature/source"),
			candidate("feature/source-2", true),
		]);

		expect(result).toEqual({ ok: true, name: "feature/source-2", hasSuffix: true });
	});

	test("skips invalid candidates", async () => {
		const harness = createBranchAvailabilityHarness({
			invalidBranches: new Set(["invalid"]),
		});

		const result = await findAvailableBranchName(harness.input, [
			candidate("invalid"),
			candidate("valid", true),
		]);

		expect(result).toEqual({ ok: true, name: "valid", hasSuffix: true });
	});
});
