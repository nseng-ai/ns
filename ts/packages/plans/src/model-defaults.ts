export interface ParsedModelRef {
	provider: string;
	modelId: string;
}

export const DEFAULT_FAST_MODEL: ParsedModelRef = { provider: "openai-codex", modelId: "gpt-5.4-mini" };
export const DEFAULT_FAST_MODEL_REF = `${DEFAULT_FAST_MODEL.provider}/${DEFAULT_FAST_MODEL.modelId}`;

export type ModelRefResolution = { ok: true; value: ParsedModelRef } | { ok: false; error: string };

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
