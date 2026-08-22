import { noopNsProgress, type NsExtensionApi } from "@nseng-ai/sdk";

export function createFakeApi(overrides: Partial<NsExtensionApi> = {}): NsExtensionApi {
	return {
		cwd: "/repo",
		env: {},
		hasExtension: () => false,
		async exec() {
			throw new Error("Unexpected command execution in gh-stack unit test.");
		},
		textGenerator: {
			async generateText() {
				throw new Error("Unexpected text generation in gh-stack unit test.");
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
		outputFormat: "human",
		isInteractive: () => false,
		confirm: () => {
			throw new Error("Unexpected confirmation prompt in gh-stack unit test.");
		},
		select: () => {
			throw new Error("Unexpected selection prompt in gh-stack unit test.");
		},
		...overrides,
	};
}
