export const reinventionKinds = [
  "subprocess",
  "interactive-confirm",
  "exact-optional-spread",
  "xdg-path",
  "hand-rolled-table",
  "raw-git",
  "machine-envelope-literal",
  "command-failure-format",
  "escape-regex",
  "osc8-hyperlink",
  "manual-truncation",
  "frontmatter-split",
] as const;

export type ReinventionKind = (typeof reinventionKinds)[number];
export type CandidatePrecision = "high" | "medium" | "low";

export interface ReinventionCandidate {
  readonly kind: ReinventionKind;
  readonly manifestRef: string;
  readonly canonical: string;
  readonly import: string;
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly snippet: string;
  readonly matchedTell: string;
  readonly isAddedLine: boolean;
  readonly precision: CandidatePrecision;
  readonly isSuppressed?: boolean;
  readonly suppressionReason?: string;
}

export interface ReinventionSuccess {
  readonly success: true;
  readonly summary: string;
  readonly scannedFiles: number;
  readonly candidates: readonly ReinventionCandidate[];
}

export interface ReinventionFailure {
  readonly success: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
}

export type ReinventionOutput = ReinventionSuccess | ReinventionFailure;

export function manifestRefForKind(kind: ReinventionKind): string {
  return `references/canonicals/${kind}.md`;
}
