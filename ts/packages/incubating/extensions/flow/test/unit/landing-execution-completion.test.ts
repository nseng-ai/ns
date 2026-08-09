import { describe, expect, test } from "vitest";

import { noopNsCommandIo } from "@nseng-ai/sdk";
import { nullLandExecutionProgress, type StackLandingShape } from "@nseng-ai/flow/land/api";
import {
	createInMemoryLandContext,
	pullRequestFacts,
	stackSnapshot,
} from "@nseng-ai/flow/land/testing";
import { runFlowStackLanding } from "../../src/land/landing-execution.ts";
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
	return {
		ctx: {
			cwd,
			hasUI: true,
			ui: {
				notify: (message, level) => {
					notifications.push({ message, level, kind: undefined });
				},
				confirm: async () => true,
				setStatus() {},
			},
			waitForIdle: async () => {},
		},
		notifications,
	};
}

function args(overrides: Partial<ParsedArgs> = {}): ParsedArgs {
	return {
		shouldSkipConfirmation: false,
		isDryRun: false,
		shouldFreeSlot: false,
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
			parsedArgs: args(),
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

		expect(outcome).toMatchObject({ type: "completed", report: { repoRoot: ROOT } });
		expect(fixture.notifications).toEqual([]);
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
			parsedArgs: args({ shouldFreeSlot: true }),
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

		expect(outcome.type).toBe("completed");
		expect(fixture.notifications).toEqual([]);
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
			parsedArgs: args({ shouldFreeSlot: true }),
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

		expect(outcome.type).toBe("completed");
		expect(fixture.notifications).toEqual([]);
	});

	test("default preserve completion presents landed success then a keep-slot hint", async () => {
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
			parsedArgs: args(),
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

		expect(outcome.type).toBe("completed");
		expect(fixture.notifications).toEqual([]);
		expect(memory.worktrees.freeSlotsCalls).toEqual([]);
	});
});
