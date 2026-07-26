import { describe, expect, test } from "vitest";

import type { LandConfirmationRequest } from "../../src/land/execution/host-seams.ts";
import {
	formatFreeManagedSlotsConfirmationDetails,
	formatSubmitRequiredUpdatesConfirmationDetails,
	freeManagedSlotsConfirmationTitle,
	freeManagedSlotsNonInteractiveRefusalMessage,
	submitRequiredUpdatesConfirmationTitle,
	submitRequiredUpdatesNonInteractiveRefusalMessage,
} from "../../src/land/land-presentation.ts";

const freeRequest: Extract<LandConfirmationRequest, { readonly kind: "free-managed-slots" }> = {
	kind: "free-managed-slots",
	slots: [
		{
			type: "managed-slot",
			branch: "feature/a",
			path: "/state/ns/slots/repos/ns/worktrees/slot-03",
			slotName: "slot-03",
		},
	],
};

const submitRequest: Extract<
	LandConfirmationRequest,
	{ readonly kind: "submit-required-updates" }
> = {
	kind: "submit-required-updates",
	landingTargetBranch: "feature/b",
	restackTarget: "feature/b",
	requirements: [
		{
			branch: "feature/a",
			prNumber: 7,
			localSha: "local",
			prHeadSha: "remote",
			baseRefName: "main",
			reasons: ["head remote != local"],
		},
	],
	restackRequirements: [{ branch: "feature/b", parent: "feature/a" }],
};

describe("pre-merge confirmation presentation", () => {
	test("preserves free-slot title, details, and non-interactive refusal", () => {
		const details = [
			"Run targeted slot cleanup? This detaches/frees managed slots for landing branches only.",
			"",
			"- slot-03 feature/a /state/ns/slots/repos/ns/worktrees/slot-03",
			"",
			"Command: ns slot free --wt slot-03",
		].join("\n");
		expect(freeManagedSlotsConfirmationTitle()).toBe("Free landing slots?");
		expect(formatFreeManagedSlotsConfirmationDetails(freeRequest)).toBe(details);
		expect(freeManagedSlotsNonInteractiveRefusalMessage(freeRequest)).toBe(
			[
				"Managed slot worktrees for landing branches block stack restack/ref updates, but this context cannot ask for the required slot cleanup confirmation.",
				details,
				"No PRs were landed. Run `ns slot free --wt slot-03` manually if appropriate, then rerun /ns:flow:land --yes.",
			].join("\n"),
		);
	});

	test("preserves restack-submit title, details, and non-interactive refusal", () => {
		const details = [
			"Local branch reachability shows this stack needs restack before submit/update, and GitHub PR metadata is behind local refs. Run restack then submit/update before merging?",
			"",
			"Landing branches needing restack:",
			"- feature/b on feature/a",
			"",
			"PR metadata to update:",
			"- #7 feature/a: head remote != local",
			"",
			"Commands:",
			"$ gt restack --branch feature/b --upstack --no-interactive",
			"$ gt submit --branch feature/b --no-stack --update-only --no-edit --no-ai --no-interactive",
		].join("\n");
		expect(submitRequiredUpdatesConfirmationTitle(submitRequest)).toBe(
			"Run gt restack + submit/update?",
		);
		expect(formatSubmitRequiredUpdatesConfirmationDetails(submitRequest)).toBe(details);
		expect(submitRequiredUpdatesNonInteractiveRefusalMessage(submitRequest)).toBe(
			[
				"GitHub PR metadata is behind local Graphite refs, but this context cannot ask for the required restack + submit/update confirmation.",
				details,
				"No PRs were landed. Run `gt restack --branch feature/b --upstack --no-interactive` then `gt submit --branch feature/b --no-stack --update-only --no-edit --no-ai --no-interactive` manually, then rerun /ns:flow:land --yes.",
			].join("\n"),
		);
	});
});
