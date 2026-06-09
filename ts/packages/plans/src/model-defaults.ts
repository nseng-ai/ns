export const DEFAULT_FAST_MODEL_REF = "openai-codex/gpt-5.4-mini";

export interface ParsedModelRef {
	provider: string;
	modelId: string;
}

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

export const DEFAULT_FAST_MODEL: ParsedModelRef = requireDefaultFastModel();

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

function requireDefaultFastModel(): ParsedModelRef {
	const parsed = parseModelRef(DEFAULT_FAST_MODEL_REF);
	if (parsed === undefined) {
		throw new Error(`Default fast model ref ${JSON.stringify(DEFAULT_FAST_MODEL_REF)} is not "provider/modelId".`);
	}
	return parsed;
}
