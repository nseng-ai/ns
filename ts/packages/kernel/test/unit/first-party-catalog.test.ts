import { describe, expect, test } from "vitest";

import { commandKey } from "../../src/extensions/command-registry.ts";
import { firstPartyCommandCatalog } from "../../src/extensions/first-party-catalog.ts";

describe("first-party command catalog", () => {
	test("bundles Objective command routes without private CCC coupling", () => {
		const routes = firstPartyCommandCatalog.map((entry) =>
			commandKey({
				group: entry.group,
				name: entry.name,
				...(entry.path === undefined ? {} : { segments: entry.path }),
			}),
		);

		expect(routes).toEqual([
			"objective/list",
			"objective/check",
			"objective/archive",
			"objective/exec-list-candidates",
			"objective/exec-load-orientations",
			"objective/exec-read-objective",
			"objective/exec-runner-begin",
			"objective/exec-runner-finish",
			"objective/exec-runner-step",
			"objective/exec-runner-subagent-usage",
			"objective/exec-tracking-gate",
		]);
		expect(firstPartyCommandCatalog.map((entry) => entry.moduleSpecifier)).toEqual(
			routes.map((route) => `@ns/objective/ns/commands/${route.split("/").at(-1)}`),
		);
		expect(JSON.stringify(firstPartyCommandCatalog)).not.toContain("@ns/ccc/");
	});
});
