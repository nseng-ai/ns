import { describe, expect, test } from "vitest";
import { isImportDeclaration } from "typescript";

import {
	moduleSpecifierText,
	parseTypeScriptSource,
	sourceLocationFields,
} from "../../src/typescript-analysis/index.ts";

describe("TypeScript analysis helpers", () => {
	test("parses source, reads module specifiers, and reports locations", () => {
		const sourceFile = parseTypeScriptSource("src/example.ts", "\nimport { x } from './x.ts';\n");
		const statement = sourceFile.statements[0];
		expect(statement).toBeDefined();
		if (statement === undefined || !isImportDeclaration(statement)) return;

		expect(moduleSpecifierText(statement)).toBe("./x.ts");
		expect(sourceLocationFields("src/example.ts", sourceFile, statement)).toEqual({
			path: "src/example.ts",
			line: 2,
			column: 1,
			text: "import { x } from './x.ts';",
		});
	});
});
