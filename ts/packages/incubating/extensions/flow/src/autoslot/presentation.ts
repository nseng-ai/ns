import type { Caps } from "@nseng-ai/clinkr";
import { renderResultBlock } from "@nseng-ai/foundation/cli-theme";

import type { AutoslotWorkflowResult } from "./autoslot.ts";
import { formatSlotCheckoutFailureCause } from "./slot-checkout.ts";

export function renderAutoslotResult(
	caps: Caps,
	result: AutoslotWorkflowResult,
	providerLabel: string,
): string {
	switch (result.type) {
		case "refused":
			return renderResultBlock(caps, {
				kind: "refusal",
				headline: `Autoslot did not create a ${providerLabel} branch.`,
				cwd: result.cwd,
				body: result.message,
			});
		case "failed":
			return renderResultBlock(caps, {
				kind: "failure",
				headline: `Autoslot could not create a ${providerLabel} branch.`,
				cwd: result.cwd,
				body: result.message,
			});
		case "branch-created-slot-skipped":
			return renderResultBlock(caps, {
				kind: "refusal",
				headline: `Autoslot created ${result.branchName}, but slot movement was skipped.`,
				cwd: result.cwd,
				body: "The worktree is not clean; `ns slot checkout --current` requires a clean worktree.",
			});
		case "branch-created-slot-failed":
			return renderResultBlock(caps, {
				kind: "failure",
				headline: `Autoslot created ${result.branchName}, but ns slot checkout failed.`,
				cwd: result.cwd,
				body: formatSlotCheckoutFailureCause(result.failure),
			});
		case "moved":
			return renderResultBlock(caps, {
				kind: "success",
				headline: `Autoslot moved ${result.branchName} to ${result.slotName}.`,
				cwd: result.cwd,
				body: `Worktree: ${result.worktreePath}`,
				guidance: result.navigationCommand,
			});
	}
}
