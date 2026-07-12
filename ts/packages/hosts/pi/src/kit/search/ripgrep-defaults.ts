const RIPGREP_CONFIG_PATH = "RIPGREP_CONFIG_PATH";

export interface RipgrepDefaultsExtensionApi {
	on(event: "session_start" | "session_shutdown", handler: () => void): void;
}

export interface MutableEnvironment {
	[key: string]: string | undefined;
}

export interface RipgrepDefaultsOptions {
	environment: MutableEnvironment;
	configPath: string;
}

type PriorValue = { type: "absent" } | { type: "present"; value: string };
type LifecycleState = { type: "inactive" } | { type: "active"; priorValue: PriorValue };

export function registerRipgrepDefaultsExtension(
	pi: RipgrepDefaultsExtensionApi,
	options: RipgrepDefaultsOptions,
): void {
	let state: LifecycleState = { type: "inactive" };

	pi.on("session_start", () => {
		if (state.type === "active") {
			options.environment[RIPGREP_CONFIG_PATH] = options.configPath;
			return;
		}

		const priorValue = options.environment[RIPGREP_CONFIG_PATH];
		state = {
			type: "active",
			priorValue:
				priorValue === undefined ? { type: "absent" } : { type: "present", value: priorValue },
		};
		options.environment[RIPGREP_CONFIG_PATH] = options.configPath;
	});

	pi.on("session_shutdown", () => {
		if (state.type === "inactive") return;

		if (state.priorValue.type === "present") {
			options.environment[RIPGREP_CONFIG_PATH] = state.priorValue.value;
		} else {
			delete options.environment[RIPGREP_CONFIG_PATH];
		}
		state = { type: "inactive" };
	});
}
