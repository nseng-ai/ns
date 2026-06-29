import { defineExtension, failed, ok, z } from "sdl-sdk";
import type {
	ExecResult,
	PositionalSpec,
	SdlCommandRequest,
	SdlExtensionApi,
	SdlResult,
	TextGenerationRequest,
	TextGenerationResult,
	TextGenerator,
} from "sdl-sdk";

type Assert<T extends true> = T;
type IsAny<T> = 0 extends 1 & T ? true : false;
type IsEqual<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const commandSchema = z.object({
	name: z.string(),
	retries: z.number().int().default(0),
});

type CommandRequest = SdlCommandRequest<typeof commandSchema>;
type CommandRequestChecks = [
	Assert<IsAny<CommandRequest> extends false ? true : false>,
	Assert<IsEqual<CommandRequest, { name: string; retries: number }>>,
];

const commandRequestChecks: CommandRequestChecks = [true, true];
const positionalSpec: PositionalSpec = { position: 0 };

// @ts-expect-error name is required by the command schema output
const missingNameRequest: CommandRequest = { retries: 1 };

const extension = defineExtension({
	commands: [
		{
			name: "greet",
			summary: "Greet someone.",
			description: "Greet someone with retry metadata.",
			schema: commandSchema,
			positionals: { name: positionalSpec },
			run(_ctx, request) {
				type Request = typeof request;
				const checks: [
					Assert<IsAny<Request> extends false ? true : false>,
					Assert<IsEqual<Request, { name: string; retries: number }>>,
				] = [true, true];
				void checks;
				// @ts-expect-error missing is not part of the command schema
				void request.missing;
				return ok(`${request.name}:${request.retries}`);
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

const execResult: ExecResult = { code: 0, stdout: "ok", stderr: "", killed: false };
const commandOk: boolean = execResult.code === 0 && !execResult.killed;
const successfulResult: SdlResult = ok("done");
const failedResult: SdlResult = failed("nope", 2);

function acceptsExtensionApi(api: SdlExtensionApi): string {
	return api.cwd;
}

void commandRequestChecks;
void missingNameRequest;
void extension;
void commandlessExtension;
void textGenerator;
void commandOk;
void successfulResult;
void failedResult;
void acceptsExtensionApi;
