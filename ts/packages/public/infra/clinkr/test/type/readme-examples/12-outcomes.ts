// README-FENCE-12-A-START
import { failure, negative, ok } from "@nseng-ai/clinkr/app";
// README-FENCE-12-A-END

interface Contact {
	readonly name: string;
	readonly isCorrupt: boolean;
}

declare function lookupContact(name: string): Promise<Contact | undefined>;

export const definition = {
// README-FENCE-12-B-START
handler: async (request) => {
	const record = await lookupContact(request.name);
	if (record === undefined) return negative(`No contact named ${request.name}.`);
	if (record.isCorrupt) return failure("corrupt-record", `Contact ${request.name} cannot be read.`);
	return ok(record);
},
// README-FENCE-12-B-END
} satisfies { handler: (request: { name: string }) => Promise<unknown> };
