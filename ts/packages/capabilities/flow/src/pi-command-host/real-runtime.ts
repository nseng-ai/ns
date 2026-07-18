import type {
	CreateAgentSessionRuntimeFactory,
	ExtensionFactory,
} from "@earendil-works/pi-coding-agent";

import type { PiCommandRuntimeModule } from "./types.ts";

export async function loadRealPiCommandRuntimeModule(): Promise<PiCommandRuntimeModule> {
	const pi = await import("@earendil-works/pi-coding-agent");

	return {
		async runInteractive(request): Promise<void> {
			const agentDir = pi.getAgentDir();
			const lifecycleExtension: ExtensionFactory = (api) => {
				api.on("session_shutdown", request.targetLifecycle.onSessionShutdown);
			};
			const sessionManager = pi.SessionManager.inMemory(request.cwd);
			const createRuntime: CreateAgentSessionRuntimeFactory = async (options) => {
				const settingsManager = pi.SettingsManager.create(options.cwd, options.agentDir);
				const services = await pi.createAgentSessionServices({
					cwd: options.cwd,
					agentDir: options.agentDir,
					settingsManager,
					resourceLoaderOptions: {
						extensionFactories: [lifecycleExtension, ...request.extensionFactories],
						noExtensions: true,
						noSkills: true,
						noPromptTemplates: true,
						noContextFiles: true,
					},
				});
				request.onExtensionsLoaded();
				const created = await pi.createAgentSessionFromServices({
					services,
					sessionManager: options.sessionManager,
					...(options.sessionStartEvent === undefined
						? {}
						: { sessionStartEvent: options.sessionStartEvent }),
				});
				return { ...created, services, diagnostics: services.diagnostics };
			};
			const runtime = await pi.createAgentSessionRuntime(createRuntime, {
				cwd: request.cwd,
				agentDir,
				sessionManager,
			});
			const interactiveMode = new pi.InteractiveMode(runtime, {
				initialMessage: request.initialMessage,
			});
			await interactiveMode.run();
		},
	};
}
