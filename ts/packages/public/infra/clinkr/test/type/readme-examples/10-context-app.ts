interface Contacts {
	list(): Promise<readonly string[]>;
	add(): Promise<void>;
}

class RealContacts implements Contacts {
	async list(): Promise<readonly string[]> {
		return [];
	}

	async add(): Promise<void> {}
}

// README-FENCE-10-START
import { createClinkrApp } from "@nseng-ai/clinkr";

interface ContactsContext {
  readonly contacts: Contacts;
}

export async function app() {
  return createClinkrApp<ContactsContext>({
    name: "contacts",
    commandDirectory: import.meta.dirname,
    requiresContext: true,
  });
}

if (import.meta.main) {
  const clinkr = await app();
  const context: ContactsContext = { contacts: new RealContacts() };
  process.exitCode = await clinkr.run(process.argv.slice(2), { context });
}
// README-FENCE-10-END
