import { describe, expect, test } from "bun:test";

import { parseBrmemGetContent, parseBrmemListEntries, parseBrmemPutData } from "../src/brmem-gateway.ts";
import { PLAN_BRANCH_NAMESPACE } from "../src/constants.ts";

const BRANCH = "planned-branches/branch-scoped-plan";
const KEY = "branch-scoped-plan.md";
const CONTENT = "# Plan\n";
const COMMIT = "0123456789abcdef";
const SOURCE_FILE = "/tmp/branch-scoped-plan.md";
const REF = `refs/brmem/ns/${PLAN_BRANCH_NAMESPACE}/planned-branches---branch-scoped-plan:${KEY}`;

interface ParserCase {
	name: string;
	validData: Record<string, unknown>;
	parse: (stdout: string) => unknown;
}

const EXPECTED_LIST = { namespace: PLAN_BRANCH_NAMESPACE, branch: BRANCH };
const EXPECTED_GET = { namespace: PLAN_BRANCH_NAMESPACE, branch: BRANCH, key: KEY };

const VALID_PUT_DATA = {
	namespace: PLAN_BRANCH_NAMESPACE,
	key: KEY,
	branch: BRANCH,
	ref_name: REF,
	commit: COMMIT,
	source_file: SOURCE_FILE,
} satisfies Record<string, unknown>;

const VALID_LIST_ENTRY = {
	namespace: PLAN_BRANCH_NAMESPACE,
	key: KEY,
	branch: BRANCH,
	ref_name: REF,
} satisfies Record<string, unknown>;

const VALID_LIST_DATA = {
	namespace: PLAN_BRANCH_NAMESPACE,
	branch: BRANCH,
	entries: [VALID_LIST_ENTRY],
} satisfies Record<string, unknown>;

const VALID_GET_DATA = {
	namespace: PLAN_BRANCH_NAMESPACE,
	key: KEY,
	branch: BRANCH,
	content: CONTENT,
	ref_name: REF,
	target: REF,
	at: null,
} satisfies Record<string, unknown>;

const PARSER_CASES: ParserCase[] = [
	{
		name: "brmem put",
		validData: VALID_PUT_DATA,
		parse: parseBrmemPutData,
	},
	{
		name: "brmem list",
		validData: VALID_LIST_DATA,
		parse: (stdout) => parseBrmemListEntries(stdout, EXPECTED_LIST),
	},
	{
		name: "brmem get",
		validData: VALID_GET_DATA,
		parse: (stdout) => parseBrmemGetContent(stdout, EXPECTED_GET),
	},
];

function envelope(data: Record<string, unknown>, overrides: Record<string, unknown> = {}): string {
	return JSON.stringify({ exit_code: 0, data, ...overrides });
}

describe("Branch Memory machine envelope parsing", () => {
	test("keeps valid put, list, and get parser behavior", () => {
		expect(parseBrmemPutData(envelope(VALID_PUT_DATA))).toEqual({
			namespace: PLAN_BRANCH_NAMESPACE,
			key: KEY,
			branch: BRANCH,
			refName: REF,
			commit: COMMIT,
			sourceFile: SOURCE_FILE,
		});

		expect(parseBrmemListEntries(envelope(VALID_LIST_DATA), EXPECTED_LIST)).toEqual([
			{
				namespace: PLAN_BRANCH_NAMESPACE,
				key: KEY,
				branch: BRANCH,
				refName: REF,
			},
		]);

		expect(parseBrmemGetContent(envelope(VALID_GET_DATA), EXPECTED_GET)).toEqual({
			content: CONTENT,
			refName: REF,
		});
	});

	test("applies shared strict envelope failures to put, list, and get", () => {
		for (const parser of PARSER_CASES) {
			expect(() => parser.parse("{")).toThrow(new RegExp(`Malformed ${parser.name} JSON`));
			expect(() => parser.parse("[]")).toThrow(/expected an envelope object/);
			expect(() => parser.parse(JSON.stringify({ data: parser.validData }))).toThrow(/expected numeric exit_code/);
			expect(() => parser.parse(envelope(parser.validData, { exit_code: "0" }))).toThrow(/expected numeric exit_code/);
			expect(() => parser.parse(envelope({}, { exit_code: 2, message: "failed" }))).toThrow(/exit_code 2: failed/);
			expect(() => parser.parse(JSON.stringify({ exit_code: 0 }))).toThrow(/expected a data object/);
			expect(() => parser.parse(JSON.stringify({ exit_code: 0, data: [] }))).toThrow(/expected a data object/);
		}
	});

	test("keeps put body validation after the shared envelope parse", () => {
		expect(() => parseBrmemPutData(envelope({ ...VALID_PUT_DATA, source_file: undefined }))).toThrow(/expected string fields/);
	});

	test("keeps list body validation after the shared envelope parse", () => {
		expect(() => parseBrmemListEntries(envelope({}), EXPECTED_LIST)).toThrow(/expected data.entries array/);
		expect(() => parseBrmemListEntries(envelope({ entries: "not an array" }), EXPECTED_LIST)).toThrow(/expected data.entries array/);
		expect(() => parseBrmemListEntries(envelope({ entries: [null] }), EXPECTED_LIST)).toThrow(/expected data.entries\[0\] object/);
		expect(() => parseBrmemListEntries(envelope({ entries: [{ ...VALID_LIST_ENTRY, ref_name: undefined }] }), EXPECTED_LIST)).toThrow(
			/expected string fields/,
		);
		expect(() => parseBrmemListEntries(envelope({ entries: [{ ...VALID_LIST_ENTRY, namespace: "other" }] }), EXPECTED_LIST)).toThrow(
			/expected canonical entry/,
		);
		expect(() => parseBrmemListEntries(envelope({ entries: [{ ...VALID_LIST_ENTRY, branch: "other" }] }), EXPECTED_LIST)).toThrow(
			/expected canonical entry/,
		);
	});

	test("keeps get body validation after the shared envelope parse", () => {
		expect(() => parseBrmemGetContent(envelope({ ...VALID_GET_DATA, content: undefined }), EXPECTED_GET)).toThrow(/expected string fields/);
		expect(() => parseBrmemGetContent(envelope({ ...VALID_GET_DATA, namespace: "other" }), EXPECTED_GET)).toThrow(/expected requested data/);
		expect(() => parseBrmemGetContent(envelope({ ...VALID_GET_DATA, branch: "other" }), EXPECTED_GET)).toThrow(/expected requested data/);
		expect(() => parseBrmemGetContent(envelope({ ...VALID_GET_DATA, key: "other.md" }), EXPECTED_GET)).toThrow(/expected requested data/);
	});
});
