// README-FENCE-4-A-START
// src/cli/contacts/find/metadata.ts
import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
  return {
    description: "Find a contact by name.",
    summary: "Find a contact",
    aliases: ["lookup"],
    helpGroup: "Contacts",
  };
}
// README-FENCE-4-A-END
