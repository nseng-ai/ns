import { failure, ok, requireInteractiveOrUsageError } from "@sdl/clinkr";
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
} from "@sdl/capability-kit/shell-support";

import type { SdlCliContext } from "../cli.ts";

export const sdlShellIntegrationBeginMarker = "# >>> sdl shell integration >>>";
export const sdlShellIntegrationEndMarker = "# <<< sdl shell integration <<<";

export const sdlShellShowRequestSchema = markerSurfaceShowRequestSchema;
export const sdlShellInstallRequestSchema = markerSurfaceInstallRequestSchema.extend({
	yes: z.boolean().default(false).describe("Confirm shell rc-file update without prompting."),
});
export const sdlShellShowResultSchema = markerSurfaceShowResultSchema;
export const sdlShellInstallResultSchema = markerSurfaceInstallResultSchema.extend({
	cancelled: z.boolean().default(false),
});

export type SdlShellShowRequest = z.infer<typeof sdlShellShowRequestSchema>;
export type SdlShellInstallRequest = z.infer<typeof sdlShellInstallRequestSchema>;
export type SdlShellShowResult = z.infer<typeof sdlShellShowResultSchema>;
export type SdlShellInstallResult = z.infer<typeof sdlShellInstallResultSchema>;

export async function runSdlShellShow(ctx: SdlCliContext, request: SdlShellShowRequest) {
	const selected = resolveRequestedShell(request.shell, ctx.env);
	if (selected.type === "failure") return failure(selected.failure.type, selected.failure.message);
	return ok({ shell: selected.shell, script: renderSdlShellWrapperScript() });
}

export async function runSdlShellInstall(ctx: SdlCliContext, request: SdlShellInstallRequest) {
	const selected = resolveRequestedShell(request.shell, ctx.env);
	if (selected.type === "failure") return failure(selected.failure.type, selected.failure.message);
	const rcPath = rcPathForShell(selected.shell, ctx.env);
	if (!request.yes) {
		const gate = requireInteractiveOrUsageError(ctx.interaction, {
			message: "Installing sdl shell integration requires --yes when non-interactive.",
			missingFlag: "--yes",
			howToSupply: "Pass --yes (or -y) to update the shell rc file without prompting.",
		});
		if (gate) return gate;
		const confirmed = await ctx.interaction.confirm({
			message: `Install sdl shell integration for ${selected.shell} in ${rcPath}?`,
			defaultAnswer: "no",
		});
		if (confirmed.type === "aborted") return failure("aborted", "Aborted!");
		if (confirmed.type === "declined") {
			return ok({
				shell: selected.shell,
				rcPath: rcPath,
				isAlreadyInstalled: false,
				cancelled: true,
			} satisfies SdlShellInstallResult);
		}
	}
	const installed = await installMarkerBlock({
		rcPath,
		beginMarker: sdlShellIntegrationBeginMarker,
		payload: renderSdlShellWrapperScript(),
		endMarker: sdlShellIntegrationEndMarker,
	});
	return ok({
		shell: selected.shell,
		rcPath: installed.rcPath,
		isAlreadyInstalled: installed.isAlreadyInstalled,
		cancelled: false,
	});
}

export function renderSdlShellShow(result: SdlShellShowResult): string {
	return result.script;
}

export function renderSdlShellInstall(result: SdlShellInstallResult): string {
	if (result.cancelled)
		return `Cancelled sdl shell integration install for ${result.shell} in ${result.rcPath}`;
	if (result.isAlreadyInstalled)
		return `sdl shell integration already installed in ${result.rcPath}`;
	return `Installed sdl shell integration for ${result.shell} in ${result.rcPath}`;
}

export function renderSdlShellWrapperScript(): string {
	return renderCommandCdWrapperScript({ commandName: "sdl" });
}
