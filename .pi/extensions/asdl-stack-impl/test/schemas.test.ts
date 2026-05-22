import { describe, expect, test } from "bun:test";

import { extractFrontmatter } from "../src/frontmatter.ts";
import { deriveHandoffKey, deriveLedgerKey, derivePlanKey } from "../src/keys.ts";
import { parseSliceLedgerMarkdown } from "../src/ledger.ts";
import { parseStackPlanMarkdown } from "../src/plan.ts";

const VALID_PLAN = `---
schema: asdl.stack-plan.v1
objective: asdl-stack-impl-extension
planned_branches:
  - asdl-stack-impl-extension/extension-skeleton
  - asdl-stack-impl-extension/plan-storage
---

## Stack

- asdl-stack-impl-extension/extension-skeleton
- asdl-stack-impl-extension/plan-storage
`;

const VALID_LEDGER = `---
schema: asdl.stack-slice-ledger.v1
plan:
  branch: add-asdl-stack-impl-pi-extension-skeleton-and-schem
  namespace: stack-plans
  key: asdl-stack-impl-extension.md
  sha256: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
---

This slice was started from the canonical Branch Memory stack plan above.
`;

describe("frontmatter extraction", () => {
	test("extracts frontmatter and leaves the body unparsed", () => {
		expect(extractFrontmatter(VALID_PLAN)).toEqual({
			frontmatterText:
				"schema: asdl.stack-plan.v1\nobjective: asdl-stack-impl-extension\nplanned_branches:\n  - asdl-stack-impl-extension/extension-skeleton\n  - asdl-stack-impl-extension/plan-storage\n",
			body:
				"\n## Stack\n\n- asdl-stack-impl-extension/extension-skeleton\n- asdl-stack-impl-extension/plan-storage\n",
		});
	});

	test("rejects missing frontmatter", () => {
		expect(() => extractFrontmatter("# No frontmatter\n")).toThrow(/must start/);
	});

	test("rejects unclosed frontmatter", () => {
		expect(() => extractFrontmatter("---\nschema: asdl.stack-plan.v1\n")).toThrow(/unclosed/);
	});
});

describe("stack plan validation", () => {
	test("accepts a valid stack plan", () => {
		const plan = parseStackPlanMarkdown(VALID_PLAN);
		expect(plan.objective).toBe("asdl-stack-impl-extension");
		expect(plan.plannedBranches).toEqual([
			"asdl-stack-impl-extension/extension-skeleton",
			"asdl-stack-impl-extension/plan-storage",
		]);
		expect(plan.sha256).toMatch(/^[0-9a-f]{64}$/);
	});

	test("rejects invalid YAML", () => {
		expect(() =>
			parseStackPlanMarkdown(`---
schema: [
---

asdl-stack-impl-extension/extension-skeleton
`),
		).toThrow(/Invalid YAML/);
	});

	test("rejects missing or incorrect schema", () => {
		expect(() =>
			parseStackPlanMarkdown(`---
schema: other.v1
objective: asdl-stack-impl-extension
planned_branches:
  - asdl-stack-impl-extension/extension-skeleton
---

asdl-stack-impl-extension/extension-skeleton
`),
		).toThrow(/schema must be exactly/);
	});

	test("rejects invalid objective slugs", () => {
		expect(() =>
			parseStackPlanMarkdown(`---
schema: asdl.stack-plan.v1
objective: bad/objective
planned_branches:
  - asdl-stack-impl-extension/extension-skeleton
---

asdl-stack-impl-extension/extension-skeleton
`),
		).toThrow(/single key segment/);
	});

	test("rejects duplicate planned branches", () => {
		expect(() =>
			parseStackPlanMarkdown(`---
schema: asdl.stack-plan.v1
objective: asdl-stack-impl-extension
planned_branches:
  - asdl-stack-impl-extension/extension-skeleton
  - asdl-stack-impl-extension/extension-skeleton
---

asdl-stack-impl-extension/extension-skeleton
`),
		).toThrow(/duplicate/);
	});

	test("rejects empty planned branches", () => {
		expect(() =>
			parseStackPlanMarkdown(`---
schema: asdl.stack-plan.v1
objective: asdl-stack-impl-extension
planned_branches:
  - ""
---

empty
`),
		).toThrow(/non-empty/);
	});

	test("rejects branches containing the key escape literal", () => {
		expect(() =>
			parseStackPlanMarkdown(`---
schema: asdl.stack-plan.v1
objective: asdl-stack-impl-extension
planned_branches:
  - asdl-stack-impl-extension---extension-skeleton
---

asdl-stack-impl-extension---extension-skeleton
`),
		).toThrow(/literal `---`/);
	});

	test("requires every planned branch to appear in the body", () => {
		expect(() =>
			parseStackPlanMarkdown(`---
schema: asdl.stack-plan.v1
objective: asdl-stack-impl-extension
planned_branches:
  - asdl-stack-impl-extension/extension-skeleton
---

This body names no branch.
`),
		).toThrow(/appear literally/);
	});
});

describe("slice ledger validation", () => {
	test("accepts a valid pointer ledger", () => {
		const ledger = parseSliceLedgerMarkdown(VALID_LEDGER);
		expect(ledger.plan.branch).toBe("add-asdl-stack-impl-pi-extension-skeleton-and-schem");
		expect(ledger.plan.namespace).toBe("stack-plans");
	});

	test("rejects invalid ledger hashes", () => {
		expect(() =>
			parseSliceLedgerMarkdown(`---
schema: asdl.stack-slice-ledger.v1
plan:
  branch: add-asdl-stack-impl-pi-extension-skeleton-and-schem
  namespace: stack-plans
  key: asdl-stack-impl-extension.md
  sha256: ABC
---

body
`),
		).toThrow(/SHA-256/);
	});
});

describe("Branch Memory key derivation", () => {
	test("derives plan, ledger, and handoff keys with slash escaping", () => {
		expect(derivePlanKey("asdl-stack-impl-extension")).toEqual({
			namespace: "stack-plans",
			key: "asdl-stack-impl-extension.md",
		});
		expect(deriveLedgerKey("asdl-stack-impl-extension", "topic/branch")).toEqual({
			namespace: "stack-impls",
			key: "asdl-stack-impl-extension/topic---branch.md",
		});
		expect(deriveHandoffKey("asdl-stack-impl-extension", "topic/branch")).toEqual({
			namespace: "session-artifacts",
			key: "handoffs/asdl-stack-impl-extension-topic---branch.md",
		});
	});

	test("rejects branch names containing the escape literal", () => {
		expect(() => deriveLedgerKey("asdl-stack-impl-extension", "topic---branch")).toThrow(
			/literal `---`/,
		);
	});
});
