export { runCli, buildCli, VERSION, type CliDeps } from "./cli.ts";
export { BASE_NAMESPACE, encodeBranchName, decodeBranchName, buildSnapshotRef, buildEntryLocator, parseSnapshotRef, parseEntryLocator, normalizeNamespaceOption } from "./ref-layout.ts";
export type { EntryRef, SnapshotRefParts, EntryLocatorParts } from "./ref-layout.ts";
export { validateBranchName, validateNamespaceName, validateEntryKey, validateKeyGlob } from "./validation.ts";
export type { ValidationResult } from "./validation.ts";
export type { BrmemGateway, EntryContent, EntryDiagnostic, PutEntryResult, DeleteEntryResult, CopyEntriesResult } from "./gateway.ts";
export type { BrmemErrorInfo, BrmemOptionalResult, BrmemResult } from "./contracts.ts";
