// README-FENCE-7-START
// cli/issues/group.ts
import type { ClinkrGroupDefinition } from "@nseng-ai/clinkr";

export function group(): ClinkrGroupDefinition {
  return {
    description: "Work with issues.",
    summary: "Issue workflows",
    aliases: ["issue"],
    hidden: false,
    helpGroup: "Work",
  };
}
// README-FENCE-7-END
