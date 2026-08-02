import { describe, expect, test } from "vitest";

import type { ProjectConfigGateway } from "@nseng-ai/sdk/project-config/points";
import objectivesExtension, {
	objectivesExtensionDescriptorSource,
} from "@nseng-ai/objectives/ns-extension";
import { validateExtensionDescriptor } from "@nseng-ai/sdk";

import { createObjectiveAutorunPrTitleTemplateResolver } from "../../../src/publication/pr-title-source.ts";
import { OBJECTIVE_AUTORUN_PR_TITLE_TEXT_CONTENT_ENV_VAR } from "../../../src/publication/pr-title.ts";

const DEFAULT_TEMPLATE = "[obj:{{objectiveSlug}}] [autorun:{{autorunOrdinal}}] {{existingTitle}}";

class InMemoryConfigGateway implements ProjectConfigGateway {
	readonly #files: ReadonlyMap<string, string>;

	constructor(files: Record<string, string>) {
		this.#files = new Map(Object.entries(files));
	}

	readTextFile(request: { repoRoot: string; relativePath: string }) {
		const text = this.#files.get(request.relativePath);
		if (text === undefined) return { type: "missing" } as const;
		return { type: "found", text } as const;
	}

	pathExists(request: { repoRoot: string; relativePath: string }) {
		return this.#files.has(request.relativePath)
			? ({ type: "present" } as const)
			: ({ type: "missing" } as const);
	}
}

function resolver(options: {
	files?: Record<string, string>;
	templates?: Record<string, string>;
	env?: Record<string, string | undefined>;
}) {
	return createObjectiveAutorunPrTitleTemplateResolver({
		repoRoot: "/repo",
		descriptorSource: objectivesExtensionDescriptorSource,
		env: options.env ?? {},
		configGateway: new InMemoryConfigGateway(options.files ?? {}),
		readTextFile: async (path) => {
			const content = options.templates?.[path];
			if (content === undefined) return { ok: false, message: "ENOENT" };
			return { ok: true, content };
		},
	});
}

describe("objective.autorun.pr-title template resolution", () => {
	test("resolves the packaged default through the preferred descriptor with real file reads", async () => {
		expect(validateExtensionDescriptor(objectivesExtension)).toMatchObject({ ok: true });
		const templates = createObjectiveAutorunPrTitleTemplateResolver({
			repoRoot: "/repo",
			descriptorSource: objectivesExtensionDescriptorSource,
			env: {},
			configGateway: new InMemoryConfigGateway({}),
		});

		const result = await templates.resolveTemplate();

		expect(result).toEqual({
			type: "resolved",
			template: DEFAULT_TEMPLATE,
			source: {
				type: "default",
				label: "manifest default ../publication/templates/autorun-pr-title-default.txt",
			},
		});
	});

	test("prefers a repository ns.toml installation over the packaged default", async () => {
		const result = await resolver({
			files: {
				"ns.toml": '[points]\n"objective.autorun.pr-title" = "custom/title.txt"\n',
			},
			templates: {
				"/repo/custom/title.txt": "{{objectiveSlug}} {{autorunOrdinal}} {{existingTitle}}\n",
			},
		}).resolveTemplate();

		expect(result).toEqual({
			type: "resolved",
			template: "{{objectiveSlug}} {{autorunOrdinal}} {{existingTitle}}",
			source: { type: "ns.toml", label: "ns.toml text-content custom/title.txt" },
		});
	});

	test("resolves the conventional .ns/text-content file", async () => {
		const result = await resolver({
			files: { ".ns/text-content/objective.autorun.pr-title.txt": "conventional" },
			templates: {
				"/repo/.ns/text-content/objective.autorun.pr-title.txt": `${DEFAULT_TEMPLATE}\n`,
			},
		}).resolveTemplate();

		expect(result).toEqual({
			type: "resolved",
			template: DEFAULT_TEMPLATE,
			source: {
				type: "conventional",
				label: ".ns/text-content/objective.autorun.pr-title.txt",
			},
		});
	});

	test("uses the development env override as the highest-precedence source", async () => {
		const result = await resolver({
			files: {
				"ns.toml": '[points]\n"objective.autorun.pr-title" = "custom/title.txt"\n',
			},
			env: { [OBJECTIVE_AUTORUN_PR_TITLE_TEXT_CONTENT_ENV_VAR]: "dev.txt" },
			templates: { "/repo/dev.txt": `${DEFAULT_TEMPLATE}\n` },
		}).resolveTemplate();

		expect(OBJECTIVE_AUTORUN_PR_TITLE_TEXT_CONTENT_ENV_VAR).toBe(
			"NS_OBJECTIVE_AUTORUN_PR_TITLE_TEXT_CONTENT",
		);
		expect(result).toEqual({
			type: "resolved",
			template: DEFAULT_TEMPLATE,
			source: {
				type: "env",
				label: "env NS_OBJECTIVE_AUTORUN_PR_TITLE_TEXT_CONTENT text-content dev.txt",
			},
		});
	});

	test("fails closed on an unreadable or empty selected source instead of falling back", async () => {
		const unreadable = await resolver({
			files: {
				"ns.toml": '[points]\n"objective.autorun.pr-title" = "custom/title.txt"\n',
			},
			templates: {},
		}).resolveTemplate();
		expect(unreadable).toMatchObject({ type: "refused", code: "template-source-unreadable" });

		const empty = await resolver({
			files: {
				"ns.toml": '[points]\n"objective.autorun.pr-title" = "custom/title.txt"\n',
			},
			templates: { "/repo/custom/title.txt": "\n" },
		}).resolveTemplate();
		expect(empty).toMatchObject({ type: "refused", code: "template-source-empty" });
	});
});
