import { RealCheckpointGateway, type CheckpointGateway } from "./checkpoint.ts";
import { PiTextGenerationGateway } from "./pi-text-generation.ts";
import type { TextGenerationGateway } from "./text-generation.ts";

export interface SdlContext {
	checkpoint: CheckpointGateway;
	textGeneration: TextGenerationGateway;
}

export function createTextGenerationGateway(): TextGenerationGateway {
	return new PiTextGenerationGateway();
}

export function createRealSdlContext(): SdlContext {
	return {
		checkpoint: new RealCheckpointGateway(),
		textGeneration: createTextGenerationGateway(),
	};
}
