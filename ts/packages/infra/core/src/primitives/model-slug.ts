export interface ParsedModelRef {
	provider: string;
	modelId: string;
}

export const DEFAULT_FAST_MODEL: ParsedModelRef = {
	provider: "openai-codex",
	modelId: "gpt-5.4-mini",
};
export const DEFAULT_FAST_MODEL_REF = `${DEFAULT_FAST_MODEL.provider}/${DEFAULT_FAST_MODEL.modelId}`;

export type ModelRefResolution = { ok: true; value: ParsedModelRef } | { ok: false; error: string };

export type ModelProviderFamily = "anthropic" | "google" | "openai";

export interface ModelProviderFamilyInfo {
	readonly label: string;
	readonly exampleProvider: string;
	readonly article: "a" | "an";
}

export const MODEL_PROVIDER_FAMILY_INFO: Record<ModelProviderFamily, ModelProviderFamilyInfo> = {
	anthropic: { label: "Anthropic", exampleProvider: "anthropic", article: "an" },
	google: { label: "Google", exampleProvider: "google", article: "a" },
	openai: { label: "OpenAI", exampleProvider: "openai-codex", article: "an" },
};

const MODEL_PROVIDER_FAMILY_PROVIDERS: Record<ModelProviderFamily, readonly string[]> = {
	anthropic: ["anthropic"],
	google: ["google", "gemini"],
	openai: ["openai", "openai-codex"],
};
const MODEL_PROVIDER_FAMILIES = [
	"anthropic",
	"google",
	"openai",
] as const satisfies readonly ModelProviderFamily[];

const ANTHROPIC_MODEL_SHORTHANDS = ["sonnet", "opus", "haiku", "fable"] as const;
const CLAUDE_CODE_MODEL_SHORTHANDS = ["sonnet", "opus", "haiku"] as const;

export const SLUG_MODEL_ENV = "NS_SLUG_MODEL";

export function parseModelRef(modelRef: string): ParsedModelRef | undefined {
	const separator = modelRef.indexOf("/");
	if (separator <= 0 || separator === modelRef.length - 1) {
		return undefined;
	}
	return {
		provider: modelRef.slice(0, separator),
		modelId: modelRef.slice(separator + 1),
	};
}

export function modelIdFromModelPattern(modelPattern: string): string {
	return baseModelIdFromModelPattern(modelPattern).toLowerCase();
}

export function inferModelProviderFamily(
	modelPatternOrRef: string,
): ModelProviderFamily | undefined {
	const trimmed = modelPatternOrRef.trim();
	if (trimmed === "") return undefined;

	const parsedRef = parseModelRef(trimmed);
	if (parsedRef !== undefined) {
		return inferProviderFamily(parsedRef.provider) ?? inferModelIdProviderFamily(parsedRef.modelId);
	}

	return inferModelIdProviderFamily(trimmed);
}

export function providerMatchesModelProviderFamily(
	provider: string,
	family: ModelProviderFamily,
): boolean {
	return MODEL_PROVIDER_FAMILY_PROVIDERS[family].includes(provider.toLowerCase());
}

export function isClaudeCodeSupportedModelPattern(modelPattern: string): boolean {
	const modelId = baseModelIdFromModelPattern(modelPattern);
	return isClaudeCodeShorthand(modelId) || modelId.startsWith("claude-");
}

function baseModelIdFromModelPattern(modelPattern: string): string {
	return modelPattern.trim().split(":", 1)[0] ?? "";
}

function inferProviderFamily(provider: string): ModelProviderFamily | undefined {
	const normalizedProvider = provider.toLowerCase();
	for (const family of MODEL_PROVIDER_FAMILIES) {
		if (MODEL_PROVIDER_FAMILY_PROVIDERS[family].includes(normalizedProvider)) return family;
	}
	return undefined;
}

function inferModelIdProviderFamily(modelIdPattern: string): ModelProviderFamily | undefined {
	const modelId = modelIdFromModelPattern(modelIdPattern);
	if (isAnthropicModelShorthand(modelId) || modelId.startsWith("claude-")) return "anthropic";
	if (modelId.startsWith("gemini-")) return "google";
	if (modelId.startsWith("gpt-") || /^o[134](?:-|$)/u.test(modelId)) return "openai";
	return undefined;
}

function isAnthropicModelShorthand(modelId: string): boolean {
	return ANTHROPIC_MODEL_SHORTHANDS.some((shorthand) => shorthand === modelId);
}

function isClaudeCodeShorthand(modelId: string): boolean {
	return CLAUDE_CODE_MODEL_SHORTHANDS.some((shorthand) => shorthand === modelId);
}

export function resolveModelRef(
	env: Record<string, string | undefined>,
	envVar: string,
	defaultRef: string,
): ModelRefResolution {
	const modelRef = env[envVar]?.trim() || defaultRef;
	const parsed = parseModelRef(modelRef);
	if (parsed === undefined) {
		return {
			ok: false,
			error: `Invalid ${envVar}=${JSON.stringify(modelRef)}. Expected "provider/modelId".`,
		};
	}
	return { ok: true, value: parsed };
}
