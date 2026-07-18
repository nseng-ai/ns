import type { HarnessId } from "@nseng-ai/harness-artifacts/api";

interface FreshModelProfile {
	readonly name: string;
	readonly model: string;
	readonly thinking: string;
}

const FRESH_MODEL_PROFILES = [
	{
		name: "ultrafast",
		model: "vercel-ai-gateway/openai/gpt-5.6-luna",
		thinking: "off",
	},
	{
		name: "fast",
		model: "vercel-ai-gateway/openai/gpt-5.6-luna",
		thinking: "medium",
	},
	{
		name: "standard",
		model: "vercel-ai-gateway/openai/gpt-5.6-terra",
		thinking: "medium",
	},
	{
		name: "deep",
		model: "vercel-ai-gateway/openai/gpt-5.6-sol",
		thinking: "low",
	},
	{
		name: "ultradeep",
		model: "vercel-ai-gateway/openai/gpt-5.6-sol",
		thinking: "xhigh",
	},
] as const satisfies readonly FreshModelProfile[];

export function renderFreshNsConfig(harnesses: readonly HarnessId[]): string {
	const profiles = FRESH_MODEL_PROFILES.map(
		(profile) =>
			`[models.profiles.${profile.name}]\nmodel = ${JSON.stringify(profile.model)}\nthinking = ${JSON.stringify(profile.thinking)}`,
	).join("\n\n");
	return `harnesses = ${JSON.stringify([...harnesses])}\n\n${profiles}\n`;
}
