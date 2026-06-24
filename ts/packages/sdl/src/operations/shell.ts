import type { z } from "zod";

import {
	buildMarkerInstallSurface,
	markerSurfaceInstallRequestSchema,
	markerSurfaceInstallResultSchema,
	markerSurfaceShowRequestSchema,
	markerSurfaceShowResultSchema,
} from "@sdl/slot/shell-support";

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
	return `sdl() {
  local _sdl_cd_directive_file
  local _sdl_status
  local _sdl_destination

  _sdl_cd_directive_file="$(mktemp "\${TMPDIR:-/tmp}/sdl-cd.XXXXXX")" || return 1
  SDL_CD_DIRECTIVE_FILE="$_sdl_cd_directive_file" command sdl "$@"
  _sdl_status=$?

  if [ $_sdl_status -eq 0 ] && [ -s "$_sdl_cd_directive_file" ]; then
    IFS= read -r _sdl_destination < "$_sdl_cd_directive_file" || true
    rm -f "$_sdl_cd_directive_file"
    cd -- "$_sdl_destination"
    return $?
  fi

  rm -f "$_sdl_cd_directive_file"
  return $_sdl_status
}`;
}
