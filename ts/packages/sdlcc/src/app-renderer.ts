import { runRealCommand, type CommandRunner } from "./command-runner.ts";
import { dashboardTabModule } from "./dashboard-tab.ts";
import { stackMapTabModule } from "./stack-map-tab.ts";
import { createTabController, type TabController } from "./tabs/tab-controller.ts";
import { startTabHostTui } from "./tabs/tab-host-renderer.ts";

export type SdlccAppTabId = "dashboard" | "stack-map";

export interface StartAppShellOptions {
	readonly initialTabId?: SdlccAppTabId | undefined;
	readonly cwd?: string | undefined;
	readonly env?: Record<string, string | undefined> | undefined;
	readonly runCommand?: CommandRunner | undefined;
}

export async function startDefaultApp(): Promise<void> {
	await startAppShell({ initialTabId: "dashboard" });
}

export async function startStackMapApp(): Promise<void> {
	await startAppShell({ initialTabId: "stack-map" });
}

export async function startAppShell(options: StartAppShellOptions = {}): Promise<void> {
	const cwd = options.cwd ?? process.cwd();
	const env = options.env ?? process.env;
	const runCommand = options.runCommand ?? runRealCommand;
	await startTabHostTui({
		controllers: createSdlccAppControllers(),
		deps: { cwd, env, runCommand },
		initialTabId: options.initialTabId ?? "dashboard",
	});
}

export function createSdlccAppControllers(): readonly TabController[] {
	return [createTabController(dashboardTabModule), createTabController(stackMapTabModule)];
}
