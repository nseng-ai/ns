import { optionalEntries } from "@nseng-ai/foundation/primitives";
import { ScriptedQueue } from "@nseng-ai/foundation/test-kit";

import type {
	TextGenerationRequest,
	TextGenerationResult,
	TextGenerator,
} from "./text-generation.ts";
export type {
	TextGenerationRequest,
	TextGenerationResult,
	TextGenerationUsage,
	TextGenerator,
} from "./text-generation.ts";

export type ScriptedTextGenerationStep = TextGenerationResult | Promise<TextGenerationResult>;

export class ScriptedTextGenerator implements TextGenerator {
	private readonly requestsInternal: TextGenerationRequest[] = [];
	private readonly script: ScriptedQueue<ScriptedTextGenerationStep>;

	constructor(script: readonly ScriptedTextGenerationStep[]) {
		this.script = new ScriptedQueue(script, copyIdentity);
	}

	get requests(): readonly TextGenerationRequest[] {
		return this.requestsInternal.map(copyTextGenerationRequest);
	}

	readonly generateText: TextGenerator["generateText"] = async (request) => {
		this.requestsInternal.push(copyTextGenerationRequest(request));
		const message = "unexpected text generation request";
		const result = this.script.shiftOrRecordError(message);
		if (result === undefined) {
			return { ok: false, error: message };
		}
		return await result;
	};

	assertDone(): void {
		this.script.assertDone();
	}
}

function copyIdentity<TValue>(value: TValue): TValue {
	return value;
}

function copyTextGenerationRequest(request: TextGenerationRequest): TextGenerationRequest {
	return {
		modelSelection: { ...request.modelSelection },
		system: request.system,
		prompt: request.prompt,
		...optionalEntries({
			maxTokens: request.maxTokens,
			operation: request.operation,
		}),
	};
}
