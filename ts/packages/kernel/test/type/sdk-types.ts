import { commandSucceeded, defineExtension, formatCommandEvidence, ok, z } from "sdl-sdk";
import type {
	SdlExtensionApi,
	TextGenerationRequest,
	TextGenerationResult,
	TextGenerator,
} from "sdl-sdk";

type Assert<T extends true> = T;
type IsAny<T> = 0 extends 1 & T ? true : false;
type IsEqual<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const extension = defineExtension({
	commands: [
		{
			name: "first",
			summary: "First.",
			description: "First command.",
			run() {
				return ok("first");
			},
		},
		{
			name: "second",
			summary: "Second.",
			description: "Second command.",
			schema: z.object({ second: z.string() }),
			run(_ctx, request) {
				return ok(request.second);
			},
		},
		{
			name: "third",
			summary: "Third.",
			description: "Third command.",
			schema: z.object({ third: z.number() }),
			run(_ctx, request) {
				return ok(String(request.third));
			},
		},
		{
			name: "fourth",
			summary: "Fourth.",
			description: "Fourth command.",
			schema: z.object({ fourth: z.boolean() }),
			run(_ctx, request) {
				type Request = typeof request;
				const checks: [
					Assert<IsAny<Request> extends false ? true : false>,
					Assert<IsEqual<Request, { fourth: boolean }>>,
				] = [true, true];
				void checks;
				// @ts-expect-error missing is not part of the fourth command schema
				void request.missing;
				return ok(request.fourth ? "yes" : "no");
			},
		},
		{
			name: "fifth",
			summary: "Fifth.",
			description: "Fifth command.",
			schema: z.object({ fifth: z.string() }),
			run(_ctx, request) {
				type Request = typeof request;
				const checks: [
					Assert<IsAny<Request> extends false ? true : false>,
					Assert<IsEqual<Request, { fifth: string }>>,
				] = [true, true];
				void checks;
				// @ts-expect-error missing is not part of the fifth command schema
				void request.missing;
				return ok(request.fifth);
			},
		},
	],
});

const commandlessExtension = defineExtension({});

const textGenerator: TextGenerator = {
	async generateText(request: TextGenerationRequest): Promise<TextGenerationResult> {
		return { ok: true, text: request.prompt };
	},
};

function acceptsExtensionApi(api: SdlExtensionApi): string {
	return api.cwd;
}

const arbitraryOperationRequest: TextGenerationRequest = {
	modelRef: "example-model",
	system: "system",
	prompt: "prompt",
	operation: "project-specific-operation",
};

const commandResult = { code: 0, stdout: "", stderr: "", killed: false };
const commandOk: boolean = commandSucceeded(commandResult);
const commandEvidence: string = formatCommandEvidence({
	intro: "Command finished.",
	command: "git status",
	cwd: "/repo",
	result: commandResult,
});

void extension;
void commandlessExtension;
void textGenerator;
void acceptsExtensionApi;
void arbitraryOperationRequest;
void commandOk;
void commandEvidence;
