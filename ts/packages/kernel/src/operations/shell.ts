import { failure, ok } from "@sdl/clinkr";
import type { z } from "zod";

import {
	installMarkerBlock,
	markerSurfaceInstallRequestSchema,
	markerSurfaceInstallResultSchema,
	markerSurfaceShowRequestSchema,
	markerSurfaceShowResultSchema,
	rcPathForShell,
	renderCommandCdWrapperScript,
	resolveRequestedShell,
} from "@sdl/core/shell-support";

import type { SdlCliContext } from "../cli.ts";

export const sdlShellIntegrationBeginMarker = "# >>> sdl shell integration >>>";
export const sdlShellIntegrationEndMarker = "# <<< sdl shell integration <<<";

export const sdlShellShowRequestSchema = markerSurfaceShowRequestSchema;
export const sdlShellInstallRequestSchema = markerSurfaceInstallRequestSchema;
export const sdlShellShowResultSchema = markerSurfaceShowResultSchema;
export const sdlShellInstallResultSchema = markerSurfaceInstallResultSchema;

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
	const installed = await installMarkerBlock({
		rcPath: rcPathForShell(selected.shell, ctx.env),
		beginMarker: sdlShellIntegrationBeginMarker,
		payload: renderSdlShellWrapperScript(),
		endMarker: sdlShellIntegrationEndMarker,
	});
	return ok({
		shell: selected.shell,
		rc_path: installed.rcPath,
		is_already_installed: installed.isAlreadyInstalled,
	});
}

export function renderSdlShellShow(result: SdlShellShowResult): string {
	return result.script;
}

export function renderSdlShellInstall(result: SdlShellInstallResult): string {
	if (result.is_already_installed)
		return `sdl shell integration already installed in ${result.rc_path}`;
	return `Installed sdl shell integration for ${result.shell} in ${result.rc_path}`;
}

export function renderSdlShellWrapperScript(): string {
	return renderCommandCdWrapperScript({ commandName: "sdl" });
}
