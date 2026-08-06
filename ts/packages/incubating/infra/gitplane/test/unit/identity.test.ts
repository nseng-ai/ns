import { expect, test } from "vitest";
import {
	createArtifactIdGenerator,
	deriveAttemptId,
	deriveEventId,
	deriveRevisionId,
	digestArtifactContent,
	parseArtifactId,
} from "@nseng-ai/gitplane";
const parsed = parseArtifactId("01jxyz8y3jqazj7jrx53w9b3dn");
if (!parsed.ok) throw new Error();
const artifactId = parsed.artifactId;
test("generates a canonical artifact ID from the injected clock", () => {
	const generator = createArtifactIdGenerator({
		clock: { now: () => new Date(1_469_918_176_385) },
	});
	const generated = generator.generateArtifactId();
	expect(generated).toMatch(/^01aryz6s41[0123456789abcdefghjkmnpqrstvwxyz]{16}$/);
	expect(parseArtifactId(generated).ok).toBe(true);
});
const entries = [
	{
		path: "gitplane-artifact.json",
		kind: "regular-file" as const,
		bytes: Buffer.from('{"gpId":"x"}\n'),
	},
	{ path: "nested/a.txt", kind: "regular-file" as const, bytes: Buffer.from("hello") },
];
test("matches digest and revision vectors", () => {
	const digest = digestArtifactContent(entries);
	expect(digest).toMatchObject({
		ok: true,
		value: { text: "sha256:87e2f32ad9e0ec475ddd61fe00423d2d82aa87aab4ad9617d2eaf8e690b5ffbb" },
	});
	if (!digest.ok) throw new Error();
	expect(
		deriveRevisionId({
			sourceId: "acme/greetings",
			artifactId,
			artifactPath: "artifacts/greetings/welcome",
			contentDigest: digest.value.bytes,
		}),
	).toBe("gpr_mx26exrcrx4etqhds8y5fx04gjas5d036zjq3rtvthe1xjemk41g");
});
test("repository-relative artifact path changes revision identity", () => {
	const digest = digestArtifactContent(entries);
	if (!digest.ok) throw new Error();
	const deriveAt = (artifactPath: string) =>
		deriveRevisionId({
			sourceId: "acme/greetings",
			artifactId,
			artifactPath,
			contentDigest: digest.value.bytes,
		});
	expect(deriveAt("artifacts/a")).not.toBe(deriveAt("artifacts/b"));
});

test("outer location is excluded from content digest while internal names and bytes matter", () => {
	const first = digestArtifactContent(entries);
	const mode = digestArtifactContent(entries.map((entry) => ({ ...entry, mode: "100755" })));
	const rename = digestArtifactContent(
		entries.map((entry) =>
			entry.path === "nested/a.txt" ? { ...entry, path: "nested/b.txt" } : entry,
		),
	);
	expect(first).toEqual(mode);
	expect(rename).not.toEqual(first);
});
test("rejects special entries", () => {
	for (const kind of ["symlink", "submodule", "directory", "special"] as const)
		expect(digestArtifactContent([{ path: "x", kind }])).toMatchObject({
			ok: false,
			code: "invalid-entry-kind",
		});
});

test.each(["", ".", "./", "a//b", "a/"])("rejects non-normalized path %j", (entryPath) => {
	expect(
		digestArtifactContent([{ path: entryPath, kind: "regular-file", bytes: new Uint8Array() }]),
	).toMatchObject({ ok: false, code: "invalid-path" });
});

test("rejects duplicate paths", () => {
	expect(
		digestArtifactContent([
			{ path: "same", kind: "regular-file", bytes: Buffer.from("one") },
			{ path: "same", kind: "regular-file", bytes: Buffer.from("two") },
		]),
	).toMatchObject({ ok: false, code: "invalid-path" });
});
test("matches generation-aware attempt literal vector", () => {
	expect(
		deriveAttemptId({
			sourceId: "acme/greetings",
			expectedGeneration: 7,
			targetCommit: "abc123",
		}),
	).toBe("gpa_xh5nfn6vjae24kwah25p63xv63hfycstkaqnxq3xwsr9w6dyreng");
});

test.each([
	["artifact.created", "gpe_9608zkb02462te4c5fs3dwf4ndz6k57ssm93cstbvys5xx6n2vdg"],
	["artifact.restored", "gpe_x9b5ry0n83fj2tj0vsbfs0a3wmpk5d8fmp697degwhvj1f3bw75g"],
	["artifact.revised", "gpe_q3m8m607vb5m30jd2y9y5r9ahegjfjq39nsq5a1mf6bt9cm0ef60"],
	["artifact.deleted", "gpe_kxjjsbjn2jv4pezjr02xwaxt56h78y44f99r71sz578pyzjyegrg"],
] as const)("matches the retry-stable %s event literal vector", (eventType, expected) => {
	const options = {
		sourceId: "acme/greetings",
		artifactId,
		reconciliationGeneration: 8,
		attemptId: "gpa_attempt",
		reconciledCommit: "abc123",
		eventType,
	};
	expect(deriveEventId(options)).toBe(expected);
	expect(deriveEventId(options)).toBe(deriveEventId(options));
});

test("generation and attempt changes affect event identity", () => {
	const options = {
		sourceId: "acme/greetings",
		artifactId,
		reconciliationGeneration: 8,
		attemptId: "gpa_attempt",
		reconciledCommit: "abc123",
		eventType: "artifact.revised" as const,
	};
	const identity = deriveEventId(options);
	expect(deriveEventId({ ...options, reconciliationGeneration: 9 })).not.toBe(identity);
	expect(deriveEventId({ ...options, attemptId: "gpa_later" })).not.toBe(identity);
});

test("matches the repeated-target later reconciliation literal vector", () => {
	expect(
		deriveEventId({
			sourceId: "acme/greetings",
			artifactId,
			reconciliationGeneration: 9,
			attemptId: "gpa_later",
			reconciledCommit: "abc123",
			eventType: "artifact.revised",
		}),
	).toBe("gpe_299cy197f09jwk7r5vnxzhnwdas7ybrps2x076ej4gm4ckxv8rk0");
});
