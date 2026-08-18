import { describe, expect, test } from "vitest";

import {
	PlainGitBranchCreationProvider,
	createBranchWithProvider,
	type BranchCreationProvider,
} from "@nseng-ai/extension-kit/branch-creation";
import { GraphiteBranchCreationProvider } from "@nseng-ai/extension-kit/graphite/branch";
import { InMemoryGraphiteBranchGateway } from "@nseng-ai/extension-kit/graphite/testing";
import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";

const ROOT = "/repo";
const TARGET = "feature/created";
const START = "0123456789abcdef0123456789abcdef01234567";
const PARENT = "feature/parent";

interface ProviderHarness {
	git: InMemoryGitGateway;
	provider: BranchCreationProvider;
}

type HarnessFactory = (state?: { existingBranches?: readonly string[] }) => ProviderHarness;

const conformingProviders: ReadonlyArray<{ name: string; create: HarnessFactory }> = [
	{
		name: "plain Git",
		create(state = {}) {
			const git = new InMemoryGitGateway(state);
			return { git, provider: new PlainGitBranchCreationProvider(git) };
		},
	},
	{
		name: "Graphite",
		create(state = {}) {
			const git = new InMemoryGitGateway(state);
			return {
				git,
				provider: new GraphiteBranchCreationProvider({
					git,
					graphite: new InMemoryGraphiteBranchGateway(),
					parentBranch: PARENT,
				}),
			};
		},
	},
];

for (const entry of conformingProviders) {
	describe(`${entry.name} branch creation conformance`, () => {
		test("creates the explicit target at the explicit start and verifies the Git ref", async () => {
			const harness = entry.create();

			await expect(
				createBranchWithProvider({
					git: harness.git,
					provider: harness.provider,
					request: { cwd: ROOT, targetBranch: TARGET, startPoint: START },
				}),
			).resolves.toMatchObject({
				type: "created",
				targetBranch: TARGET,
				startPoint: START,
				refName: `refs/heads/${TARGET}`,
			});
			expect(harness.git.createBranchAtStartPointCalls).toEqual([
				{ cwd: ROOT, branch: TARGET, startPoint: START },
			]);
			expect(harness.git.localBranchPresenceCalls).toEqual([
				{ cwd: ROOT, branch: TARGET },
				{ cwd: ROOT, branch: TARGET },
			]);
			expect(harness.git.listLocalBranchTipsCalls).toEqual([{ cwd: ROOT }]);
		});

		test("reports a collision without invoking the provider", async () => {
			const harness = entry.create({ existingBranches: [TARGET] });

			const outcome = await createBranchWithProvider({
				git: harness.git,
				provider: harness.provider,
				request: { cwd: ROOT, targetBranch: TARGET, startPoint: START },
			});

			expect(outcome).toMatchObject({
				type: "failed",
				stage: "collision",
				branchObserved: true,
				error: { code: "branch-already-exists" },
			});
			expect(harness.git.createBranchAtStartPointCalls).toEqual([]);
		});
	});
}

describe("branch creation provider failures and postconditions", () => {
	test("returns a structured provider failure", async () => {
		const git = new InMemoryGitGateway();
		const provider: BranchCreationProvider = {
			id: "example-provider",
			async createBranch() {
				return {
					ok: false,
					branchCreated: false,
					error: { code: "example-failed", message: "provider failed" },
				};
			},
		};

		await expect(
			createBranchWithProvider({
				git,
				provider,
				request: { cwd: ROOT, targetBranch: TARGET, startPoint: START },
			}),
		).resolves.toMatchObject({
			type: "failed",
			providerId: "example-provider",
			stage: "provider",
			branchObserved: false,
			error: { code: "example-failed" },
		});
	});

	test("rejects provider success when Git does not observe the branch", async () => {
		const git = new InMemoryGitGateway();
		const provider: BranchCreationProvider = {
			id: "lying-provider",
			async createBranch() {
				return { ok: true };
			},
		};

		await expect(
			createBranchWithProvider({
				git,
				provider,
				request: { cwd: ROOT, targetBranch: TARGET, startPoint: START },
			}),
		).resolves.toMatchObject({
			type: "failed",
			stage: "postcondition",
			branchObserved: false,
			error: { code: "branch-create-postcondition-failed" },
		});
	});

	test("rejects provider success when the target points at the wrong commit", async () => {
		const wrongStart = "fedcba9876543210fedcba9876543210fedcba98";
		const git = new InMemoryGitGateway();
		const provider: BranchCreationProvider = {
			id: "wrong-commit-provider",
			async createBranch(request) {
				const result = await git.createBranchAtStartPoint({
					cwd: request.cwd,
					branch: request.targetBranch,
					startPoint: wrongStart,
				});
				return result.ok ? { ok: true } : { ok: false, error: result.error, branchCreated: false };
			},
		};

		await expect(
			createBranchWithProvider({
				git,
				provider,
				request: { cwd: ROOT, targetBranch: TARGET, startPoint: START },
			}),
		).resolves.toMatchObject({
			type: "failed",
			stage: "postcondition",
			branchObserved: true,
			error: { code: "branch-create-wrong-start" },
		});
	});
});
