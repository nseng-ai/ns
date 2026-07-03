import { formatShellArg } from "@sdl/core/exec";

const TOKEN_PREFIX = "@@JI_";

export const FALLBACK_MODES = ["literal", "script-checkout"] as const;
export type FallbackMode = (typeof FALLBACK_MODES)[number];

export interface RenderCliShimRequest {
	template: string;
	tool: string;
	canonicalCheckout: string;
	cliRelPath: string;
	installHint: string;
	fallbackMode?: string;
	templateLabel?: string;
}

export interface RenderCliShimSuccess {
	type: "ok";
	rendered: string;
}

export interface RenderCliShimFailure {
	type: "failure";
	message: string;
	exitCode: 2;
}

export type RenderCliShimResult = RenderCliShimSuccess | RenderCliShimFailure;

export function renderCliShim(request: RenderCliShimRequest): RenderCliShimResult {
	const fallbackMode = request.fallbackMode ?? "literal";
	if (!isFallbackMode(fallbackMode)) {
		return failure(
			`invalid JI_FALLBACK_MODE '${fallbackMode}'; expected one of: ${FALLBACK_MODES.join(", ")}`,
		);
	}

	const replacements = new Map([
		["@@JI_TOOL@@", formatShellArg(request.tool)],
		["@@JI_CANONICAL_CHECKOUT@@", formatShellArg(request.canonicalCheckout)],
		["@@JI_CLI_REL_PATH@@", formatShellArg(request.cliRelPath)],
		["@@JI_INSTALL_HINT@@", formatShellArg(request.installHint)],
		["@@JI_FALLBACK_MODE@@", formatShellArg(fallbackMode)],
	]);

	let rendered = request.template;
	for (const [token, value] of replacements) rendered = rendered.replaceAll(token, value);

	if (rendered.includes(TOKEN_PREFIX)) {
		return failure(`unrendered shim token remains in ${request.templateLabel ?? "template"}`);
	}

	return { type: "ok", rendered };
}

function isFallbackMode(value: string): value is FallbackMode {
	const fallbackModes: readonly string[] = FALLBACK_MODES;
	return fallbackModes.includes(value);
}

function failure(message: string): RenderCliShimFailure {
	return { type: "failure", message, exitCode: 2 };
}
