import { brmemError, brmemOk, type BrmemResult } from "./contracts.ts";
import { FLAT_SEPARATOR } from "./ref-constants.ts";
import { validateBranchName, validateEntryKey, validateNamespaceName } from "./validation.ts";

export { FLAT_SEPARATOR } from "./ref-constants.ts";

export const BRMEM_REF_PREFIX = "refs/brmem";
export const BRMEM_BASE_SEGMENT = "base";
export const BRMEM_NS_SEGMENT = "ns";
export const BASE_NAMESPACE = "base";
export const ALL_NAMESPACES_SCOPE = "all";
export const BASE_NAMESPACE_CONFLICT_CODE = "base-and-namespace-conflict";
export const BASE_NAMESPACE_CONFLICT_MESSAGE = "--base and --namespace are mutually exclusive.";

export interface EntryCoordinate {
	namespace: string;
	key: string;
	branch: string;
}

export interface EntryRef extends EntryCoordinate {
	entryLocator: string;
}

export type NamespaceScopeConflict = {
	type: "conflict";
	code: typeof BASE_NAMESPACE_CONFLICT_CODE;
	message: typeof BASE_NAMESPACE_CONFLICT_MESSAGE;
};

export type NamespaceScopeResolution =
	| NamespaceScopeConflict
	| { type: "resolved"; scope: NamespaceScope };

export type AllNamespaceScope = {
	allNamespaces: true;
	namespaceScope: typeof ALL_NAMESPACES_SCOPE;
};
export type ScopedNamespaceScope = {
	allNamespaces: false;
	namespace: string;
};
export type NamespaceScope = AllNamespaceScope | ScopedNamespaceScope;

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

export function resolveOptionalNamespaceScope(request: {
	base: boolean;
	namespace?: string;
}): NamespaceScopeResolution {
	if (request.base && request.namespace !== undefined) return namespaceScopeConflict();
	if (!request.base && request.namespace === undefined) {
		return {
			type: "resolved",
			scope: { allNamespaces: true, namespaceScope: ALL_NAMESPACES_SCOPE },
		};
	}
	const namespace = request.base ? BASE_NAMESPACE : normalizeNamespaceOption(request.namespace);
	return {
		type: "resolved",
		scope: { allNamespaces: false, namespace },
	};
}

export function namespaceScopeLabel(scope: NamespaceScope): string {
	return scope.allNamespaces ? ALL_NAMESPACES_SCOPE : scope.namespace;
}

export function resolveRequiredNamespaceScope(request: {
	base: boolean;
	namespace?: string;
}):
	| NamespaceScopeConflict
	| { type: "resolved"; scope: ScopedNamespaceScope }
	| { type: "missing" } {
	const resolved = resolveOptionalNamespaceScope(request);
	if (resolved.type !== "resolved") return resolved;
	if (resolved.scope.allNamespaces) return { type: "missing" };
	return { type: "resolved", scope: resolved.scope };
}

function namespaceScopeConflict(): NamespaceScopeConflict {
	return {
		type: "conflict",
		code: BASE_NAMESPACE_CONFLICT_CODE,
		message: BASE_NAMESPACE_CONFLICT_MESSAGE,
	};
}

function isBaseNamespace(namespace: string): boolean {
	return namespace === BASE_NAMESPACE;
}

export function namespaceDisplayLabel(namespace: string): string {
	return isBaseNamespace(namespace) ? "Base Namespace" : `Namespace ${namespace}`;
}

export function namespaceValueLabel(namespace: string): string {
	return isBaseNamespace(namespace) ? "(base)" : namespace;
}

function namespaceSortKey(namespace: string): readonly [number, string] {
	return isBaseNamespace(namespace) ? [0, ""] : [1, namespace];
}

function entrySortKey(
	entry: Pick<EntryRef, "namespace" | "key" | "branch">,
): readonly [number, string, string, string] {
	const [namespaceRank, namespaceName] = namespaceSortKey(entry.namespace);
	return [namespaceRank, namespaceName, entry.key, entry.branch];
}

export function encodeBranchName(branch: string): BrmemResult<string> {
	const validation = validateBranchName(branch);
	if (validation.type === "invalid")
		return brmemError(
			"invalid-branch-name",
			`Invalid branch name ${JSON.stringify(branch)}: ${validation.reason}`,
		);
	return brmemOk(branch.replaceAll("/", FLAT_SEPARATOR));
}

export function decodeBranchName(encoded: string): string {
	return encoded.replaceAll(FLAT_SEPARATOR, "/");
}

export function buildSnapshotRef(namespace: string, branch: string): BrmemResult<string> {
	const encoded = encodeBranchName(branch);
	if (encoded.type === "error") return encoded;
	if (isBaseNamespace(namespace))
		return brmemOk(`${BRMEM_REF_PREFIX}/${BRMEM_BASE_SEGMENT}/${encoded.value}`);
	const namespaceValidation = validateNamespaceName(namespace);
	if (namespaceValidation.type === "invalid") {
		return brmemError(
			"invalid-namespace",
			`Invalid namespace ${JSON.stringify(namespace)}: ${namespaceValidation.reason}`,
		);
	}
	return brmemOk(`${BRMEM_REF_PREFIX}/${BRMEM_NS_SEGMENT}/${namespace}/${encoded.value}`);
}

export function buildEntryLocator(
	namespace: string,
	key: string,
	branch: string,
): BrmemResult<string> {
	const keyValidation = validateEntryKey(key);
	if (keyValidation.type === "invalid")
		return brmemError("invalid-key", `Invalid key ${JSON.stringify(key)}: ${keyValidation.reason}`);
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
		if (
			namespace.length === 0 ||
			isBaseNamespace(namespace) ||
			encodedBranch.length === 0 ||
			encodedBranch.includes("/")
		) {
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

function toEntryRef(namespace: string, key: string, branch: string): BrmemResult<EntryRef> {
	const locator = buildEntryLocator(namespace, key, branch);
	if (locator.type === "error") return locator;
	const snapshotRef = buildSnapshotRef(namespace, branch);
	if (snapshotRef.type === "error") return snapshotRef;
	return brmemOk({ namespace, key, branch, entryLocator: locator.value });
}

export function mustSnapshotRef(namespace: string, branch: string): string {
	const result = buildSnapshotRef(namespace, branch);
	if (result.type === "error") throw new Error(result.error.message);
	return result.value;
}

export function mustEntryLocator(namespace: string, key: string, branch: string): string {
	const result = buildEntryLocator(namespace, key, branch);
	if (result.type === "error") throw new Error(result.error.message);
	return result.value;
}

export function mustEntryRef(namespace: string, key: string, branch: string): EntryRef {
	const result = toEntryRef(namespace, key, branch);
	if (result.type === "error") throw new Error(result.error.message);
	return result.value;
}

export function compareEntries(left: EntryRef, right: EntryRef): number {
	return compareTuple(entrySortKey(left), entrySortKey(right));
}

function compareTuple(
	left: readonly (number | string)[],
	right: readonly (number | string)[],
): number {
	for (let index = 0; index < left.length; index += 1) {
		const leftValue = left[index];
		const rightValue = right[index];
		if (leftValue === rightValue) continue;
		if (leftValue === undefined) return -1;
		if (rightValue === undefined) return 1;
		return leftValue < rightValue ? -1 : 1;
	}
	return 0;
}
