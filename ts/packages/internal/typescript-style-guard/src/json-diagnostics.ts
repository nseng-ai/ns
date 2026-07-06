import { findNodeAtLocation, parseTree } from "jsonc-parser";

export interface TextPosition {
	readonly line: number;
	readonly column: number;
}

export function findManifestDependencyPosition(
	content: string,
	field: string,
	dependencyName: string,
): TextPosition {
	return findManifestKeyPosition(content, [field, dependencyName], dependencyName);
}

export function findManifestKeyPosition(
	content: string,
	keys: readonly string[],
	fallbackKey = keys.at(-1),
): TextPosition {
	const root = parseTree(content);
	const valueNode = root === undefined ? undefined : findNodeAtLocation(root, [...keys]);
	const propertyNode = valueNode?.parent;
	const keyNode = propertyNode?.type === "property" ? propertyNode.children?.[0] : undefined;
	if (keyNode?.offset !== undefined) return lineAndColumnForOffset(content, keyNode.offset);

	const fallbackOffset =
		fallbackKey === undefined ? -1 : content.indexOf(JSON.stringify(fallbackKey));
	if (fallbackOffset < 0) return { line: 1, column: 1 };
	return lineAndColumnForOffset(content, fallbackOffset);
}

export function lineAndColumnForOffset(content: string, offset: number): TextPosition {
	let line = 1;
	let column = 1;
	for (let index = 0; index < offset; index += 1) {
		if (content[index] === "\n") {
			line += 1;
			column = 1;
		} else {
			column += 1;
		}
	}
	return { line, column };
}
