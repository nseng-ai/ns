import { noopNsProgress, type EffectiveProjectConfig, type NsExtensionApi } from "@nseng-ai/sdk";

const noProjectConfig: EffectiveProjectConfig = {
	get: async () => ({ ok: true, value: undefined }),
};

export function createFakeApi(overrides: Partial<NsExtensionApi> = {}): NsExtensionApi {
	return {
		cwd: "/repo",
		env: {},
		hasExtension: () => false,
		async exec() {
			throw new Error("Unexpected command execution in gs unit test.");
		},
		textGenerator: {
			async generateText() {
				throw new Error("Unexpected text generation in gs unit test.");
			},
		},
		commandIo: {
			phase: () => {},
			clearPhase: () => {},
			notify: () => {},
			message: () => {},
		},
		progress: noopNsProgress,
		renderCapabilities: { canEmitAnsi: false },
		projectConfig: noProjectConfig,
		outputFormat: "human",
		isInteractive: () => false,
		confirm: () => {
			throw new Error("Unexpected confirmation prompt in gs unit test.");
		},
		select: () => {
			throw new Error("Unexpected selection prompt in gs unit test.");
		},
		...overrides,
	};
}
