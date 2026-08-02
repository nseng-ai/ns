import { describe, expect, test } from "vitest";

import { type PointCatalog, type PointDefinition } from "../../src/project-config/points.ts";
import {
	resolvePromptPointContent,
	type PromptPointContentReadResult,
	type PromptPointContentReader,
	type ResolvedPromptPointContent,
} from "../../src/project-config/prompt-content.ts";

describe("prompt point content resolution", () => {
	const pointId = "example.prompt";
	const configuredResolved = {
		source: { type: "ns.toml", pointId, path: "custom/prompt.md" },
		path: "/repo/custom/prompt.md",
		label: "ns.toml prompt custom/prompt.md",
	} as const satisfies ResolvedPromptPointContent;

	test.each<{
		name: string;
		catalog: PointCatalog;
		content: string;
		expectedResolved: ResolvedPromptPointContent;
	}>([
		{
			name: "descriptor default with exact content preserved",
			catalog: promptCatalog({
				definition: {
					id: pointId,
					accepts: "prompt",
					cardinality: "one",
					defaultPath: "../prompts/default.md",
					manifestPath: "/extension/src/ns/extension.ts",
				},
			}),
			content: "  Keep both edges.  \n",
			expectedResolved: {
				source: {
					type: "default",
					pointId,
					path: "../prompts/default.md",
					manifestPath: "/extension/src/ns/extension.ts",
				},
				path: "/extension/src/prompts/default.md",
				label: "manifest default ../prompts/default.md",
			},
		},
		{
			name: "ns.toml prompt relative to the repository",
			catalog: promptCatalog({ configuredPath: "custom/prompt.md" }),
			content: "Configured",
			expectedResolved: configuredResolved,
		},
		{
			name: "conventional prompt",
			catalog: promptCatalog({ conventionalPath: `.ns/prompts/${pointId}.md` }),
			content: "Conventional",
			expectedResolved: {
				source: { type: "conventional", pointId, path: `.ns/prompts/${pointId}.md` },
				path: `/repo/.ns/prompts/${pointId}.md`,
				label: `.ns/prompts/${pointId}.md`,
			},
		},
		{
			name: "selected relative env prompt",
			catalog: promptCatalog({ envPath: "dev/prompt.md" }),
			content: "Development",
			expectedResolved: {
				source: { type: "env", pointId, envVar: "EXAMPLE_PROMPT", path: "dev/prompt.md" },
				path: "/repo/dev/prompt.md",
				label: "env EXAMPLE_PROMPT",
			},
		},
		{
			name: "selected absolute env prompt",
			catalog: promptCatalog({ envPath: "/tmp/prompt.md" }),
			content: "Development",
			expectedResolved: {
				source: { type: "env", pointId, envVar: "EXAMPLE_PROMPT", path: "/tmp/prompt.md" },
				path: "/tmp/prompt.md",
				label: "env EXAMPLE_PROMPT",
			},
		},
	])(
		"resolves the $name with grouped provenance and one read",
		async ({ catalog, content, expectedResolved }) => {
			const reader = new FakePromptPointContentReader({
				[expectedResolved.path]: { ok: true, content },
			});

			const result = await resolvePromptPointContent({
				repoRoot: "/repo",
				catalog,
				pointId,
				reader,
			});

			expect(result).toEqual({ ok: true, content, resolved: expectedResolved });
			expect(result).not.toHaveProperty("pointId");
			expect(reader.reads).toEqual([expectedResolved.path]);
		},
	);

	test("classifies a missing point source without reading", async () => {
		const reader = new FakePromptPointContentReader({});

		const result = await resolvePromptPointContent({
			repoRoot: "/repo",
			catalog: promptCatalog({}),
			pointId,
			reader,
		});

		expect(result).toEqual({
			ok: false,
			reason: "missing-source",
			message: expect.stringContaining(pointId),
		});
		expect(reader.reads).toEqual([]);
	});

	test.each<{
		name: string;
		readResult: PromptPointContentReadResult;
		expectedReason: "missing-file" | "unreadable" | "empty";
		expectedMessageFacts: readonly string[];
	}>([
		{
			name: "missing-file read without reader detail",
			readResult: { ok: false, reason: "missing" },
			expectedReason: "missing-file",
			expectedMessageFacts: [configuredResolved.label, configuredResolved.path, "missing"],
		},
		{
			name: "missing-file read with preserved reader detail",
			readResult: { ok: false, reason: "missing", message: "ENOENT: no such file" },
			expectedReason: "missing-file",
			expectedMessageFacts: [
				configuredResolved.label,
				configuredResolved.path,
				"ENOENT: no such file",
			],
		},
		{
			name: "unreadable read with preserved reader detail",
			readResult: { ok: false, reason: "unreadable", message: "permission denied" },
			expectedReason: "unreadable",
			expectedMessageFacts: [
				configuredResolved.label,
				configuredResolved.path,
				"permission denied",
			],
		},
		{
			name: "whitespace-only content read",
			readResult: { ok: true, content: " \n\t " },
			expectedReason: "empty",
			expectedMessageFacts: [configuredResolved.label, configuredResolved.path, "is empty"],
		},
	])(
		"classifies the $name with grouped provenance and one factual message",
		async ({ readResult, expectedReason, expectedMessageFacts }) => {
			const reader = new FakePromptPointContentReader({
				[configuredResolved.path]: readResult,
			});

			const result = await resolvePromptPointContent({
				repoRoot: "/repo",
				catalog: promptCatalog({ configuredPath: "custom/prompt.md" }),
				pointId,
				reader,
			});

			expect(result).toEqual({
				ok: false,
				reason: expectedReason,
				resolved: configuredResolved,
				message: expect.any(String),
			});
			expect(result).not.toHaveProperty("pointId");
			if (result.ok) throw new Error("Expected a failed content resolution");
			for (const fact of expectedMessageFacts) {
				expect(result.message).toContain(fact);
			}
			expect(reader.reads).toEqual([configuredResolved.path]);
		},
	);
});

function promptCatalog(request: {
	definition?: PointDefinition;
	configuredPath?: string;
	conventionalPath?: string;
	envPath?: string;
}) {
	const definition =
		request.definition ??
		({ id: "example.prompt", accepts: "prompt", cardinality: "one" } satisfies PointDefinition);
	const installations = [
		...(request.envPath === undefined
			? []
			: [
					{
						source: "env-prompt" as const,
						pointId: definition.id,
						envVar: "EXAMPLE_PROMPT",
						path: request.envPath,
					},
				]),
		...(request.configuredPath === undefined
			? []
			: [
					{
						source: "ns.toml" as const,
						installation: {
							pointId: definition.id,
							accepts: "prompt" as const,
							path: request.configuredPath,
						},
					},
				]),
		...(request.conventionalPath === undefined
			? []
			: [
					{
						source: "conventional-prompt" as const,
						pointId: definition.id,
						path: request.conventionalPath,
					},
				]),
	];
	return { entries: [{ definition, installations }], diagnostics: [] };
}

class FakePromptPointContentReader implements PromptPointContentReader {
	readonly #results: ReadonlyMap<string, PromptPointContentReadResult>;
	readonly reads: string[] = [];

	constructor(results: Record<string, PromptPointContentReadResult>) {
		this.#results = new Map(Object.entries(results));
	}

	async readTextFile(path: string): Promise<PromptPointContentReadResult> {
		this.reads.push(path);
		return this.#results.get(path) ?? { ok: false, reason: "missing" };
	}
}
