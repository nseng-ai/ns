import { describe, expect, test } from "vitest";

import { formatImplBranchContextCommand } from "@nseng-ai/branch-context/api";
import registerBranchContextExtension from "../src/extension.ts";

import {
	DEFAULT_PLAN_CONTENT,
	FakePi,
	PLAN_KEY,
	PLAN_SLUG,
	SOURCE_BRANCH,
	branchContextExtensionTestOptions,
	createBranchContextOperationFakes,
	createContext,
	gitCheckoutStep,
	makeNamedPlanFile,
	planSlugExecCall,
	planSlugStep,
} from "./branch-context-extension-support.ts";

const DEFAULT_IMPL_COMMAND = formatImplBranchContextCommand(PLAN_KEY);
describe("branch-context-upstack-impl-session", () => {
	test("ns:branch-context:upstack-impl-from-plan creates with Graphite, checks out the branch, and dispatches impl in a new session", async () => {
		const filePath = await makeNamedPlanFile();
		const events: string[] = [];
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT), gitCheckoutStep(PLAN_SLUG)], events);
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(pi, branchContextExtensionTestOptions(fakes.operations));
		const command = pi.commands.get("ns:branch-context:upstack-impl-from-plan");
		const context = createContext(events, { sessionFile: "/sessions/source.jsonl" });

		await command?.handler(`${filePath} --yes`, context.ctx);

		pi.assertDone();
		expect(context.waits()).toBe(1);
		expect(fakes.createBranchCalls[0]?.[1]).toMatchObject({
			slug: PLAN_SLUG,
			filePath,
			creation: { type: "graphite-current-parent-current-head" },
		});
		expect(
			pi.execCalls.map((call) => ({
				command: call.command,
				args: call.args,
			})),
		).toEqual([
			planSlugExecCall(DEFAULT_PLAN_CONTENT),
			{ command: "git", args: ["checkout", PLAN_SLUG] },
		]);
		expect(pi.sentMessages[0]?.content).toContain("Created branch context and attached plan.");
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${PLAN_SLUG}`);
		expect(pi.sentUserMessages).toEqual([]);
		expect(context.replacementUserMessages).toEqual([DEFAULT_IMPL_COMMAND]);
		expect(context.newSessionParentSessions).toEqual(["/sessions/source.jsonl"]);
		expect(events.indexOf("new-session")).toBeGreaterThan(events.indexOf("status"));
		expect(events.indexOf("replacement-send")).toBeGreaterThan(events.indexOf("new-session"));
		expect(context.wasSessionReplaced()).toBe(true);
		expect(context.statuses.at(-1)).toEqual({
			key: "ns:branch-context:upstack-impl-from-plan",
			value: "starting implementation session…",
		});
	});

	test("ns:branch-context:upstack-impl-from-plan reports created-path cancellation with manual recovery", async () => {
		const filePath = await makeNamedPlanFile();
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT), gitCheckoutStep(PLAN_SLUG)]);
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(pi, branchContextExtensionTestOptions(fakes.operations));
		const command = pi.commands.get("ns:branch-context:upstack-impl-from-plan");
		const context = createContext([], { shouldCancelNewSession: true });

		await command?.handler(`${filePath} --yes`, context.ctx);

		pi.assertDone();
		const content = pi.sentMessages.at(-1)?.content ?? "";
		expect(content).toContain(
			`Created branch context, attached the plan, and checked out ${PLAN_SLUG}, but starting the implementation session was cancelled. Run ${DEFAULT_IMPL_COMMAND} to continue.`,
		);
		expect(context.replacementUserMessages).toEqual([]);
	});

	test("ns:branch-context:upstack-impl-from-plan dry-run defaults to Graphite even when the extension option says plain Git", async () => {
		const filePath = await makeNamedPlanFile();
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT)]);
		registerBranchContextExtension(pi, {
			branchContextDefaultCreation: "plain-git",
			shouldResolveTargetBranchInPreview: false,
		});
		const command = pi.commands.get("ns:branch-context:upstack-impl-from-plan");
		const context = createContext();

		await command?.handler(`${filePath} --dry-run`, context.ctx);

		pi.assertDone();
		expect(
			pi.execCalls.map((call) => ({
				command: call.command,
				args: call.args,
			})),
		).toEqual([planSlugExecCall(DEFAULT_PLAN_CONTENT)]);
		expect(pi.sentMessages[0]?.content).toContain("Dry run: no branch would be created");
		expect(pi.sentMessages[0]?.content).toContain("Branch creation: graphite");
		expect(pi.sentMessages[0]?.content).toContain(`git checkout ${PLAN_SLUG}`);
		expect(pi.sentMessages[0]?.content).not.toContain("gt up");
		expect(pi.sentMessages[0]?.content).toContain("/new");
		expect(pi.sentMessages[0]?.content).toContain(DEFAULT_IMPL_COMMAND);
	});

	test("ns:branch-context:upstack-impl-from-plan surfaces create failures before checkout", async () => {
		const filePath = await makeNamedPlanFile();
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT)]);
		const fakes = createBranchContextOperationFakes({
			async createBranchContextFromFile() {
				throw new Error(
					[
						"Current branch is not tracked by Graphite; refusing to stack a branch context on it.",
						`Parent branch: ${SOURCE_BRANCH}`,
						"No branch was created and no plan was attached.",
					].join("\n"),
				);
			},
		});
		registerBranchContextExtension(pi, branchContextExtensionTestOptions(fakes.operations));
		const command = pi.commands.get("ns:branch-context:upstack-impl-from-plan");
		const context = createContext();

		await command?.handler(`${filePath} --yes`, context.ctx);

		pi.assertDone();
		expect(
			pi.execCalls.map((call) => ({
				command: call.command,
				args: call.args,
			})),
		).toEqual([planSlugExecCall(DEFAULT_PLAN_CONTENT)]);
		const content = pi.sentMessages[0]?.content ?? "";
		expect(content).toContain("Failed to create branch context and attach the plan.");
		expect(content).toContain(
			"Current branch is not tracked by Graphite; refusing to stack a branch context on it.",
		);
		expect(content).toContain(`Parent branch: ${SOURCE_BRANCH}`);
		expect(content).toContain("No branch was created and no plan was attached.");
		expect(context.replacementUserMessages).toEqual([]);
		expect(context.newSessionParentSessions).toEqual([]);
	});

	test("ns:branch-context:upstack-impl-from-plan supports plain Git creation before checkout", async () => {
		const filePath = await makeNamedPlanFile();
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT), gitCheckoutStep(PLAN_SLUG)]);
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(pi, {
			branchContextDefaultCreation: "graphite",
			branchContextOperations: fakes.operations,
		});
		const command = pi.commands.get("ns:branch-context:upstack-impl-from-plan");
		const context = createContext();

		await command?.handler(`${filePath} --yes --plain-git`, context.ctx);

		pi.assertDone();
		expect(fakes.createBranchCalls[0]?.[1]).toMatchObject({
			creation: { type: "plain-git-current-head" },
		});
		expect(
			pi.execCalls.map((call) => ({
				command: call.command,
				args: call.args,
			})),
		).toContainEqual({ command: "git", args: ["checkout", PLAN_SLUG] });
		expect(pi.sentMessages[0]?.content).toContain("Branch creation: plain-git");
		expect(pi.sentUserMessages).toEqual([]);
		expect(context.replacementUserMessages).toEqual([DEFAULT_IMPL_COMMAND]);
	});
});
