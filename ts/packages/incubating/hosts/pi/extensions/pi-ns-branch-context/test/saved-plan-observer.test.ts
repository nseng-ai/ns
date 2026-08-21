import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, test } from "vitest";

import {
	buildRepoPlanStoreKey,
	encodeBranchForPlanPath,
	type SavedPlanFileEvidence,
} from "@nseng-ai/plans/api";
import registerBranchContextExtension from "../src/extension.ts";
import { createBranchContextPiCommandApi } from "../src/pi-command-api.ts";
import { registerSavedPlanObserver, type SavedPlanObserver } from "../src/saved-plan-observer.ts";
import {
	FakePi,
	SOURCE_BRANCH,
	createContext,
	gitCurrentBranchStep,
	gitOriginStep,
	gitRootStep,
	makeTempDir,
} from "./branch-context-extension-support.ts";

const ORIGIN = "git@github.com:owner/repo.git";

interface ObserverFixture {
	pi: FakePi;
	observer: SavedPlanObserver;
	context: ReturnType<typeof createContext>;
	evidence: SavedPlanFileEvidence;
}

describe("Saved Plan CLI migration", () => {
	test("does not register the removed write_saved_plan_file tool", () => {
		const pi = new FakePi();
		registerBranchContextExtension(pi);

		expect(pi.tools.has("write_saved_plan_file")).toBe(false);
		expect([...pi.tools.keys()]).not.toContain("write_saved_plan_file");
	});

	test("successful plan command dispatch arms observation before the planning turn", async () => {
		const fixture = await makeObserverFixture();
		registerBranchContextExtension(fixture.pi, {
			planStoreRoot: dirnameForPlanStore(fixture.evidence),
		});
		const command = fixture.pi.commands.get("ns:plan:grill-and-save");

		await command?.handler("save this plan", fixture.context.ctx);
		await emitSave(fixture);
		await settle(fixture);

		expect(fixture.pi.appendedEntries).toEqual([
			{ customType: "ns:saved-plan", data: fixture.evidence },
		]);
	});

	test("records full validated evidence from one successful standalone save command", async () => {
		const fixture = await makeObserverFixture();
		fixture.evidence.summary = "Keep all evidence.";
		fixture.observer.arm(fixture.evidence.repoRoot);

		await emitSave(fixture, {
			command:
				'enriched-plan exec save --summary "Keep all evidence." --format json --file "/tmp/final plan.md"',
		});
		await settle(fixture);

		expect(fixture.pi.appendedEntries).toEqual([
			{ customType: "ns:saved-plan", data: fixture.evidence },
		]);
	});

	test.each([
		{
			name: "malformed JSON",
			command: "enriched-plan exec save --file /tmp/final.md --format json",
			text: "not-json",
			isError: false,
		},
		{
			name: "nonzero bash",
			command: "enriched-plan exec save --file /tmp/final.md --format json",
			text: "command failed",
			isError: true,
		},
		{
			name: "truncated output",
			command: "enriched-plan exec save --file /tmp/final.md --format json",
			text: "{}",
			isError: false,
			truncated: true,
		},
	])("rejects $name", async ({ command, text, isError, truncated }) => {
		const fixture = await makeObserverFixture();
		fixture.observer.arm(fixture.evidence.repoRoot);

		await emitSave(fixture, {
			command,
			text,
			isError,
			...(truncated === undefined ? {} : { truncated }),
		});
		await settle(fixture);

		expect(fixture.pi.appendedEntries).toEqual([]);
		expect(fixture.context.notifications.at(-1)).toMatchObject({ level: "warning" });
	});

	test("ignores unrelated bash and malformed save command shapes", async () => {
		const fixture = await makeObserverFixture();
		fixture.observer.arm(fixture.evidence.repoRoot);

		await emitSave(fixture, { command: "git status --short" });
		await emitSave(fixture, {
			command: "enriched-plan exec save --file /tmp/final.md --format json && echo unsafe",
		});
		await settle(fixture);

		expect(fixture.pi.appendedEntries).toEqual([]);
		expect(fixture.context.notifications.at(-1)?.message).toContain("No valid Saved Plan");
	});

	test("rejects a matching save completed in a different cwd", async () => {
		const fixture = await makeObserverFixture();
		fixture.observer.arm(fixture.evidence.repoRoot);
		const wrongContext = createContext([], { cwd: "/other/repo" });

		await emitSave(fixture, { endContext: wrongContext });
		await settle(fixture);

		expect(fixture.pi.appendedEntries).toEqual([]);
		expect(fixture.context.notifications.at(-1)?.message).toContain("armed cwd");
	});

	test.each([
		["repository", { repoRoot: "/other/repo" }],
		["branch", { sourceBranch: "other-branch", branchKey: "other-branch" }],
		["unsafe path", { filePath: "/tmp/portable-saved-plan-flow.md" }],
	] as const)("rejects wrong %s evidence", async (_name, evidenceOverrides) => {
		const fixture = await makeObserverFixture();
		fixture.observer.arm(fixture.evidence.repoRoot);

		await emitSave(fixture, { evidence: { ...fixture.evidence, ...evidenceOverrides } });
		await settle(fixture);

		expect(fixture.pi.appendedEntries).toEqual([]);
		expect(fixture.context.notifications.at(-1)).toMatchObject({ level: "warning" });
	});

	test("rejects duplicate successful save results", async () => {
		const fixture = await makeObserverFixture(2);
		fixture.observer.arm(fixture.evidence.repoRoot);

		await emitSave(fixture, { toolCallId: "save-1" });
		await emitSave(fixture, { toolCallId: "save-2" });
		await settle(fixture);

		expect(fixture.pi.appendedEntries).toEqual([]);
		expect(fixture.context.notifications.at(-1)?.message).toContain("Multiple Saved Plan");
	});

	test("no-result settlement clears the observer before later tool results", async () => {
		const fixture = await makeObserverFixture();
		fixture.observer.arm(fixture.evidence.repoRoot);

		await settle(fixture);
		await emitSave(fixture);
		await settle(fixture);

		expect(fixture.pi.appendedEntries).toEqual([]);
		expect(fixture.context.notifications).toHaveLength(1);
	});

	test("session shutdown clears pending observation without persistence", async () => {
		const fixture = await makeObserverFixture();
		fixture.observer.arm(fixture.evidence.repoRoot);

		await fixture.pi.emit(
			"session_shutdown",
			{ type: "session_shutdown", reason: "quit" },
			fixture.context.ctx,
		);
		await emitSave(fixture);
		await settle(fixture);

		expect(fixture.pi.appendedEntries).toEqual([]);
		expect(fixture.context.notifications).toEqual([]);
	});

	test("failed command dispatch disarms an earlier pending workflow", async () => {
		const fixture = await makeObserverFixture();
		registerBranchContextExtension(fixture.pi, { planStoreRoot: "/unused" });
		const command = fixture.pi.commands.get("ns:plan:grill-and-save");
		const firstContext = createContext([], { cwd: fixture.evidence.repoRoot });
		await command?.handler("first", firstContext.ctx);
		const failingContext = createContext([], { cwd: fixture.evidence.repoRoot });
		failingContext.ctx.waitForIdle = async () => {
			throw new Error("idle wait failed");
		};

		await expect(command?.handler("second", failingContext.ctx)).rejects.toThrow(
			"idle wait failed",
		);
		await emitSave(fixture);
		await settle(fixture);

		expect(fixture.pi.appendedEntries).toEqual([]);
	});
});

function dirnameForPlanStore(evidence: SavedPlanFileEvidence): string {
	return dirname(dirname(dirname(evidence.filePath)));
}

async function makeObserverFixture(validationCount = 1): Promise<ObserverFixture> {
	const repoRoot = await makeTempDir("saved-plan-observer-repo-");
	const planStoreRoot = await makeTempDir("saved-plan-observer-store-");
	const slug = "portable-saved-plan-flow";
	const repoKey = buildRepoPlanStoreKey(repoRoot, ORIGIN);
	const branchKey = encodeBranchForPlanPath(SOURCE_BRANCH);
	const filePath = join(planStoreRoot, repoKey, branchKey, `${slug}.md`);
	await mkdir(join(planStoreRoot, repoKey, branchKey), { recursive: true });
	await writeFile(filePath, "# Portable Saved Plan\n", "utf8");
	const validationSteps = Array.from({ length: validationCount }, () => [
		gitRootStep(repoRoot),
		gitCurrentBranchStep(SOURCE_BRANCH),
		gitOriginStep({ stdout: `${ORIGIN}\n` }),
	]).flat();
	const pi = new FakePi(validationSteps);
	return {
		pi,
		observer: registerSavedPlanObserver(createBranchContextPiCommandApi(pi), { planStoreRoot }),
		context: createContext([], { cwd: repoRoot }),
		evidence: {
			slug,
			repoRoot,
			repoKey,
			repoIdentitySource: "origin-url",
			sourceBranch: SOURCE_BRANCH,
			branchKey,
			filePath,
		},
	};
}

async function emitSave(
	fixture: ObserverFixture,
	options: {
		toolCallId?: string;
		command?: string;
		text?: string;
		isError?: boolean;
		truncated?: boolean;
		evidence?: SavedPlanFileEvidence;
		endContext?: ReturnType<typeof createContext>;
	} = {},
): Promise<void> {
	const toolCallId = options.toolCallId ?? "save-1";
	await fixture.pi.emit(
		"tool_execution_start",
		{
			toolCallId,
			toolName: "bash",
			args: {
				command: options.command ?? "enriched-plan exec save --file /tmp/final.md --format json",
			},
		},
		fixture.context.ctx,
	);
	const evidence = options.evidence ?? fixture.evidence;
	await fixture.pi.emit(
		"tool_execution_end",
		{
			toolCallId,
			toolName: "bash",
			isError: options.isError ?? false,
			result: {
				content: [
					{
						type: "text",
						text:
							options.text ??
							JSON.stringify({
								status: "ok",
								exitCode: 0,
								data: {
									...evidence,
									provider: "openai-codex",
									model: "gpt-5.6-luna",
								},
							}),
					},
				],
				details: options.truncated === true ? { truncation: { truncated: true } } : undefined,
			},
		},
		(options.endContext ?? fixture.context).ctx,
	);
}

async function settle(fixture: ObserverFixture): Promise<void> {
	await fixture.pi.emit("agent_settled", { type: "agent_settled" }, fixture.context.ctx);
}
