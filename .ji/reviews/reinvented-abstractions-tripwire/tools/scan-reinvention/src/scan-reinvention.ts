import { parseTypeScriptSource } from "@ji/core/typescript-analysis";

import { isReinventionKind, runDetectors } from "./detector-registry.ts";
import { RealScannerIo, type ScannerIo } from "./git-diff.ts";
import type { ReinventionCandidate, ReinventionKind, ReinventionOutput } from "./output-schema.ts";
import { reinventionKinds } from "./output-schema.ts";

export interface ScanReinventionOptions {
  readonly cwd: string;
  readonly diffBase: string;
  readonly files?: readonly string[];
  readonly isAddedOnly: boolean;
  readonly kinds?: readonly string[];
  readonly shouldIncludeExempt: boolean;
  readonly io?: ScannerIo;
}

export async function scanReinvention(options: ScanReinventionOptions): Promise<ReinventionOutput> {
  const diffBase = options.diffBase.trim();
  if (diffBase === "") {
    return failure("missing-diff-base", "--diff-base is required.");
  }

  const kinds = parseKinds(options.kinds ?? reinventionKinds);
  if (!kinds.ok) return failure("invalid-kind", kinds.message);

  const io = options.io ?? new RealScannerIo({ cwd: options.cwd });
  const files = await scanFiles(io, diffBase, options.files);
  if (!files.ok) return failure("file-discovery-failed", files.message);

  const candidates: ReinventionCandidate[] = [];
  for (const file of files.value) {
    const content = await io.readFile(file);
    if (!content.ok)
      return failure("read-file-failed", `Unable to read ${file}: ${content.message}`);
    const sourceFile = parseTypeScriptSource(file, content.value);
    const fileCandidates = runDetectors({ file, sourceFile }, kinds.value);
    const addedLines = options.isAddedOnly ? await io.addedLines(diffBase, file) : undefined;
    if (addedLines !== undefined && !addedLines.ok) {
      return failure("diff-lines-failed", addedLines.message);
    }
    for (const candidate of fileCandidates) {
      const isAddedLine = addedLines?.value.has(candidate.line) ?? false;
      if (options.isAddedOnly && !isAddedLine) continue;
      const candidateWithDiff = { ...candidate, isAddedLine };
      if (!options.shouldIncludeExempt && isStructurallyExempt(candidateWithDiff)) continue;
      candidates.push(candidateWithDiff);
    }
  }

  const sortedCandidates = candidates.sort(compareCandidates);
  return {
    success: true,
    summary: `${sortedCandidates.length} candidate${sortedCandidates.length === 1 ? "" : "s"} across ${files.value.length} scanned file${files.value.length === 1 ? "" : "s"}.`,
    scannedFiles: files.value.length,
    candidates: sortedCandidates,
  };
}

function parseKinds(
  values: readonly string[],
):
  | { readonly ok: true; readonly value: readonly ReinventionKind[] }
  | { readonly ok: false; readonly message: string } {
  const parsed: ReinventionKind[] = [];
  for (const value of values) {
    for (const part of value.split(",")) {
      const trimmed = part.trim();
      if (trimmed === "") continue;
      if (!isReinventionKind(trimmed))
        return { ok: false, message: `Unknown detector kind: ${trimmed}` };
      parsed.push(trimmed);
    }
  }
  return { ok: true, value: [...new Set(parsed)] };
}

async function scanFiles(
  io: ScannerIo,
  diffBase: string,
  files: readonly string[] | undefined,
): Promise<
  | { readonly ok: true; readonly value: readonly string[] }
  | { readonly ok: false; readonly message: string }
> {
  const rawFiles =
    files === undefined || files.length === 0
      ? await io.changedFiles(diffBase)
      : { ok: true as const, value: files };
  if (!rawFiles.ok) return rawFiles;
  return {
    ok: true,
    value: rawFiles.value
      .filter(isProductionTypeScriptFile)
      .sort((left, right) => left.localeCompare(right)),
  };
}

function isProductionTypeScriptFile(path: string): boolean {
  if (!(path.endsWith(".ts") || path.endsWith(".tsx"))) return false;
  if (path.endsWith(".d.ts")) return false;
  if (path.includes("/test/") || path.includes("/__tests__/")) return false;
  if (/\.test\.[cm]?tsx?$/u.test(path) || /\.spec\.[cm]?tsx?$/u.test(path)) return false;
  return !path.includes("/node_modules/");
}

function isStructurallyExempt(candidate: ReinventionCandidate): boolean {
  if (candidate.kind === "subprocess" && candidate.file.includes("ts/packages/infra/core/src/exec/"))
    return true;
  if (candidate.kind === "xdg-path" && /xdg|path-policy/u.test(candidate.file)) return true;
  return false;
}

function compareCandidates(left: ReinventionCandidate, right: ReinventionCandidate): number {
  return (
    left.file.localeCompare(right.file) ||
    left.line - right.line ||
    left.column - right.column ||
    left.kind.localeCompare(right.kind)
  );
}

function failure(code: string, message: string): ReinventionOutput {
  return { success: false, error: { code, message } };
}
