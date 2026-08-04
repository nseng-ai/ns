import path from "node:path";

import { defineExtension } from "@nseng-ai/sdk";

export default defineExtension({
	description: "List and provision ns-owned skills into assistant harnesses.",
	commandDirectory: path.join(import.meta.dirname, "cli"),
});
