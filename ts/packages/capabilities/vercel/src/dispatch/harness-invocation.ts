// The harness-invocation configuration seam: which agent harness runs
// inside the dispatch sandbox is repo configuration — a provisioning recipe
// plus an invocation command, not code shape (orientation rule). The choice
// lives in the dispatched repository's own root `ns.toml` `[dispatch]`
// table at the exact dispatched SHA, so the launch step reads that file
// from the checkout after the sandbox exists and resolves it here. The pi
// recipe (`../pi-runner/recipe.ts`) is the first real value; Claude Code
// lands later as another `harness = "..."` mapping — pure configuration,
// same seam. Workflow steps stay orchestration-only: no harness logic lives
// here or in the steps, only the commands that provision and start it.
//
// The invocation contract, from the sandbox's perspective (the checkout is
// the sandbox's working directory, so the repo's ns skills are already
// present — no injection layer):
//
// - Provision commands run first, sequentially, in the checkout; each must
//   exit 0. They install the harness runtime (per-run provisioning is v1;
//   warm sandbox templates are parked).
// - The workflow writes the dispatched prompt to `DISPATCH_PROMPT_PATH`
//   before launching.
// - The launch command starts the harness headless and detached; it must
//   read its unit of work from `DISPATCH_PROMPT_PATH`, commit produced work
//   onto the checkout's `HEAD`, write its decision log to
//   `DISPATCH_DECISION_LOG_PATH`, and finally write the completion JSON
//   (`{ "outcome": "completed" | "failed", "summary"?: string }`) to
//   `DISPATCH_RESULT_PATH`. The result file's existence is the completion
//   signal the poll steps watch, so it must be written last and appear
//   atomically.
// - Model keys are configuration, not workflow data: the launch step copies
//   the named variables from the deployable's environment into the detached
//   launch command's own environment. They are never journaled, logged, or
//   placed in the sandbox-wide environment, and no push-capable git
//   credential exists in the sandbox at any point.
import { parse as parseToml } from "smol-toml";
import { z } from "zod";

import type { DispatchSandboxCommand } from "./dispatch-run.ts";

export interface HarnessInvocation {
	/** Sequential provisioning commands; each must exit 0. */
	readonly provisionCommands: readonly DispatchSandboxCommand[];
	/** The detached, headless harness launch command. */
	readonly launchCommand: DispatchSandboxCommand;
	/**
	 * Names of deployable environment variables (model keys and similar
	 * harness configuration) injected into the launch command's environment.
	 * Names only — values stay in the deployable's environment and the
	 * launch step's memory.
	 */
	readonly launchEnvironmentVariableNames: readonly string[];
}

/**
 * The pi runner's entry module, checkout-relative (the sandbox runs commands
 * with the checkout as working directory). Node 24 executes the `.ts`
 * sources directly via native type stripping — the same way this repo runs
 * its own scripts — so no build step exists between install and launch. A
 * path string rather than an import: the runner's runtime must never travel
 * with the workflow's step bundle, and imports here flow dispatch-ward only.
 */
export const PI_RUNNER_ENTRY_PATH = "ts/packages/capabilities/vercel/src/pi-runner/main.ts";

/**
 * Keep in sync with `ts/package.json` `packageManager`: the sandbox image
 * carries npm but the workspace install needs the workspace's own pnpm.
 */
const PI_RUNNER_PNPM_VERSION = "11.8.0";

/**
 * The pi harness's provisioning recipe and invocation command — the first
 * real `HarnessInvocation` value behind this seam (seam-design §9: harness
 * choice is repo configuration, a provisioning recipe plus an invocation
 * command, not code shape). v1 provisions per run from the checkout itself:
 * the sandbox's working directory is the ns repo at the exact dispatched
 * SHA, which carries the `@nseng-ai/vercel` workspace, so the ns-owned pi
 * runner (`../pi-runner/`) is installed and executed straight out of the
 * checkout — no publish, no injection layer. Warm sandbox templates that
 * amortize this cold start are parked. Live sandbox behavior is pending
 * verification: none of these commands has run inside a Vercel Sandbox yet.
 */
export const PI_HARNESS_INVOCATION: HarnessInvocation = {
	provisionCommands: [
		// The agent commits inside the sandbox; a checkout-fresh git has no
		// identity and every commit would fail without one.
		{ cmd: "git", args: ["config", "--global", "user.name", "ns-dispatch"] },
		{
			cmd: "git",
			args: ["config", "--global", "user.email", "ns-dispatch[bot]@users.noreply.github.com"],
		},
		{ cmd: "npm", args: ["install", "--global", `pnpm@${PI_RUNNER_PNPM_VERSION}`] },
		// Install only the runner's package and its workspace dependencies,
		// pinned to the checkout's lockfile.
		{
			cmd: "pnpm",
			args: ["--dir", "ts", "install", "--frozen-lockfile", "--filter", "@nseng-ai/vercel..."],
		},
	],
	launchCommand: { cmd: "node", args: [PI_RUNNER_ENTRY_PATH] },
	// Names only — the launch step copies the values from the deployable's
	// environment into the detached command's own environment (README
	// "Setup": model keys live on the Vercel project). v1 runs pi on
	// Anthropic models; the key the run receives is the one its harness
	// needs.
	launchEnvironmentVariableNames: ["ANTHROPIC_API_KEY"],
};

export type HarnessInvocationFailureCode =
	| "harness-not-configured"
	| "dispatch-settings-invalid"
	| "unsupported-harness";

export type HarnessInvocationResolution =
	| { readonly ok: true; readonly value: HarnessInvocation }
	| {
			readonly ok: false;
			readonly code: HarnessInvocationFailureCode;
			readonly message: string;
	  };

/**
 * Resolves the checkout's `ns.toml` source (`null` when the checkout has
 * none) to the configured harness invocation.
 */
export type HarnessInvocationResolver = (
	dispatchSettingsSource: string | null,
) => HarnessInvocationResolution;

// Loose objects: ns.toml carries other extension groups' tables and the
// `[dispatch]` table carries non-harness keys (Vercel project linkage);
// this seam validates only the key it consumes.
const dispatchSettingsSchema = z.looseObject({
	dispatch: z
		.looseObject({
			harness: z.string().optional(),
		})
		.optional(),
});

/**
 * Resolve the dispatched checkout's configured harness invocation from its
 * repo-root `ns.toml` `[dispatch]` table. `harness = "pi"` maps to the
 * ns-owned pi runner recipe; failures carry a non-secret message the launch
 * step surfaces as `dispatch-misconfigured` (ns.toml is versioned,
 * non-secret repo configuration).
 */
export function resolveConfiguredHarnessInvocation(
	dispatchSettingsSource: string | null,
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
	if (harness === "pi") {
		return { ok: true, value: PI_HARNESS_INVOCATION };
	}
	return {
		ok: false,
		code: "unsupported-harness",
		message: `The configured [dispatch] harness ${JSON.stringify(harness.slice(0, 100))} has no invocation recipe.`,
	};
}
