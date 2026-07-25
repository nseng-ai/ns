export const EXPOSURE_POLICIES = ["normal", "invoke-only", "command-backed"] as const;
export type ExposurePolicy = (typeof EXPOSURE_POLICIES)[number];

export const MANAGED_OPENAI_POLICY = "policy:\n  allow_implicit_invocation: false\n";

export interface SkillFacts {
  modelInvocationDisabled: boolean;
  managedSidecar: boolean;
  sidecarState: "missing" | "managed" | "unexpected" | "symlink";
  piExcluded: boolean;
  replacementSurface?: string;
  replacementVerified: boolean;
}

export interface SkillInspection {
  skill: string;
  canonicalPath: string;
  relativePath: string;
  policy: ExposurePolicy | "inconsistent";
  facts: SkillFacts;
  implications: readonly string[];
  replacementEvidence: string;
  diagnostics: readonly string[];
  skillMdText: string;
}

export type SkillOverlayOperation =
  | {
      type: "write";
      target: "skill-md";
      path: string;
      description: string;
      content: string;
    }
  | {
      type: "write";
      target: "sidecar";
      path: string;
      description: string;
      content: string;
    }
  | { type: "delete"; path: string; description: string }
  | { type: "remove-empty-dir"; path: string; description: string }
  | { type: "skip"; path: string; description: string; evidence: string };

export interface SkillPlan {
  skill: string;
  policy: ExposurePolicy;
  canonicalPath: string;
  relativePath: string;
  operations: readonly SkillOverlayOperation[];
}

export interface PiSettings {
  path: string;
  exists: boolean;
  data: Readonly<Record<string, unknown>>;
  exclusions: readonly string[];
}

export interface OperationResult {
  type: SkillOverlayOperation["type"] | "write-settings";
  path: string;
  outcome: "applied" | "skipped";
  evidence: string;
}

export interface SkillExposureBatch {
  plans: readonly SkillPlan[];
  initialSettings: PiSettings;
  finalSettings: PiSettings;
}

export interface SkillExposureGateway {
  readPiSettings(): Promise<PiSettings>;
  inspectSkill(input: string, settings: PiSettings): Promise<SkillInspection>;
  preflightBatch(batch: SkillExposureBatch): Promise<void>;
  applyBatch(batch: SkillExposureBatch): Promise<readonly OperationResult[]>;
}

export class SkillExposureInputError extends Error {}

export class SkillExposureRepositoryError extends Error {
  readonly errorType: string;
  readonly data: Readonly<Record<string, unknown>>;

  constructor(errorType: string, message: string, data: Readonly<Record<string, unknown>> = {}) {
    super(message);
    this.errorType = errorType;
    this.data = data;
  }
}

export class SkillExposureIoError extends SkillExposureRepositoryError {
  constructor(message: string, data: Readonly<Record<string, unknown>> = {}) {
    super("skill-exposure-io-error", message, data);
  }
}
