import { describe, expect, test } from "vitest";

import { NoSavedPlanAvailableError } from "@nseng-ai/plans/api";
import registerBranchContextExtension from "../src/extension.ts";

import {
	DEFAULT_PLAN_CONTENT,
	FakePi,
	IMPL_BRANCH,
	PLAN_KEY,
	PLAN_SLUG,
	branchContextEvidence,
	branchContextExtensionTestOptions,
	branchContextOutputMessageEntry,
	createBranchContextOperationFakes,
	createContext,
	gitCheckoutStep,
	makeNamedPlanFile,
	planSlugStep,
} from "./branch-context-extension-support.ts";

function noSavedPlanError(
	reason: "missing-directory" | "no-plan-files",
): NoSavedPlanAvailableError {
	const directoryPath = reason === "missing-directory" ? "/missing/plans" : "/empty/plans";
	return new NoSavedPlanAvailableError({
		reason,
		directoryPath,
		message:
			reason === "missing-directory"
				? `No local plan store directory exists.\nPlan store directory: ${directoryPath}`
				: `No Markdown saved plan files exist.\nPlan store directory: ${directoryPath}`,
	});
}

async function assertStrictSavedPlanFailure(
	reason: "missing-directory" | "no-plan-files",
): Promise<void> {
	const explicitBranch = "branch-contexts/explicit-target";
	const pi = new FakePi();
	const fakes = createBranchContextOperationFakes({
		async resolveSelectedSavedPlanFile() {
			throw noSavedPlanError(reason);
		},
	});
	registerBranchContextExtension(
		pi,
		branchContextExtensionTestOptions(fakes.operations, [
			{ branch: explicitBranch, key: PLAN_KEY },
			{ branch: IMPL_BRANCH, key: PLAN_KEY },
		]),
	);
	const command = pi.commands.get("ns:git:impl-branch-from-plan");
	const context = createContext([], {
		sessionEntries: [
			branchContextOutputMessageEntry("Created branch context and attached plan.", {
				status: "success",
				evidence: branchContextEvidence({ branch: IMPL_BRANCH, key: PLAN_KEY }),
			}),
		],
	});

	await command?.handler(`--branch ${explicitBranch}`, context.ctx);

	pi.assertDone();
	expect(fakes.selectPlanCalls).toHaveLength(1);
	expect(fakes.createBranchCalls).toEqual([]);
	expect(pi.execCalls).toEqual([]);
	expect(context.replacementUserMessages).toEqual([]);
	expect(context.newSessionParentSessions).toEqual([]);
	const content = pi.sentMessages.at(-1)?.content ?? "";
	expect(content).toBe(
		[
			"A Saved Plan is now required to create an implementation branch; this command no longer falls back to an existing Attached Plan.",
			"",
			"Original Saved Plan resolution evidence:",
			noSavedPlanError(reason).message,
			"",
			"No Attached Plan candidate was searched or reused.",
			"No provider inspection or call, Git branch creation or checkout, Branch Memory write, or fresh session mutation occurred.",
			"Recovery: check out the implementation branch, then run /ns:branch-context:impl-attached-plan [<key>].",
			"Maintainer fallback locator (private and dormant; not in the production call graph): src/dormant-existing-branch-context-reuse.ts#runDormantGitExistingBranchContextReuse.",
		].join("\n"),
	);
}

describe("Git impl-branch-from-plan strict creation", () => {
	test("missing plan store ignores explicit, session, and current Attached Plan evidence without mutation", async () => {
		await assertStrictSavedPlanFailure("missing-directory");
	});

	test("empty plan store ignores explicit, session, and current Attached Plan evidence without mutation", async () => {
		await assertStrictSavedPlanFailure("no-plan-files");
	});

	test("Saved Plan creation checks out the exact branch and dispatches Attached Plan implementation", async () => {
		const filePath = await makeNamedPlanFile();
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT), gitCheckoutStep(PLAN_SLUG)]);
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(pi, branchContextExtensionTestOptions(fakes.operations));
		const command = pi.commands.get("ns:git:impl-branch-from-plan");
		const context = createContext();

		await command?.handler(filePath, context.ctx);

		pi.assertDone();
		expect(pi.execCalls.at(-1)).toMatchObject({ command: "git", args: ["checkout", PLAN_SLUG] });
		expect(context.replacementUserMessages).toEqual([
			`/ns:branch-context:impl-attached-plan ${PLAN_KEY}`,
		]);
	});
});
