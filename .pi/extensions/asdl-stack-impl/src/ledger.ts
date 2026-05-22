import { extractFrontmatter } from "./frontmatter.ts";
import { STACK_PLANS_NAMESPACE } from "./keys.ts";
import {
	STACK_SLICE_LEDGER_SCHEMA,
	validateSliceLedgerFrontmatter,
	type SliceLedgerFrontmatter,
} from "./schemas.ts";

export type SliceLedgerDocument = SliceLedgerFrontmatter & {
	body: string;
	content: string;
};

export type SliceLedgerPointer = {
	planBranch: string;
	planKey: string;
	planSha256: string;
};

export function formatSliceLedger(pointer: SliceLedgerPointer): string {
	return `---
schema: ${STACK_SLICE_LEDGER_SCHEMA}
plan:
  branch: ${pointer.planBranch}
  namespace: ${STACK_PLANS_NAMESPACE}
  key: ${pointer.planKey}
  sha256: ${pointer.planSha256}
---

This slice was started from the canonical Branch Memory stack plan above.
Completion is inferred from the derived handoff artifact on this branch.
`;
}

export function parseSliceLedgerMarkdown(content: string): SliceLedgerDocument {
	const { frontmatterText, body } = extractFrontmatter(content);
	const frontmatter = validateSliceLedgerFrontmatter(frontmatterText);
	return {
		...frontmatter,
		body,
		content,
	};
}
