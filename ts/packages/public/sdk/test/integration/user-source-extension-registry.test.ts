import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { loadNsCommandCatalog, loadSelectedNsCommand } from "../../src/extensions/registry.ts";
import {
	createExtensionRegistryWorkspace,
	writeUserConfig,
	writeWorkspaceFile,
} from "../helpers/extension-workspace.ts";

interface SourceExtensionExpectation {
	readonly directoryName: string;
	readonly packageName: string;
	readonly commandKeys: readonly string[];
}

const SOURCE_EXTENSIONS = [
	{
		directoryName: "branch-context",
		packageName: "@nseng-ai/branch-context",
		commandKeys: [
			"branch-context/exec/attach",
			"branch-context/exec/check",
			"branch-context/exec/delete",
			"branch-context/exec/from-plan",
			"branch-context/exec/list",
			"branch-context/exec/load",
		],
	},
	{
		directoryName: "flow",
		packageName: "@nseng-ai/flow",
		commandKeys: [
			"flow/autobranch",
			"flow/autoslot",
			"flow/branch-latest-commit",
			"flow/changes",
			"flow/cp",
			"flow/exec/read-graphite-branch-metadata",
			"flow/generate-pr-inventory",
			"flow/land",
			"flow/pull-trunk",
			"flow/push",
			"flow/squash-stack",
			"flow/submit",
		],
	},
	{
		directoryName: "handoffs",
		packageName: "@nseng-ai/handoffs",
		commandKeys: [
			"handoff/create",
			"handoff/delete",
			"handoff/exec/match",
			"handoff/gc",
			"handoff/list",
			"handoff/pickup",
		],
	},
	{
		directoryName: "herdr",
		packageName: "@nseng-ai/herdr",
		commandKeys: ["herdr/exec/handoff-tab/launch"],
	},
	{
		directoryName: "objectives",
		packageName: "@nseng-ai/objectives",
		commandKeys: [
			"objective/check",
			"objective/exec/list-candidates",
			"objective/exec/load-orientations",
			"objective/exec/publication-bind",
			"objective/exec/publication-publish",
			"objective/exec/read-objective",
			"objective/exec/runner-begin",
			"objective/exec/runner-finish",
			"objective/exec/runner-subagent-usage",
			"objective/exec/staleness-check",
			"objective/list",
			"objective/show",
		],
	},
	{
		directoryName: "pr-feedback",
		packageName: "@nseng-ai/pr-feedback",
		commandKeys: [
			"address/exec/branch-pr",
			"address/exec/branch-pr-checks",
			"address/exec/close-review-threads",
			"address/exec/download-feedback",
			"address/exec/map-branch-prs",
			"address/exec/open-prs",
			"address/exec/pr-checks",
			"address/exec/pr-details",
			"address/exec/pr-discussion-comments",
			"address/exec/pr-review-threads",
			"address/exec/pr-reviews",
			"address/exec/reply-review-thread",
			"address/exec/resolve-review-thread",
			"address/exec/wait-for-checks",
		],
	},
	{
		directoryName: "reviews",
		packageName: "@nseng-ai/reviews",
		commandKeys: [
			"reviews/exec/publish-findings",
			"reviews/exec/record-findings",
			"reviews/list",
			"reviews/log",
			"reviews/ls",
			"reviews/run",
		],
	},
	{
		directoryName: "slots",
		packageName: "@nseng-ai/slots",
		commandKeys: [
			"slot/checkout",
			"slot/claim",
			"slot/co",
			"slot/foreach",
			"slot/free",
			"slot/gc",
			"slot/goto",
			"slot/gt/down",
			"slot/gt/exec/backup-refs",
			"slot/gt/exec/descendants-report",
			"slot/gt/exec/quiescence",
			"slot/gt/exec/restack-preflight",
			"slot/gt/exec/stack-branches",
			"slot/gt/exec/stack-map-branches",
			"slot/gt/free-stack",
			"slot/gt/up",
			"slot/init",
			"slot/list",
			"slot/ls",
			"slot/provision/apply",
			"slot/provision/import",
			"slot/resize",
			"slot/shell/install",
			"slot/shell/show",
		],
	},
] as const satisfies readonly SourceExtensionExpectation[];

describe("user source extension registry", () => {
	test("keeps the checkout-declared Skill Exposure package without its source-development duplicate", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		const repoRoot = fileURLToPath(new URL("../../../../../..", import.meta.url));

		const catalog = await loadNsCommandCatalog({
			cwd: repoRoot,
			homeDir: workspace.homeDir,
		});
		const skillExposureCandidates = [...catalog.candidates].filter(([key]) =>
			key.startsWith("skill-exposure/"),
		);

		expect(
			catalog.diagnostics.filter(
				(diagnostic) =>
					diagnostic.code === "extension_package_lower_level_conflict" &&
					"packageName" in diagnostic &&
					diagnostic.packageName === "@nseng-ai/skill-exposure",
			),
		).toEqual([]);
		expect(catalog.extensionPackageNames.has("@nseng-ai/skill-exposure")).toBe(true);
		expect(skillExposureCandidates.map(([key]) => key)).toEqual([
			"skill-exposure/apply",
			"skill-exposure/check",
			"skill-exposure/show",
		]);
		expect(
			skillExposureCandidates.every(([_key, candidate]) => candidate.source.level === "project"),
		).toBe(true);
	});

	test.each(SOURCE_EXTENSIONS)(
		"loads every $packageName command without exposing Skill Exposure",
		async ({ directoryName, packageName, commandKeys }) => {
			const workspace = await createExtensionRegistryWorkspace();
			const packageRoot = fileURLToPath(
				new URL(`../../../../incubating/extensions/${directoryName}/`, import.meta.url),
			);
			writeUserConfig(
				workspace,
				`supported_harnesses = ["pi"]\nextensions = [${JSON.stringify(packageRoot)}]\n`,
			);

			const catalog = await loadNsCommandCatalog({
				cwd: workspace.cwd,
				homeDir: workspace.homeDir,
				env: { NS_HARNESS: "pi" },
			});
			const userCandidates = [...catalog.candidates].filter(
				([_key, candidate]) => candidate.source.level === "user",
			);

			expect(catalog.diagnostics).toEqual([]);
			expect([...catalog.extensionPackageNames]).toEqual([packageName]);
			expect([
				...new Set(
					userCandidates.map(([_key, candidate]) =>
						"packageName" in candidate ? candidate.packageName : undefined,
					),
				),
			]).toEqual([packageName]);
			expect(userCandidates.map(([key]) => key)).toEqual(commandKeys);
			expect(
				[...catalog.candidates.keys()].filter((key) => key.startsWith("skill-exposure/")),
			).toEqual([]);

			const failures: string[] = [];
			for (const [key, candidate] of userCandidates) {
				const loaded = await loadSelectedNsCommand(candidate);
				if (!loaded.ok) failures.push(`${key}: ${loaded.diagnostic.message}`);
			}
			expect(failures).toEqual([]);
		},
	);

	test("loads Skill Exposure only when explicitly declared by the project", async () => {
		const workspace = await createExtensionRegistryWorkspace();
		const packageRoot = fileURLToPath(
			new URL("../../../../incubating/extensions/skill-exposure/", import.meta.url),
		);
		writeWorkspaceFile(
			`${workspace.cwd}/ns.toml`,
			`extensions = [${JSON.stringify(packageRoot)}]\n`,
		);

		const catalog = await loadNsCommandCatalog({
			cwd: workspace.cwd,
			homeDir: workspace.homeDir,
		});
		const projectCandidates = [...catalog.candidates].filter(
			([_key, candidate]) => candidate.source.level === "project",
		);

		expect(catalog.diagnostics).toEqual([]);
		expect([...catalog.extensionPackageNames]).toEqual(["@nseng-ai/skill-exposure"]);
		expect(projectCandidates.map(([key]) => key)).toEqual([
			"skill-exposure/apply",
			"skill-exposure/check",
			"skill-exposure/show",
		]);
		expect(
			projectCandidates.every(([_key, candidate]) => candidate.source.level === "project"),
		).toBe(true);
	});
});
