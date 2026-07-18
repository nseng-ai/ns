import { parseModelRef, type ParsedModelRef } from "@nseng-ai/foundation/model-slug";
import {
	getProjectConfigSetting,
	loadEffectiveProjectConfig,
	nodeProjectConfigGateway,
	type ProjectConfigGateway,
	type SettingsSchema,
} from "@nseng-ai/sdk/project-config/points";
import { z } from "zod";

import { registerCommandWithImmediateAck } from "../../commands/ack.ts";
import { notifyCommandUi, type NotifiableCommandContext } from "../../commands/helpers.ts";
import {
	resolveSkillLookupProjectRoot,
	type SkillLookupPathStat,
} from "../../kit/skills/lookup.ts";

export const MODEL_SHORTCUT_CATALOG = [
	{
		key: "fable",
		command: "model:fable",
		defaultRef: "vercel-ai-gateway/anthropic/claude-fable-5",
	},
	{
		key: "sonnet",
		command: "model:sonnet",
		defaultRef: "vercel-ai-gateway/anthropic/claude-sonnet-4.5",
	},
	{
		key: "spud",
		command: "model:spud",
		defaultRef: "vercel-ai-gateway/openai/gpt-5.6-sol",
	},
	{
		key: "sol",
		command: "model:sol",
		defaultRef: "vercel-ai-gateway/openai/gpt-5.6-sol",
	},
	{
		key: "terra",
		command: "model:terra",
		defaultRef: "vercel-ai-gateway/openai/gpt-5.6-terra",
	},
	{
		key: "luna",
		command: "model:luna",
		defaultRef: "vercel-ai-gateway/openai/gpt-5.6-luna",
	},
	{
		key: "gpt-mini",
		command: "model:gpt-mini",
		defaultRef: "vercel-ai-gateway/openai/gpt-5.4-mini",
	},
	{
		key: "gemini-pro",
		command: "model:gemini-pro",
		defaultRef: "vercel-ai-gateway/google/gemini-3.1-pro-preview",
	},
	{
		key: "gemini-flash",
		command: "model:gemini-flash",
		defaultRef: "vercel-ai-gateway/google/gemini-3.5-flash",
	},
	{
		key: "haiku",
		command: "model:haiku",
		defaultRef: "vercel-ai-gateway/anthropic/claude-haiku-4.5",
	},
	{
		key: "opus",
		command: "model:opus",
		defaultRef: "vercel-ai-gateway/anthropic/claude-opus-4.8",
	},
] as const satisfies readonly ModelShortcutCatalogEntry[];

export interface ModelShortcutCatalogEntry {
	readonly key: string;
	readonly command: string;
	readonly defaultRef: string;
}

interface EffectiveModelShortcut extends ModelShortcutCatalogEntry, ParsedModelRef {
	readonly ref: string;
}

interface ModelInfo {
	provider: string;
	id: string;
}

interface ModelRegistry {
	find(provider: string, modelId: string): ModelInfo | undefined;
}

interface CommandContext extends NotifiableCommandContext {
	modelRegistry: ModelRegistry;
}

export interface ExtensionAPI {
	registerCommand(
		name: string,
		options: {
			description?: string;
			handler(args: string, ctx: CommandContext): Promise<void> | void;
		},
	): void;
	setModel(model: ModelInfo): Promise<boolean>;
}

export interface ModelShortcutExtensionDependencies {
	readonly cwd?: string;
	readonly projectConfigGateway?: ProjectConfigGateway;
	readonly statPath?: (path: string) => Promise<SkillLookupPathStat>;
	readonly resolveRepoRoot?: (options: {
		cwd: string;
		statPath?: (path: string) => Promise<SkillLookupPathStat>;
	}) => Promise<string>;
}

const qualifiedModelRefSchema = z
	.string()
	.trim()
	.min(1)
	.refine((value) => parseModelRef(value) !== undefined, {
		message: "must be a qualified provider/model reference (provider/model-id)",
	});
const modelShortcutConfigSchema = z.strictObject({
	fable: qualifiedModelRefSchema.optional(),
	sonnet: qualifiedModelRefSchema.optional(),
	spud: qualifiedModelRefSchema.optional(),
	sol: qualifiedModelRefSchema.optional(),
	terra: qualifiedModelRefSchema.optional(),
	luna: qualifiedModelRefSchema.optional(),
	"gpt-mini": qualifiedModelRefSchema.optional(),
	"gemini-pro": qualifiedModelRefSchema.optional(),
	"gemini-flash": qualifiedModelRefSchema.optional(),
	haiku: qualifiedModelRefSchema.optional(),
	opus: qualifiedModelRefSchema.optional(),
});
type ModelShortcutConfig = z.infer<typeof modelShortcutConfigSchema>;
const modelShortcutSettingsSchema = {
	path: ["pi", "model-shortcuts"] as const,
	schema: modelShortcutConfigSchema,
	invalidMessage: ({ pathLabel }) =>
		`${pathLabel}: [pi.model-shortcuts] must contain only known shortcut keys with qualified provider/model references.`,
} satisfies SettingsSchema<ModelShortcutConfig>;

export default async function modelShortcutExtension(
	pi: ExtensionAPI,
	dependencies: ModelShortcutExtensionDependencies = {},
): Promise<void> {
	const resolveRepoRoot = dependencies.resolveRepoRoot ?? resolveSkillLookupProjectRoot;
	const repoRoot = await resolveRepoRoot({
		cwd: dependencies.cwd ?? process.cwd(),
		...(dependencies.statPath === undefined ? {} : { statPath: dependencies.statPath }),
	});
	const loaded = loadEffectiveProjectConfig({
		repoRoot,
		gateway: dependencies.projectConfigGateway ?? nodeProjectConfigGateway,
		pointDefinitions: [],
		settingsSchemas: [modelShortcutSettingsSchema],
	});
	const configDiagnostics = loaded.diagnostics.filter(
		(diagnostic) => !diagnostic.code.startsWith("point"),
	);
	if (configDiagnostics.length > 0 || loaded.config === undefined) {
		throw new Error(configDiagnostics.map((diagnostic) => diagnostic.message).join("\n"));
	}

	const configured = getProjectConfigSetting(loaded.config, modelShortcutSettingsSchema) ?? {};
	const shortcuts = MODEL_SHORTCUT_CATALOG.map((entry) => resolveShortcut(entry, configured));

	// Config and every effective reference are validated before exposing any command.
	for (const shortcut of shortcuts) {
		registerCommandWithImmediateAck({
			host: pi,
			commandName: shortcut.command,
			commandDefinition: {
				description: `Switch to ${shortcut.ref}`,
				handler: async (_args, ctx) => {
					await switchToModel(pi, ctx, shortcut);
				},
			},
		});
	}
}

function resolveShortcut(
	entry: ModelShortcutCatalogEntry,
	configured: ModelShortcutConfig,
): EffectiveModelShortcut {
	const ref = configured[entry.key as keyof ModelShortcutConfig] ?? entry.defaultRef;
	const parsed = parseModelRef(ref);
	if (parsed === undefined) {
		throw new Error(`Invalid effective model shortcut ${entry.key}: ${ref}`);
	}
	return { ...entry, ...parsed, ref };
}

async function switchToModel(
	pi: ExtensionAPI,
	ctx: CommandContext,
	shortcut: EffectiveModelShortcut,
): Promise<void> {
	const model = ctx.modelRegistry.find(shortcut.provider, shortcut.modelId);
	if (model === undefined) {
		notifyCommandUi(ctx, `Model ${shortcut.ref} not found.`, "error");
		return;
	}

	const switched = await pi.setModel(model);
	if (!switched) {
		notifyCommandUi(
			ctx,
			`Model ${shortcut.ref} is unavailable; run /login or configure Pi auth.`,
			"error",
		);
		return;
	}

	notifyCommandUi(ctx, `Switched model to ${shortcut.ref}.`, "info");
}
