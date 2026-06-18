import { defineExtension, ok, z } from "@asdl/sdl/sdk";

type Assert<T extends true> = T;
type IsAny<T> = 0 extends (1 & T) ? true : false;
type IsEqual<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

const extension = defineExtension({
	commands: [
		{
			name: "first",
			description: "First command.",
			run() {
				return ok("first");
			},
		},
		{
			name: "second",
			description: "Second command.",
			schema: z.object({ second: z.string() }),
			run(_ctx, request) {
				return ok(request.second);
			},
		},
		{
			name: "third",
			description: "Third command.",
			schema: z.object({ third: z.number() }),
			run(_ctx, request) {
				return ok(String(request.third));
			},
		},
		{
			name: "fourth",
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
				request.missing;
				return ok(request.fourth ? "yes" : "no");
			},
		},
		{
			name: "fifth",
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
				request.missing;
				return ok(request.fifth);
			},
		},
	],
});

const commandlessExtension = defineExtension({});

void extension;
void commandlessExtension;
