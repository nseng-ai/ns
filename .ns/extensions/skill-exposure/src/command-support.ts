import { failure, usageError } from "@nseng-ai/sdk";
import type { SkillInspection } from "./types.ts";
import { SkillExposureInputError, SkillExposureRepositoryError } from "./types.ts";

export function duplicateCanonicalInput(
  inspections: readonly SkillInspection[],
  inspection: SkillInspection,
): SkillExposureInputError | undefined {
  const first = inspections.find(
    (candidate) => candidate.canonicalPath === inspection.canonicalPath,
  );
  if (first === undefined) return undefined;
  return new SkillExposureInputError(
    `Duplicate skill input resolves to ${inspection.relativePath}: ${first.canonicalPath}`,
  );
}

export function commandError(error: unknown, paths: readonly string[]) {
  if (error instanceof SkillExposureInputError)
    return usageError(error.message, { paths: [...paths] });
  if (error instanceof SkillExposureRepositoryError)
    return failure(error.errorType, error.message, { ...error.data });
  return failure(
    "skill-exposure-unexpected-error",
    error instanceof Error ? error.message : String(error),
  );
}
