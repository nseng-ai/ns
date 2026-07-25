import { failure, ok, requireInteractiveOrUsageError } from "@nseng-ai/clinkr";
import { z } from "zod";

import {
	installMarkerBlock,
	markerSurfaceInstallRequestSchema,
	markerSurfaceInstallResultSchema,
	markerSurfaceShowRequestSchema,
	markerSurfaceShowResultSchema,
	rcPathForShell,
	renderCommandCdWrapperScript,
	resolveRequestedShell,
} from "@nseng-ai/extension-kit/shell-support";

import type { NsCliContext } from "./context.ts";

export const nsShellIntegrationBeginMarker = "# >>> ns shell integration >>>";
export const nsShellIntegrationEndMarker = "# <<< ns shell integration <<<";

export const nsShellShowRequestSchema = markerSurfaceShowRequestSchema;
export const nsShellInstallRequestSchema = markerSurfaceInstallRequestSchema.extend({
	yes: z.boolean().default(false).describe("Confirm shell rc-file update without prompting."),
});
export const nsShellShowResultSchema = markerSurfaceShowResultSchema;
export const nsShellInstallResultSchema = markerSurfaceInstallResultSchema.extend({
	cancelled: z.boolean().default(false),
});

export type NsShellShowRequest = z.infer<typeof nsShellShowRequestSchema>;
export type NsShellInstallRequest = z.infer<typeof nsShellInstallRequestSchema>;
export type NsShellShowResult = z.infer<typeof nsShellShowResultSchema>;
export type NsShellInstallResult = z.infer<typeof nsShellInstallResultSchema>;

export async function runNsShellShow(ctx: NsCliContext, request: NsShellShowRequest) {
	const selected = resolveRequestedShell(request.shell, ctx.env);
	if (selected.type === "failure") return failure(selected.failure.type, selected.failure.message);
	return ok({ shell: selected.shell, script: renderNsShellWrapperScript() });
}

export async function runNsShellInstall(ctx: NsCliContext, request: NsShellInstallRequest) {
	const selected = resolveRequestedShell(request.shell, ctx.env);
	if (selected.type === "failure") return failure(selected.failure.type, selected.failure.message);
	const rcPath = rcPathForShell(selected.shell, ctx.env);
	if (!request.yes) {
		const gate = requireInteractiveOrUsageError(ctx.interaction, {
			message: "Installing ns shell integration requires --yes when non-interactive.",
			missingFlag: "--yes",
			howToSupply: "Pass --yes (or -y) to update the shell rc file without prompting.",
		});
		if (gate) return gate;
		const confirmed = await ctx.interaction.confirm({
			message: `Install ns shell integration for ${selected.shell} in ${rcPath}?`,
			defaultAnswer: "no",
		});
		if (confirmed.type === "aborted") return failure("aborted", "Aborted!");
		if (confirmed.type === "declined") {
			return ok({
				shell: selected.shell,
				rcPath: rcPath,
				isAlreadyInstalled: false,
				cancelled: true,
			} satisfies NsShellInstallResult);
		}
	}
	const installed = await installMarkerBlock({
		rcPath,
		beginMarker: nsShellIntegrationBeginMarker,
		payload: renderNsShellWrapperScript(),
		endMarker: nsShellIntegrationEndMarker,
	});
	return ok({
		shell: selected.shell,
		rcPath: installed.rcPath,
		isAlreadyInstalled: installed.isAlreadyInstalled,
		cancelled: false,
	});
}

export function renderNsShellShow(result: NsShellShowResult): string {
	return result.script;
}

export function renderNsShellInstall(result: NsShellInstallResult): string {
	if (result.cancelled)
		return `Cancelled ns shell integration install for ${result.shell} in ${result.rcPath}`;
	if (result.isAlreadyInstalled)
		return `ns shell integration already installed in ${result.rcPath}`;
	return `Installed ns shell integration for ${result.shell} in ${result.rcPath}`;
}

export function renderNsShellWrapperScript(): string {
	return renderCommandCdWrapperScript({ commandName: "ns" });
}
