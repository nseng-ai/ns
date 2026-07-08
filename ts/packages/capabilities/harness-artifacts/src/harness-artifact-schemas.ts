import { z } from "zod";

import { HARNESS_ARTIFACT_SOURCE_TYPES } from "./artifact-catalog.ts";
import { ALL_HARNESS_IDS, HARNESS_SCOPES } from "./harness-paths.ts";

export const harnessArtifactSourceTypeSchema = z.enum(HARNESS_ARTIFACT_SOURCE_TYPES);
export const harnessIdSchema = z.enum(ALL_HARNESS_IDS);
export const harnessScopeSchema = z.enum(HARNESS_SCOPES);
