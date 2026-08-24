import { describe, expect, test } from "vitest";

import {
	gsRestackRequestSchema,
	gsRestackResultSchema,
	renderGsRestackHuman,
	runGsRestackResolve,
} from "../../src/core/restack-command.ts";
import {
	InMemoryGsRestackGitGateway,
	InMemoryGsStackProviderGateway,
	type InMemoryRestackOptions,
} from "../../src/core/testing/in-memory-restack-gateways.ts";

const topology = {
	trunk: "main",
	currentBranch: "b",
	branches: [
		{ name: "a", base: "root", needsRebase: false, isCurrent: false },
		{ name: "b", base: "old-a", needsRebase: false, isCurrent: true },
		{ name: "c", base: "old-b", needsRebase: false, isCurrent: false },
	],
};
const clean = state({ branch: "b", clean: true });

describe("GS restack-resolve workflow", () => {
	test("dry-runs full and downstack scopes without provider mutation", async () => {
		for (const downstack of [false, true]) {
			const options = fixture();
			const provider = new InMemoryGsStackProviderGateway(options);
			const result = await runGsRestackResolve(
				{ provider, git: new InMemoryGsRestackGitGateway(options) },
				noninteractive(),
				{ downstack, dryRun: true, yes: false },
			);
			expect(result).toMatchObject({
				status: "success",
				data: {
					outcome: "dry-run",
					selectedBranches: downstack ? ["a", "b"] : ["b", "c"],
					baseAnchor: downstack ? "main" : "a",
				},
			});
			expect(provider.operations).toEqual(["read-version", "read-topology"]);
		}
	});

	test("requires --yes noninteractively and advances exactly once with it", async () => {
		const options = fixture();
		const refusedProvider = new InMemoryGsStackProviderGateway(options);
		const refused = await runGsRestackResolve(
			{ provider: refusedProvider, git: new InMemoryGsRestackGitGateway(options) },
			noninteractive(),
			{ downstack: false, dryRun: false, yes: false },
		);
		expect(refused).toMatchObject({ status: "usage-error", data: { requiredOption: "--yes" } });
		expect(refusedProvider.operations).not.toContain("start-full");

		const provider = new InMemoryGsStackProviderGateway(options);
		const completed = await runGsRestackResolve(
			{ provider, git: new InMemoryGsRestackGitGateway(options) },
			noninteractive(),
			{ downstack: false, dryRun: false, yes: true },
		);
		expect(completed).toMatchObject({ status: "success", data: { outcome: "completed" } });
		expect(provider.operations.filter((operation) => operation === "start-full")).toHaveLength(1);
	});

	test("selects continuation from Git state and rejects unresolved, unstaged, and downstack states", async () => {
		const unresolved = fixture({
			gitState: state({
				branch: null,
				operation: "rebase",
				clean: false,
				unmergedPaths: ["file.txt"],
			}),
		});
		await expect(
			run(unresolved, { downstack: false, dryRun: false, yes: true }),
		).resolves.toMatchObject({
			status: "negative",
			data: { outcome: "conflict-stopped", mode: "continue" },
		});
		const unstaged = fixture({
			gitState: state({ branch: null, operation: "rebase", clean: false }),
		});
		await expect(
			run(unstaged, { downstack: false, dryRun: false, yes: true }),
		).resolves.toMatchObject({ status: "negative" });
		const ready = fixture({
			gitState: state({ branch: null, operation: "rebase", clean: false, hasStagedChanges: true }),
		});
		await expect(run(ready, { downstack: true, dryRun: false, yes: true })).resolves.toMatchObject({
			status: "usage-error",
		});
	});

	test("prompts interactively, honors decline, and advances after acceptance", async () => {
		const declinedOptions = fixture();
		const declinedProvider = new InMemoryGsStackProviderGateway(declinedOptions);
		let declinedPrompts = 0;
		const declined = await runGsRestackResolve(
			{ provider: declinedProvider, git: new InMemoryGsRestackGitGateway(declinedOptions) },
			{
				interactive: true,
				confirm: async () => {
					declinedPrompts += 1;
					return false;
				},
			},
			{ downstack: false, dryRun: false, yes: false },
		);
		expect(declined).toMatchObject({ status: "negative", data: { outcome: "refused" } });
		expect(declinedPrompts).toBe(1);
		expect(declinedProvider.operations).not.toContain("start-full");

		const acceptedOptions = fixture();
		const acceptedProvider = new InMemoryGsStackProviderGateway(acceptedOptions);
		let acceptedPrompts = 0;
		const accepted = await runGsRestackResolve(
			{ provider: acceptedProvider, git: new InMemoryGsRestackGitGateway(acceptedOptions) },
			{
				interactive: true,
				confirm: async () => {
					acceptedPrompts += 1;
					return true;
				},
			},
			{ downstack: false, dryRun: false, yes: false },
		);
		expect(accepted).toMatchObject({ status: "success", data: { outcome: "completed" } });
		expect(acceptedPrompts).toBe(1);
		expect(acceptedProvider.operations).toContain("start-full");
	});

	test("refuses unsupported states, invalid topology membership, and occupied branches", async () => {
		await expect(run(fixture({ version: "0.2.0" }), request())).resolves.toMatchObject({
			status: "negative",
			data: { outcome: "refused", providerVersion: "0.2.0" },
		});
		await expect(
			run(fixture({ gitState: state({ branch: "b", clean: false }) }), request()),
		).resolves.toMatchObject({ status: "negative", data: { outcome: "refused" } });
		await expect(
			run(
				fixture({
					gitState: { ...clean, operation: "merge" },
				}),
				request(),
			),
		).resolves.toMatchObject({ status: "negative", data: { git: { operation: "merge" } } });
		await expect(
			run(fixture({ gitState: state({ branch: "outside", clean: true }) }), request()),
		).resolves.toMatchObject({ status: "negative", data: { outcome: "refused" } });
		await expect(
			run(fixture({ occupancies: [{ branch: "c", path: "/other" }] }), request()),
		).resolves.toMatchObject({
			status: "negative",
			data: { occupiedBranches: [{ branch: "c", path: "/other" }] },
		});
		await expect(run(fixture({ topologyFailure: diagnostic() }), request())).resolves.toMatchObject(
			{ status: "failure", errorType: "restack-inspection-failed" },
		);
	});

	test("requires fresh provider topology after continuation without inventing its range", async () => {
		const options = fixture({
			gitState: state({ branch: null, operation: "rebase", clean: false, hasStagedChanges: true }),
			afterGitState: clean,
			afterTopologyFailure: diagnostic(),
		});
		const result = await run(options, request());
		expect(result).toMatchObject({
			status: "failure",
			errorType: "restack-outcome-ambiguous",
			data: {
				outcome: "ambiguous",
				selectedBranches: null,
				baseAnchor: null,
				postconditions: expect.arrayContaining([
					{ name: "fresh-provider-topology", passed: false },
				]),
			},
		});
	});

	test("classifies unchanged provider rejection as refused and changed disagreement as ambiguous", async () => {
		const unchanged = await run(
			fixture({
				providerFailure: diagnostic(),
				afterRefs: [
					{ name: "b", sha: "b1" },
					{ name: "c", sha: "c1" },
				],
			}),
			request(),
		);
		expect(unchanged).toMatchObject({
			status: "negative",
			data: { outcome: "refused", recovery: { action: "fix-provider" } },
		});
		const changed = await run(
			fixture({
				providerFailure: diagnostic(),
				afterRefs: [
					{ name: "b", sha: "moved" },
					{ name: "c", sha: "c1" },
				],
			}),
			request(),
		);
		expect(changed).toMatchObject({
			status: "failure",
			errorType: "restack-outcome-ambiguous",
			data: { outcome: "ambiguous" },
		});
	});

	test("classifies an unchanged continuation rejection as refused without inventing its range", async () => {
		const rebaseState = state({
			branch: null,
			operation: "rebase",
			clean: false,
			hasStagedChanges: true,
		});
		const result = await run(
			fixture({
				gitState: rebaseState,
				afterGitState: rebaseState,
				providerFailure: diagnostic(),
			}),
			request(),
		);
		expect(result).toMatchObject({
			status: "negative",
			data: {
				outcome: "refused",
				selectedBranches: null,
				baseAnchor: null,
				recovery: { action: "fix-provider" },
			},
		});
	});

	test("classifies provider-success postcondition disagreement as ambiguous", async () => {
		await expect(run(fixture({ ancestry: false }), request())).resolves.toMatchObject({
			status: "failure",
			errorType: "restack-outcome-ambiguous",
			data: {
				postconditions: expect.arrayContaining([
					{ name: "selected-ancestry-chained", passed: false },
				]),
			},
		});
	});

	test("uses strict schemas and human output ends with the recovery instruction", async () => {
		expect(
			gsRestackRequestSchema.safeParse({ downstack: false, dryRun: false, yes: true, extra: 1 })
				.success,
		).toBe(false);
		const result = await run(fixture(), request());
		if (result.status !== "success") throw new Error("Expected successful fixture.");
		expect(gsRestackResultSchema.safeParse({ ...result.data, extra: 1 }).success).toBe(false);
		const rendered = renderGsRestackHuman(result.data);
		expect(rendered.endsWith(`Next action: ${result.data.recovery.instruction}`)).toBe(true);
	});

	test("classifies a second provider conflict without looping", async () => {
		const options = fixture({
			gitState: state({ branch: null, operation: "rebase", clean: false, hasStagedChanges: true }),
			afterGitState: state({
				branch: null,
				operation: "rebase",
				clean: false,
				unmergedPaths: ["next.txt"],
			}),
		});
		const provider = new InMemoryGsStackProviderGateway(options);
		const result = await runGsRestackResolve(
			{ provider, git: new InMemoryGsRestackGitGateway(options) },
			noninteractive(),
			{ downstack: false, dryRun: false, yes: true },
		);
		expect(result).toMatchObject({ status: "negative", data: { outcome: "conflict-stopped" } });
		expect(provider.operations.filter((operation) => operation === "continue")).toHaveLength(1);
	});
});

function fixture(overrides: Partial<InMemoryRestackOptions> = {}): InMemoryRestackOptions {
	return {
		topology,
		gitState: clean,
		afterGitState: clean,
		refs: [
			{ name: "a", sha: "a1" },
			{ name: "b", sha: "b1" },
			{ name: "c", sha: "c1" },
		],
		afterRefs: [
			{ name: "b", sha: "b2" },
			{ name: "c", sha: "c2" },
		],
		...overrides,
	};
}

function state(options: {
	branch: string | null;
	operation?: "none" | "rebase";
	clean: boolean;
	unmergedPaths?: readonly string[];
	hasStagedChanges?: boolean;
}) {
	return {
		checkout: { branch: options.branch, head: "head" },
		operation: options.operation ?? "none",
		clean: options.clean,
		unmergedPaths: options.unmergedPaths ?? [],
		hasStagedChanges: options.hasStagedChanges ?? false,
	} as const;
}

function request() {
	return { downstack: false, dryRun: false, yes: true } as const;
}

function diagnostic() {
	return {
		command: "gh stack rebase --no-trunk",
		termination: "exit-1",
		stdout: "",
		stderr: "provider refused",
	} as const;
}

function noninteractive() {
	return { interactive: false, confirm: async () => false };
}

async function run(
	options: InMemoryRestackOptions,
	request: { downstack: boolean; dryRun: boolean; yes: boolean },
) {
	return await runGsRestackResolve(
		{
			provider: new InMemoryGsStackProviderGateway(options),
			git: new InMemoryGsRestackGitGateway(options),
		},
		noninteractive(),
		request,
	);
}
