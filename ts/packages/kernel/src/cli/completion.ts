import { z } from "zod";

import { renderClinkrCompletionScript, type ClinkrCompletionShell } from "@ji/clinkr/completion";

export const sdlCompletionShells = ["bash", "zsh", "fish"] as const;

export const sdlCompletionScriptResultSchema = z.object({
	shell: z.enum(sdlCompletionShells),
	script: z.string(),
});

export type SdlCompletionScriptResult = z.infer<typeof sdlCompletionScriptResultSchema>;

export function renderSdlCompletionScriptResult(result: SdlCompletionScriptResult): string {
	return result.script;
}

export function buildSdlCompletionScript(shell: ClinkrCompletionShell): SdlCompletionScriptResult {
	return {
		shell,
		script: renderClinkrCompletionScript({
			commandName: "ns",
			shell,
			resolverCommand: ["completion", "exec", "resolve"],
		}),
	};
}
