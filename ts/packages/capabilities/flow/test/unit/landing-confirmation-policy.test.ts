import { describe, expect, test } from "vitest";

import { optionalEntry } from "@nseng-ai/foundation/primitives";

import { parseArgs } from "../../src/land/land-stack.ts";
import { approvedLandConfirmationKinds } from "../../src/land/landing-confirmation-policy.ts";
import { planPostLandingSlotCleanup } from "../../src/land/post-landing-slot-cleanup.ts";
import type { ParsedArgs } from "../../src/land/stack/types.ts";
import type { LandingShape } from "../../src/land/types.ts";

const SLOT_ROOT = "/Users/me/.local/state/ns/slots/repos/repo/worktrees/slot-02";
const BRANCH = "feature/current";

function expectParsed(argsText: string): ParsedArgs {
	const result = parseArgs(argsText);
	if (result.type === "failure") throw new Error(result.failure.message);
	return result.value;
}

function managedShape(): LandingShape {
	return {
		repoRoot: SLOT_ROOT,
		current: BRANCH,
		trunk: "main",
		metadataDbPath: "/repo/.git/.graphite/metadata.db",
		stack: {
			trunk: "main",
			current: BRANCH,
			actualCurrentBranch: BRANCH,
			landingTargetBranch: BRANCH,
			landingBranches: [BRANCH],
			remainingLandingBranches: [],
			descendantBranches: [],
			descendantRootBranches: [],
			warnings: [],
		},
	};
}

describe("canonical confirmation approval mapping", () => {
	test("--yes approves main and previewed cleanup but leaves pre-merge prompts canonical", () => {
		const cleanupPreview = planPostLandingSlotCleanup({
			hasSlotsExtension: true,
			args: expectParsed("--yes"),
			shape: managedShape(),
		});
		expect([
			...approvedLandConfirmationKinds({
				flags: expectParsed("--yes"),
				...optionalEntry("cleanupPreview", cleanupPreview),
			}),
		]).toEqual(["main-landing", "single-branch-main-landing", "post-landing-cleanup"]);
	});

	test("--force approves only previewed cleanup", () => {
		const cleanupPreview = planPostLandingSlotCleanup({
			hasSlotsExtension: true,
			args: expectParsed("--force"),
			shape: managedShape(),
		});
		expect([
			...approvedLandConfirmationKinds({
				flags: expectParsed("--force"),
				...optionalEntry("cleanupPreview", cleanupPreview),
			}),
		]).toEqual(["post-landing-cleanup"]);
	});

	test("interactive and dry-run calls grant no request kinds", () => {
		expect(approvedLandConfirmationKinds({ flags: expectParsed("") })).toEqual(new Set());
		expect(
			approvedLandConfirmationKinds({ flags: expectParsed("--dry-run --yes --force") }),
		).toEqual(new Set());
	});
});
