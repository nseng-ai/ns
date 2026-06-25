import type { z } from "zod";

import {
	buildMarkerInstallSurface,
	markerSurfaceInstallRequestSchema,
	markerSurfaceInstallResultSchema,
	markerSurfaceShowRequestSchema,
	markerSurfaceShowResultSchema,
	renderCommandCdWrapperScript,
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

const sdlShellSurface = buildMarkerInstallSurface({
	beginMarker: sdlShellIntegrationBeginMarker,
	endMarker: sdlShellIntegrationEndMarker,
	renderPayload: () => renderSdlShellWrapperScript(),
	alreadyInstalledMessage: (result) =>
		`sdl shell integration already installed in ${result.rc_path}`,
	installedMessage: (result) =>
		`Installed sdl shell integration for ${result.shell} in ${result.rc_path}`,
});

export async function runSdlShellShow(ctx: SdlCliContext, request: SdlShellShowRequest) {
	return await sdlShellSurface.runShow(ctx, request);
}

export async function runSdlShellInstall(ctx: SdlCliContext, request: SdlShellInstallRequest) {
	return await sdlShellSurface.runInstall(ctx, request);
}

export function renderSdlShellShow(result: SdlShellShowResult): string {
	return sdlShellSurface.renderShow(result);
}

export function renderSdlShellInstall(result: SdlShellInstallResult): string {
	return sdlShellSurface.renderInstall(result);
}

export function renderSdlShellWrapperScript(): string {
	return renderCommandCdWrapperScript({ commandName: "sdl" });
}
