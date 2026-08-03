import path from "node:path";

import { defineExtension } from "@nseng-ai/sdk";

export default defineExtension({
	description: "Activate ns and manage extensions in a repository.",
	commandDirectory: path.join(import.meta.dirname, "cli"),
});
