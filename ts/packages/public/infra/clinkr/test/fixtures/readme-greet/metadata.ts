// src/cli/metadata.ts
import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr";

export function metadata(): ClinkrCommandMetadata {
  return { description: "Greet a person." };
}