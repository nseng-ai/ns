import { expect } from "vitest";
import type { ClinkrContextfulApp } from "@nseng-ai/clinkr/app";

interface ContactsContext {
	readonly contacts: {
		list(): Promise<readonly string[]>;
		add(): Promise<void>;
	};
}

declare function app(): Promise<ClinkrContextfulApp<ContactsContext>>;

// README-FENCE-11-START
import { runForTest } from "@nseng-ai/clinkr/app/testing";

// Same as running "contacts list" from the CLI, but with injected dependencies.
const clinkr = await app();
const run = await runForTest(clinkr, ["list"], {
	context: {
		contacts: {
			list: async () => ["Ada", "Grace"],
			add: async () => {},
		},
	},
});

expect(run).toMatchObject({
	exitCode: 0,
	stdout: "Ada\nGrace\n",
	stderr: "",
});
// README-FENCE-11-END
