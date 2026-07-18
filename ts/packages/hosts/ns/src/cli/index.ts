import harnessArtifactsExtension from "@nseng-ai/harness-artifacts/ns-extension";
import {
	createNsExtensionApi,
	loadNsCommandCatalog,
	preinstalledNsCommandCatalogFromRegistrations,
	runCli,
	type NsCliDeps,
	type PreinstalledNsCommandCatalog,
	type PreinstalledNsExtensionRegistration,
} from "@nseng-ai/sdk/cli";
import { createRealNsCommandContext, type NsExtensionApi } from "@nseng-ai/sdk/context";
import type {
	NsConfirmPrompt,
	NsOutputStream,
	NsProgressPhaseListener,
	RenderCapabilities,
} from "@nseng-ai/sdk";
import nsInitExtension from "@nseng-ai/ns-init/ns-extension";

import { PiTextGenerator } from "./pi-text-generation.ts";

export interface RunNsCliDeps extends Omit<NsCliDeps, "context"> {
	context?: NsCliDeps["context"];
}

export interface CreateRealNsExtensionApiOptions {
	cwd: string;
	env: Record<string, string | undefined>;
	homeDir?: string;
	stdout?: (text: string) => void;
	stderr?: (text: string) => void;
	renderCapabilities?: RenderCapabilities;
	outputFormat?: NonNullable<NsExtensionApi["outputFormat"]>;
	onOutput?: (stream: NsOutputStream, text: string) => void;
	onProgress?: NsProgressPhaseListener;
	confirm?: NsConfirmPrompt;
}

/** Creates a fresh, fully wired ns extension API for the selected project. */
export async function createRealNsExtensionApi(
	options: CreateRealNsExtensionApiOptions,
): Promise<NsExtensionApi> {
	const baseContext = createRealNsCommandContext({
		textGenerator: new PiTextGenerator(),
		cwd: options.cwd,
		env: options.env,
		...(options.homeDir === undefined ? {} : { homeDir: options.homeDir }),
	});
	const commandCatalog = await loadNsCommandCatalog({
		cwd: options.cwd,
		env: options.env,
		...(baseContext.homeDir === undefined ? {} : { homeDir: baseContext.homeDir }),
		preinstalledCommandCatalog: loadPreinstalledNsCommandCatalog,
	});
	return createNsExtensionApi({
		baseContext,
		cwd: options.cwd,
		env: options.env,
		...(baseContext.homeDir === undefined ? {} : { homeDir: baseContext.homeDir }),
		extensionPackageNames: commandCatalog.extensionPackageNames,
		stdout: options.stdout ?? (() => {}),
		stderr: options.stderr ?? (() => {}),
		renderCapabilities: options.renderCapabilities ?? { canEmitAnsi: false },
		outputFormat: options.outputFormat ?? "human",
		...(options.onOutput === undefined ? {} : { onOutput: options.onOutput }),
		...(options.onProgress === undefined ? {} : { onProgress: options.onProgress }),
		...(options.confirm === undefined ? {} : { confirm: options.confirm }),
	});
}

export async function runNsCli(args: readonly string[], deps: RunNsCliDeps = {}): Promise<number> {
	const context =
		deps.context ??
		createRealNsCommandContext({
			textGenerator: new PiTextGenerator(),
			...(deps.cwd === undefined ? {} : { cwd: deps.cwd }),
			...(deps.env === undefined ? {} : { env: deps.env }),
			...(deps.homeDir === undefined ? {} : { homeDir: deps.homeDir }),
		});
	return await runCli(args, {
		...deps,
		context,
		entryMetaUrl: new URL("../cli.ts", import.meta.url).href,
		preinstalledCommandCatalog: loadPreinstalledNsCommandCatalog,
	});
}

const preinstalledExtensionRegistrations = [
	{
		packageName: "@nseng-ai/ns-init",
		descriptor: nsInitExtension,
		displayPath: "@nseng-ai/ns-init/ns-extension",
	},
	{
		packageName: "@nseng-ai/harness-artifacts",
		descriptor: harnessArtifactsExtension,
		displayPath: "@nseng-ai/harness-artifacts/ns-extension",
	},
] as const satisfies readonly PreinstalledNsExtensionRegistration[];

function loadPreinstalledNsCommandCatalog(): PreinstalledNsCommandCatalog {
	return preinstalledNsCommandCatalogFromRegistrations(preinstalledExtensionRegistrations);
}
