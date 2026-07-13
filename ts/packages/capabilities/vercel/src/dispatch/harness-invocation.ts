// Resolve the dispatched checkout's versioned configuration into one
// registry-backed harness invocation. This module may parse TOML; the
// dependency-light registry remains usable by local config/preflight code.
import { parse as parseToml } from "smol-toml";
import { z } from "zod";

import {
	buildDispatchHarnessInvocation,
	isDispatchHarness,
	parseDispatchPackageManagerSource,
	type DispatchPackageManagerFailureCode,
	type HarnessInvocation,
} from "./harness-registry.ts";

export type HarnessInvocationFailureCode =
	| "harness-not-configured"
	| "dispatch-settings-invalid"
	| "unsupported-harness"
	| DispatchPackageManagerFailureCode;

export type HarnessInvocationResolution =
	| { readonly ok: true; readonly value: HarnessInvocation }
	| {
			readonly ok: false;
			readonly code: HarnessInvocationFailureCode;
			readonly message: string;
	  };

/** Resolve both checkout-owned configuration sources into an invocation. */
export type HarnessInvocationResolver = (
	dispatchSettingsSource: string | null,
	packageManagerSource: string | null,
) => HarnessInvocationResolution;

// ns.toml carries unrelated tables and the [dispatch] table carries project
// linkage; this seam validates only the harness key it consumes.
const dispatchSettingsSchema = z.looseObject({
	dispatch: z
		.looseObject({
			harness: z.string().optional(),
		})
		.optional(),
});

export function resolveConfiguredHarnessInvocation(
	dispatchSettingsSource: string | null,
	packageManagerSource: string | null,
): HarnessInvocationResolution {
	if (dispatchSettingsSource === null) {
		return {
			ok: false,
			code: "harness-not-configured",
			message: "The dispatched checkout has no root ns.toml declaring a [dispatch] harness.",
		};
	}

	let parsed: unknown;
	try {
		parsed = parseToml(dispatchSettingsSource);
	} catch {
		return {
			ok: false,
			code: "dispatch-settings-invalid",
			message: "The dispatched checkout's ns.toml is not valid TOML.",
		};
	}
	const settings = dispatchSettingsSchema.safeParse(parsed);
	// `=== false` rather than `!`: the Vercel builder typechecks without
	// strictNullChecks, where negated narrowing does not hold.
	if (settings.success === false) {
		return {
			ok: false,
			code: "dispatch-settings-invalid",
			message: "The dispatched checkout's ns.toml [dispatch] table is invalid.",
		};
	}

	const harness = settings.data.dispatch?.harness;
	if (harness === undefined || harness.length === 0) {
		return {
			ok: false,
			code: "harness-not-configured",
			message: "The dispatched checkout's ns.toml declares no [dispatch] harness.",
		};
	}
	if (!isDispatchHarness(harness)) {
		return {
			ok: false,
			code: "unsupported-harness",
			message: "The configured [dispatch] harness has no invocation recipe in this deployable.",
		};
	}

	const packageManager = parseDispatchPackageManagerSource(packageManagerSource);
	if (packageManager.ok === false) {
		return {
			ok: false,
			code: packageManager.error.code,
			message: packageManager.error.message,
		};
	}

	return {
		ok: true,
		value: buildDispatchHarnessInvocation({
			harness,
			pnpmVersion: packageManager.value.pnpmVersion,
		}),
	};
}
