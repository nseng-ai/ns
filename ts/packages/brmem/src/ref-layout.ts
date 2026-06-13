import { brmemError, brmemOk, type BrmemResult } from "./contracts.ts";
import { validateBranchName, validateEntryKey, validateNamespaceName } from "./validation.ts";

export const BRMEM_REF_PREFIX = "refs/brmem";
export const BRMEM_BASE_SEGMENT = "base";
export const BRMEM_NS_SEGMENT = "ns";
export const BASE_NAMESPACE = "base";
export const FLAT_SEPARATOR = "---";

export interface NamespaceRef {
	namespace: string;
	branch: string;
	refName: string;
}

export interface EntryRef {
	namespace: string;
	key: string;
	branch: string;
	/** Legacy Python-compatible field name for the Entry Locator, not the Snapshot Ref. */
	refName: string;
	entryLocator: string;
}

export interface SnapshotRefParts {
	namespace: string;
	branch: string;
	refName: string;
}

export interface EntryLocatorParts {
	namespace: string;
	key: string;
	branch: string;
	refName: string;
	entryLocator: string;
}

export function normalizeNamespaceOption(namespace: string | undefined | null): string {
	return namespace ?? BASE_NAMESPACE;
}

export function isBaseNamespace(namespace: string): boolean {
	return namespace === BASE_NAMESPACE;
}

export function namespaceDisplayLabel(namespace: string): string {
	return isBaseNamespace(namespace) ? "Base Namespace" : `Namespace ${namespace}`;
}

export function namespaceValueLabel(namespace: string): string {
	return isBaseNamespace(namespace) ? "(base)" : namespace;
}

export function namespaceSortKey(namespace: string): readonly [number, string] {
	return isBaseNamespace(namespace) ? [0, ""] : [1, namespace];
}

export function entrySortKey(entry: Pick<EntryRef, "namespace" | "key" | "branch">): readonly [number, string, string, string] {
	const [namespaceRank, namespaceName] = namespaceSortKey(entry.namespace);
	return [namespaceRank, namespaceName, entry.key, entry.branch];
}

export function encodeBranchName(branch: string): BrmemResult<string> {
	const validation = validateBranchName(branch);
	if (validation.type === "invalid") return brmemError("invalid_branch_name", `Invalid branch name ${JSON.stringify(branch)}: ${validation.reason}`);
	return brmemOk(branch.replaceAll("/", FLAT_SEPARATOR));
}

export function decodeBranchName(encoded: string): string {
	return encoded.replaceAll(FLAT_SEPARATOR, "/");
}

export function buildSnapshotRef(namespace: string, branch: string): BrmemResult<string> {
	const encoded = encodeBranchName(branch);
	if (encoded.type === "error") return encoded;
	if (isBaseNamespace(namespace)) return brmemOk(`${BRMEM_REF_PREFIX}/${BRMEM_BASE_SEGMENT}/${encoded.value}`);
	const namespaceValidation = validateNamespaceName(namespace);
	if (namespaceValidation.type === "invalid") {
		return brmemError("invalid_namespace", `Invalid namespace ${JSON.stringify(namespace)}: ${namespaceValidation.reason}`);
	}
	return brmemOk(`${BRMEM_REF_PREFIX}/${BRMEM_NS_SEGMENT}/${namespace}/${encoded.value}`);
}

export function buildEntryLocator(namespace: string, key: string, branch: string): BrmemResult<string> {
	const keyValidation = validateEntryKey(key);
	if (keyValidation.type === "invalid") return brmemError("invalid_key", `Invalid key ${JSON.stringify(key)}: ${keyValidation.reason}`);
	const snapshotRef = buildSnapshotRef(namespace, branch);
	if (snapshotRef.type === "error") return snapshotRef;
	return brmemOk(`${snapshotRef.value}:${key}`);
}

export function parseSnapshotRef(ref: string): SnapshotRefParts | undefined {
	if (!ref.startsWith(`${BRMEM_REF_PREFIX}/`)) return undefined;
	const remainder = ref.slice(BRMEM_REF_PREFIX.length + 1);
	const slashIndex = remainder.indexOf("/");
	if (slashIndex < 0) return undefined;
	const head = remainder.slice(0, slashIndex);
	const tail = remainder.slice(slashIndex + 1);
	if (tail.length === 0) return undefined;
	if (head === BRMEM_BASE_SEGMENT) {
		if (tail.includes("/")) return undefined;
		return { namespace: BASE_NAMESPACE, branch: decodeBranchName(tail), refName: ref };
	}
	if (head === BRMEM_NS_SEGMENT) {
		const namespaceSeparator = tail.indexOf("/");
		if (namespaceSeparator < 0) return undefined;
		const namespace = tail.slice(0, namespaceSeparator);
		const encodedBranch = tail.slice(namespaceSeparator + 1);
		if (namespace.length === 0 || isBaseNamespace(namespace) || encodedBranch.length === 0 || encodedBranch.includes("/")) {
			return undefined;
		}
		return { namespace, branch: decodeBranchName(encodedBranch), refName: ref };
	}
	return undefined;
}

export function parseEntryLocator(locator: string): EntryLocatorParts | undefined {
	const separator = locator.indexOf(":");
	if (separator < 0) return undefined;
	const snapshotRef = locator.slice(0, separator);
	const key = locator.slice(separator + 1);
	if (key.length === 0) return undefined;
	const parsed = parseSnapshotRef(snapshotRef);
	if (parsed === undefined) return undefined;
	return {
		namespace: parsed.namespace,
		key,
		branch: parsed.branch,
		refName: parsed.refName,
		entryLocator: locator,
	};
}

export function snapshotRefPrefixes(): readonly string[] {
	return [`${BRMEM_REF_PREFIX}/${BRMEM_BASE_SEGMENT}/`, `${BRMEM_REF_PREFIX}/${BRMEM_NS_SEGMENT}/`];
}

export function toEntryRef(namespace: string, key: string, branch: string): BrmemResult<EntryRef> {
	const locator = buildEntryLocator(namespace, key, branch);
	if (locator.type === "error") return locator;
	const snapshotRef = buildSnapshotRef(namespace, branch);
	if (snapshotRef.type === "error") return snapshotRef;
	return brmemOk({ namespace, key, branch, refName: locator.value, entryLocator: locator.value });
}
