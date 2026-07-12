import { describe, expect, test } from "vitest";

import { noopNsCommandIo } from "@nseng-ai/sdk/sdk";
import {
	executeLanding,
	nullLandExecutionProgress,
	type LandConfirmationGateway,
	type StackLandingShape,
} from "@nseng-ai/flow/land/api";
import {
	createInMemoryLandContext,
	pullRequestFacts,
	stackSnapshot,
} from "@nseng-ai/flow/land/testing";
import {
	presentFlowStackLandingFailure,
	runFlowStackLanding,
} from "../../src/land/landing-execution.ts";
import { LandStackCommandStream } from "../../src/land/stack/command-stream.ts";
import type { LandResultKind } from "../../src/land/land-presentation.ts";
import type { LandStackCommandContext, ParsedArgs } from "../../src/land/stack/types.ts";

const ROOT = "/repo";
const SLOT_ROOT = "/state/ns/slots/repos/repo/worktrees/slot-02";
const SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

interface PresentedNotification {
	readonly message: string;
	readonly level: string | undefined;
	readonly kind: LandResultKind | undefined;
}

function contextFixture(cwd: string): {
	readonly ctx: LandStackCommandContext;
	readonly notifications: PresentedNotification[];
} {
	const notifications: PresentedNotification[] = [];
	let renderedKind: LandResultKind | undefined;
	return {
		ctx: {
			cwd,
			hasUI: true,
			ui: {
				notify: (message, level) => {
					notifications.push({ message, level, kind: renderedKind });
					renderedKind = undefined;
				},
				confirm: async () => true,
				setStatus() {},
			},
			waitForIdle: async () => {},
			renderResultBlock: (kind, message) => {
				renderedKind = kind;
				return message;
			},
		},
		notifications,
	};
}

function args(overrides: Partial<ParsedArgs> = {}): ParsedArgs {
	return {
		shouldSkipConfirmation: false,
		isDryRun: false,
		shouldPreserveSlot: false,
		shouldForceCleanup: false,
		shouldShowHelp: false,
		shouldStreamVerboseOutput: false,
		...overrides,
	};
}

function trunkShape(repoRoot: string): StackLandingShape {
	return {
		repoRoot,
		current: "main",
		trunk: "main",
		metadataDbPath: `${repoRoot}/metadata.sqlite`,
		localBranches: [{ name: "main", sha: SHA }],
		stack: stackSnapshot({
			trunk: "main",
			current: "main",
			actualCurrentBranch: "main",
			landingTargetBranch: "main",
			landingBranches: [],
		}),
	};
}

describe("Flow presentation of canonical completion dispositions", () => {
	test("nothing-to-land is an informational completed outcome with exact refusal-kind text", async () => {
		const memory = createInMemoryLandContext();
		const fixture = contextFixture(ROOT);
		const outcome = await runFlowStackLanding({
			runtime: { landContext: memory.context },
			parsedArgs: args({ shouldPreserveSlot: true }),
			execution: {
				source: { type: "prepared", shape: trunkShape(ROOT) },
				approvedConfirmationKinds: new Set(),
			},
			session: {
				ctx: fixture.ctx,
				commandStream: new LandStackCommandStream(noopNsCommandIo),
				progress: nullLandExecutionProgress,
			},
		});

		expect(outcome).toEqual({ type: "completed" });
		expect(fixture.notifications).toEqual([
			{
				message: "Current branch is main, which is trunk or has no PR path to land. Nothing to do.",
				level: "info",
				kind: "refusal",
			},
		]);
		expect(memory.github.squashMergePullRequestCalls).toEqual([]);
	});

	test("cleanup-only presents only the existing post-cleanup success notice", async () => {
		const memory = createInMemoryLandContext({
			git: {
				repoRoot: SLOT_ROOT,
				currentBranch: "main",
				localBranches: [{ name: "main", sha: SHA }],
			},
			graphite: { stackShape: trunkShape(SLOT_ROOT).stack },
		});
		const fixture = contextFixture(SLOT_ROOT);
		const outcome = await runFlowStackLanding({
			runtime: { landContext: memory.context },
			parsedArgs: args({ shouldForceCleanup: true }),
			execution: {
				source: { type: "prepared", shape: trunkShape(SLOT_ROOT) },
				approvedConfirmationKinds: new Set(),
			},
			session: {
				ctx: fixture.ctx,
				commandStream: new LandStackCommandStream(noopNsCommandIo),
				progress: nullLandExecutionProgress,
			},
		});

		expect(outcome).toEqual({ type: "completed" });
		expect(fixture.notifications).toEqual([
			{
				message: "Post-landing cleanup complete: freed slot-02; local trunk branch main was kept.",
				level: "success",
				kind: "success",
			},
		]);
		expect(memory.github.squashMergePullRequestCalls).toEqual([]);
	});

	test("ordinary completion presents landed success then exactly one cleanup notice", async () => {
		const branch = "feature-a";
		const shape: StackLandingShape = {
			repoRoot: SLOT_ROOT,
			current: branch,
			trunk: "main",
			metadataDbPath: `${SLOT_ROOT}/.git/graphite.db`,
			localBranches: [{ name: branch, sha: SHA }],
			stack: stackSnapshot({ current: branch, landingBranches: [branch] }),
		};
		const memory = createInMemoryLandContext({
			git: {
				repoRoot: SLOT_ROOT,
				currentBranch: branch,
				localBranches: [{ name: branch, sha: SHA }],
			},
			graphite: { stackShape: shape.stack },
			github: {
				pullRequests: [pullRequestFacts({ number: 101, headRefName: branch, headRefOid: SHA })],
			},
		});
		const fixture = contextFixture(SLOT_ROOT);
		const outcome = await runFlowStackLanding({
			runtime: { landContext: memory.context },
			parsedArgs: args({ shouldForceCleanup: true }),
			execution: {
				source: { type: "prepared", shape },
				approvedConfirmationKinds: new Set(["main-landing"]),
			},
			session: {
				ctx: fixture.ctx,
				commandStream: new LandStackCommandStream(noopNsCommandIo),
				progress: nullLandExecutionProgress,
			},
		});

		expect(outcome).toEqual({ type: "completed" });
		expect(fixture.notifications).toEqual([
			{
				message: "Landed 1 PR: #101 feature-a.",
				level: "success",
				kind: "success",
			},
			{
				message: "Post-landing cleanup complete: freed slot-02 and deleted local branch feature-a.",
				level: "success",
				kind: "success",
			},
		]);
	});

	test("presents landed success before a declined post-landing cleanup failure", async () => {
		const branch = "feature-a";
		const memory = createInMemoryLandContext({
			git: {
				repoRoot: SLOT_ROOT,
				currentBranch: branch,
				localBranches: [{ name: branch, sha: SHA }],
			},
			graphite: {
				stackShape: stackSnapshot({ current: branch, landingBranches: [branch] }),
			},
			github: {
				pullRequests: [pullRequestFacts({ number: 101, headRefName: branch, headRefOid: SHA })],
			},
		});
		const confirmation: LandConfirmationGateway = {
			confirm: async (request) =>
				request.kind === "post-landing-cleanup"
					? { type: "declined" }
					: { type: "approved", approvalSource: "prompted" },
		};
		const execution = await executeLanding({
			context: memory.context,
			request: {
				cwd: SLOT_ROOT,
				target: { type: "stack" },
				mode: "execute",
				preflight: { shouldAllowSubmitRequiredState: true },
				cleanup: "free-slot",
			},
			host: { confirmation, progress: nullLandExecutionProgress },
			source: { type: "discover" },
		});
		if (execution.type !== "failed") throw new Error("Expected cleanup refusal");

		const fixture = contextFixture(SLOT_ROOT);
		const outcome = presentFlowStackLandingFailure({
			session: {
				ctx: fixture.ctx,
				commandStream: new LandStackCommandStream(noopNsCommandIo),
				progress: nullLandExecutionProgress,
			},
			outcome: { ...execution, report: { ...execution.report, phases: [] } },
		});

		expect(outcome.type).toBe("failure");
		expect(fixture.notifications).toHaveLength(2);
		expect(fixture.notifications[0]).toMatchObject({ level: "success", kind: "success" });
		expect(fixture.notifications[1]).toMatchObject({ level: "warning", kind: "refusal" });
		expect(fixture.notifications[1]?.message).toContain(
			"Skipped post-landing cleanup by upfront choice",
		);
	});
});
