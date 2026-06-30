import { optionalEntry } from "@sdl/core/primitives";
import { ScriptedQueue } from "@sdl/test-kit";

export interface TextGenerationRequest {
	modelRef: string;
	system: string;
	prompt: string;
	maxTokens?: number;
	reasoning?: "minimal" | "low";
	operation?: string;
}

export interface TextGenerationUsage {
	inputTokens: number;
	outputTokens: number;
}

export type TextGenerationResult =
	| { ok: true; text: string; usage?: TextGenerationUsage }
	| { ok: false; error: string };

export interface TextGenerator {
	generateText(request: TextGenerationRequest): Promise<TextGenerationResult>;
}

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
		modelRef: request.modelRef,
		system: request.system,
		prompt: request.prompt,
		...optionalEntry("maxTokens", request.maxTokens),
		...optionalEntry("reasoning", request.reasoning),
		...optionalEntry("operation", request.operation),
	};
}
