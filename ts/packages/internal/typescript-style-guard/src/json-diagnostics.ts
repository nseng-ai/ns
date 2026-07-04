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
	const root = parseTree(content);
	const dependencyValueNode =
		root === undefined ? undefined : findNodeAtLocation(root, [field, dependencyName]);
	const dependencyPropertyNode = dependencyValueNode?.parent;
	const dependencyKeyNode =
		dependencyPropertyNode?.type === "property" ? dependencyPropertyNode.children?.[0] : undefined;
	if (dependencyKeyNode?.offset !== undefined)
		return lineAndColumnForOffset(content, dependencyKeyNode.offset);

	const fallbackOffset = content.indexOf(`"${dependencyName}"`);
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
