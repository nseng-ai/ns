import { defineExtension } from "@nseng-ai/sdk";

export default defineExtension({
  group: "skill-exposure",
  description: "Inspect and reconcile repository skill exposure overlays.",
  entries: [
    { name: "apply", load: () => import("./commands/apply.ts") },
    { name: "show", load: () => import("./commands/show.ts") },
    { name: "check", load: () => import("./commands/check.ts") },
  ],
});
