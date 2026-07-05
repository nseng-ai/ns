import { z } from "zod";

import { renderClinkrCompletionScript, type ClinkrCompletionShell } from "@ns/clinkr/completion";

export const nsCompletionShells = ["bash", "zsh", "fish"] as const;

export const nsCompletionScriptResultSchema = z.object({
	shell: z.enum(nsCompletionShells),
	script: z.string(),
});

export type NsCompletionScriptResult = z.infer<typeof nsCompletionScriptResultSchema>;

export function renderNsCompletionScriptResult(result: NsCompletionScriptResult): string {
	return result.script;
}

export function buildNsCompletionScript(shell: ClinkrCompletionShell): NsCompletionScriptResult {
	return {
		shell,
		script: renderClinkrCompletionScript({
			commandName: "ns",
			shell,
			resolverCommand: ["completion", "exec", "resolve"],
		}),
	};
}
