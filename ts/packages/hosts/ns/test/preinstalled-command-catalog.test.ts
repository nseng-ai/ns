import { describe, expect, test } from "vitest";

import { NS_BUILT_IN_HELP_GROUP } from "@nseng-ai/sdk/cli";

import {
	loadPreinstalledNsCommandCatalog,
	preinstalledExtensionRegistrations,
} from "../src/cli/preinstalled-command-catalog.ts";

const expectedPaths = [
	"init",
	"extension/install",
	"extension/list",
	"extension/update",
	"extension/uninstall",
	"skills/list",
	"skills/path",
	"skills/install",
	"update",
] as const;

describe("preinstalled ns command catalog", () => {
	test("registers exactly the two host-owned extension descriptors", () => {
		expect(preinstalledExtensionRegistrations.map(({ packageName }) => packageName)).toEqual([
			"@nseng-ai/ns",
			"@nseng-ai/ns",
		]);
		expect(preinstalledExtensionRegistrations.map(({ displayPath }) => displayPath)).toEqual([
			"@nseng-ai/ns/init/ns-extension",
			"@nseng-ai/ns/harness-artifacts/ns-extension",
		]);
	});

	test("derives the complete lazy command inventory without loading commands", () => {
		const catalog = loadPreinstalledNsCommandCatalog();

		expect(catalog.extensionPackageNames).toEqual(["@nseng-ai/ns", "@nseng-ai/ns"]);
		expect(catalog.entries.map(({ path }) => path?.join("/"))).toEqual(expectedPaths);
		expect(
			catalog.entries.map((entry) => ("displayPath" in entry ? entry.displayPath : undefined)),
		).toEqual([
			"@nseng-ai/ns/init/ns-extension#init",
			"@nseng-ai/ns/init/ns-extension#extension/install",
			"@nseng-ai/ns/init/ns-extension#extension/list",
			"@nseng-ai/ns/init/ns-extension#extension/update",
			"@nseng-ai/ns/init/ns-extension#extension/uninstall",
			"@nseng-ai/ns/harness-artifacts/ns-extension#skills/list",
			"@nseng-ai/ns/harness-artifacts/ns-extension#skills/path",
			"@nseng-ai/ns/harness-artifacts/ns-extension#skills/install",
			"@nseng-ai/ns/harness-artifacts/ns-extension#update",
		]);
		expect(catalog.entries.every(({ load }) => typeof load === "function")).toBe(true);
		expect(
			catalog.entries.every(({ hasStaticCommandInfo }) => hasStaticCommandInfo === false),
		).toBe(true);
	});

	test("preserves host grouping metadata and excludes Objective commands", () => {
		const entries = loadPreinstalledNsCommandCatalog().entries;

		expect(
			entries.map(({ path, group, groupDescription, helpGroup, hiddenAncestorKeys }) => ({
				path: path?.join("/"),
				group,
				groupDescription,
				helpGroup,
				hiddenAncestorKeys,
			})),
		).toEqual([
			{
				path: "init",
				group: undefined,
				groupDescription: undefined,
				helpGroup: NS_BUILT_IN_HELP_GROUP,
				hiddenAncestorKeys: [],
			},
			...expectedPaths.slice(1, 5).map((path) => ({
				path,
				group: "extension",
				groupDescription: "Activate ns in a repository.",
				helpGroup: NS_BUILT_IN_HELP_GROUP,
				hiddenAncestorKeys: [],
			})),
			...expectedPaths.slice(5, 8).map((path) => ({
				path,
				group: "skills",
				groupDescription: "List and provision ns-owned skills into assistant harnesses.",
				helpGroup: NS_BUILT_IN_HELP_GROUP,
				hiddenAncestorKeys: [],
			})),
			{
				path: "update",
				group: undefined,
				groupDescription: undefined,
				helpGroup: NS_BUILT_IN_HELP_GROUP,
				hiddenAncestorKeys: [],
			},
		]);
		expect(entries.some(({ path }) => path?.includes("objective") === true)).toBe(false);
	});
});
