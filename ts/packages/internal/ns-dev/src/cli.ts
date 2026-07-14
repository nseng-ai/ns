#!/usr/bin/env node

import { ClinkrGroup } from "@nseng-ai/clinkr";
import { defineCli } from "@nseng-ai/foundation/cli-runtime";

import {
	createLocalNsProjectRequestSchema,
	createLocalNsProjectResultSchema,
	renderCreateLocalNsProject,
	runCreateLocalNsProject,
} from "./commands/create-local-ns-project.ts";
import {
	installLocalNsExtensionRequestSchema,
	installLocalNsExtensionResultSchema,
	renderInstallLocalNsExtension,
	runInstallLocalNsExtension,
} from "./commands/install-local-ns-extension.ts";
import {
	bumpPublicPackageVersionRequestSchema,
	bumpPublicPackageVersionResultSchema,
	prepareSourcePublishPackageRequestSchema,
	prepareSourcePublishPackageResultSchema,
	publishPublicPackageSetRequestSchema,
	publishPublicPackageSetResultSchema,
	qualifyPublicPackageSetRequestSchema,
	qualifyPublicPackageSetResultSchema,
	renderCliShimRequestSchema,
	renderCliShimResultSchema,
	renderCommandResult,
	runBumpPublicPackageVersion,
	runPrepareSourcePublishPackage,
	runPublishPublicPackageSet,
	runQualifyPublicPackageSet,
	runRenderCliShim,
	runSmokeSdkConsumerResolution,
	runVerifyPublicPackageSet,
	smokeSdkConsumerResolutionRequestSchema,
	smokeSdkConsumerResolutionResultSchema,
	verifyPublicPackageSetRequestSchema,
	verifyPublicPackageSetResultSchema,
} from "./commands/public-package-workflows.ts";
import { createRealNsDevContext, type NsDevCliContext, type NsDevCliDeps } from "./context.ts";
import {
	releaseCliResultSchema,
	releasePublicPackageSetRequestSchema,
	renderReleasePublicPackageSet,
	runReleasePublicPackageSet,
} from "./release-public-package-set-cli.ts";

export interface CliDeps extends NsDevCliDeps {
	readonly context?: NsDevCliContext;
}

const entry = defineCli<NsDevCliContext, CliDeps, undefined>({
	metaUrl: import.meta.url,
	runtime: "typescript",
	description: "Project-local development workflows for the ns repository.",
	prepareRun: ({ deps, cwd, env, stderr }) => {
		const context =
			deps.context ??
			createRealNsDevContext({
				cwd: deps.cwd ?? cwd,
				env: deps.env ?? env,
				...(deps.homeDir === undefined ? {} : { homeDir: deps.homeDir }),
				...(deps.runCommand === undefined ? {} : { runCommand: deps.runCommand }),
				...(deps.fs === undefined ? {} : { fs: deps.fs }),
				...(deps.clock === undefined ? {} : { clock: deps.clock }),
				...(deps.timers === undefined ? {} : { timers: deps.timers }),
				...(deps.release === undefined ? {} : { release: deps.release }),
				status: deps.stderr ?? stderr,
			});
		return { type: "run", context, buildState: undefined };
	},
	configureCli: ({ root }) => {
		root.command({
			name: "create-local-ns-project",
			description:
				"Create a local ns development bootstrap project, install the local @nseng-ai/ns package, commit it, and verify npx ns by default.",
			schema: createLocalNsProjectRequestSchema,
			options: { force: { short: "-f" } },
			resultSchema: createLocalNsProjectResultSchema,
			handler: runCreateLocalNsProject,
			renderHuman: renderCreateLocalNsProject,
		});
		root.command({
			name: "install-local-ns-extension",
			description:
				"Install a local ns extension package into an existing target project through npm tarball semantics.",
			schema: installLocalNsExtensionRequestSchema,
			options: {
				target: { short: "-t" },
				package: { short: "-p" },
				forcePackDir: { short: "-f" },
			},
			resultSchema: installLocalNsExtensionResultSchema,
			handler: runInstallLocalNsExtension,
			renderHuman: renderInstallLocalNsExtension,
		});
		root.command({
			name: "bump-public-package-version",
			description: "Coordinate public package source versions and refresh the lockfile.",
			schema: bumpPublicPackageVersionRequestSchema,
			positionals: { version: { position: 0 } },
			resultSchema: bumpPublicPackageVersionResultSchema,
			handler: runBumpPublicPackageVersion,
			renderHuman: renderCommandResult,
		});
		root.command({
			name: "prepare-source-publish-package",
			description: "Prepare a source package's generated npm publish root.",
			schema: prepareSourcePublishPackageRequestSchema,
			positionals: { packageRoot: { position: 0 } },
			resultSchema: prepareSourcePublishPackageResultSchema,
			handler: runPrepareSourcePublishPackage,
			renderHuman: renderCommandResult,
		});
		root.command({
			name: "publish-public-package-set",
			description: "Run the legacy direct public-package publisher or its dry run.",
			schema: publishPublicPackageSetRequestSchema,
			positionals: { mode: { position: 0 }, version: { position: 1 } },
			options: { verifyDelayMs: {}, verifyDelaySeconds: {} },
			resultSchema: publishPublicPackageSetResultSchema,
			handler: runPublishPublicPackageSet,
			renderHuman: renderCommandResult,
		});
		root.command({
			name: "qualify-public-package-set",
			description: "Qualify generated public packages without registry writes.",
			schema: qualifyPublicPackageSetRequestSchema,
			options: { all: { short: "-a" }, version: { short: "-v" }, skipChecks: {}, skipDryRun: {} },
			resultSchema: qualifyPublicPackageSetResultSchema,
			handler: runQualifyPublicPackageSet,
			renderHuman: renderCommandResult,
		});
		root.command({
			name: "release-public-package-set",
			description: "Plan, run, or safely resume the transactional public npm package release.",
			schema: releasePublicPackageSetRequestSchema,
			positionals: { version: { position: 0 } },
			options: { plan: { short: "-n" } },
			resultSchema: releaseCliResultSchema,
			handler: runReleasePublicPackageSet,
			renderHuman: renderReleasePublicPackageSet,
		});
		root.command({
			name: "render-cli-shim",
			description: "Render a source CLI shim from the configured environment and template.",
			schema: renderCliShimRequestSchema,
			resultSchema: renderCliShimResultSchema,
			handler: runRenderCliShim,
			renderHuman: (result) => `Rendered ${result.output}\n`,
		});
		root.command({
			name: "smoke-sdk-consumer-resolution",
			description: "Smoke-test TypeScript consumer resolution against an SDK publish root.",
			schema: smokeSdkConsumerResolutionRequestSchema,
			positionals: { publishRoot: { position: 0 } },
			resultSchema: smokeSdkConsumerResolutionResultSchema,
			handler: runSmokeSdkConsumerResolution,
			renderHuman: renderCommandResult,
		});
		root.command({
			name: "verify-public-package-set",
			description: "Read back and compare the intended public package set from npm.",
			schema: verifyPublicPackageSetRequestSchema,
			options: {
				strict: { short: "-s" },
				version: { short: "-v" },
				candidateReport: { short: "-c" },
			},
			resultSchema: verifyPublicPackageSetResultSchema,
			handler: runVerifyPublicPackageSet,
			renderHuman: renderCommandResult,
		});
	},
});

export const VERSION = entry.version;

export function buildCli(): ClinkrGroup<NsDevCliContext> {
	return entry.buildCli(undefined);
}

export async function runNsDevCli(args: readonly string[], deps: CliDeps = {}): Promise<number> {
	return await entry.run(args, deps);
}

await entry.runIfMain({ isImportMetaMain: import.meta.main });
