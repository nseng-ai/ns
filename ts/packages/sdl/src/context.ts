import { RealCheckpointGateway, type CheckpointGateway } from "./checkpoint.ts";
import { PiTextGenerationGateway } from "./pi-text-generation.ts";
import { DEFAULT_TEXT_BACKEND, type TextGenerationBackend, type TextGenerationGateway } from "./text-generation.ts";

export interface SdlContext {
	checkpoint: CheckpointGateway;
	textGeneration: TextGenerationGateway;
}

export function createTextGenerationGateway(backend: TextGenerationBackend = DEFAULT_TEXT_BACKEND): TextGenerationGateway {
	if (backend === "pi") {
		return new PiTextGenerationGateway();
	}

	return unreachableBackend(backend);
}

export function createRealSdlContext(): SdlContext {
	return {
		checkpoint: new RealCheckpointGateway(),
		textGeneration: createTextGenerationGateway(),
	};
}

function unreachableBackend(backend: never): never {
	throw new Error(`Unsupported text generation backend: ${backend}`);
}
