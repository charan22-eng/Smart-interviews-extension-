import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"

import { createMemoryArea, setStorageArea } from "../dist/storage/area.js"
import { loadStore } from "../dist/storage/repository.js"
import { createSnippet } from "../dist/services/snippets.js"
import { buildExport, exportJson, importJson, parseBundle } from "../dist/services/transfer.js"

const validBundle = {
	version: 1,
	exportedAt: "2026-05-01T00:00:00.000Z",
	snippets: [
		{
			id: "snip_imported",
			title: "Kadane's algorithm",
			language: "cpp",
			category: "Dynamic Programming",
			difficulty: "Medium",
			code: "int best = nums[0];",
			explanation: "Running maximum subarray sum.",
			timeComplexity: "O(n)",
			spaceComplexity: "O(1)",
			notes: "",
			tags: ["dp"],
			favorite: true,
			isTemplate: false,
			createdAt: "2026-04-01T00:00:00.000Z",
			updatedAt: "2026-04-02T00:00:00.000Z",
		},
	],
	settings: { theme: "dark", defaultLanguage: "cpp" },
	practiceHistory: [
		{
			id: "ses_imported",
			problemId: "max-subarray",
			problemName: "Maximum Subarray",
			difficulty: "Medium",
			category: "Dynamic Programming",
			language: "cpp",
			startedAt: "2026-04-01T10:00:00.000Z",
			completedAt: "2026-04-01T10:12:00.000Z",
			durationMs: 720_000,
			status: "solved",
			notes: "",
		},
	],
}

describe("export", () => {
	beforeEach(() => {
		setStorageArea(createMemoryArea())
	})

	it("produces a versioned bundle", async () => {
		await createSnippet({ title: "Export me", code: "x = 1", language: "python" })
		const text = await exportJson()
		const parsed = JSON.parse(text)
		assert.equal(parsed.version, 1)
		assert.equal(parsed.snippets.length, 1)
		assert.ok(Array.isArray(parsed.practiceHistory))
		assert.ok(parsed.settings && typeof parsed.settings === "object")
	})

	it("round-trips through import", async () => {
		await createSnippet({ title: "Round trip", code: "y = 2", language: "javascript" })
		const text = await exportJson()
		setStorageArea(createMemoryArea())
		const summary = await importJson(text)
		assert.equal(summary.snippetsAdded, 1)
		assert.equal((await loadStore()).snippets[0].title, "Round trip")
	})

	it("exports the store unchanged", () => {
		const bundle = buildExport(
			{ version: 1, snippets: [], settings: { theme: "dark" }, practiceHistory: [] },
			0,
		)
		assert.equal(bundle.version, 1)
		assert.equal(bundle.settings.theme, "dark")
	})
})

describe("import validation", () => {
	beforeEach(() => {
		setStorageArea(createMemoryArea())
	})

	it("accepts a valid bundle", () => {
		const { bundle, issues } = parseBundle(JSON.stringify(validBundle))
		assert.equal(bundle.snippets.length, 1)
		assert.equal(bundle.practiceHistory.length, 1)
		assert.equal(bundle.settings.theme, "dark")
		assert.deepEqual(issues, [])
	})

	it("rejects invalid JSON with a readable message", () => {
		assert.throws(() => parseBundle("{ not json"), /not valid JSON/)
	})

	it("rejects a non-object top level and wrong field types", () => {
		assert.throws(() => parseBundle("[1,2,3]"), /JSON object/)
		assert.throws(() => parseBundle('{"version":1,"snippets":"nope"}'), /must be an array/)
		assert.throws(() => parseBundle('{"version":1,"practiceHistory":42}'), /must be an array/)
	})

	it("rejects a newer incompatible version", () => {
		assert.throws(() => parseBundle('{"version":99,"snippets":[]}'), /newer version/)
	})

	it("upgrades an older version and reports it", () => {
		const { issues } = parseBundle('{"version":0,"snippets":[{"title":"Old","code":"a"}]}')
		assert.ok(issues.some((line) => line.includes("Upgrading imported data")))
	})

	it("skips records with missing required fields but keeps the rest", () => {
		const { bundle, issues } = parseBundle(
			JSON.stringify({
				version: 1,
				snippets: [{ code: "no title" }, { title: "Keeper", code: "ok" }],
				practiceHistory: [{ problemName: "Nameless", status: "invented" }],
			}),
		)
		assert.equal(bundle.snippets.length, 1)
		assert.equal(bundle.snippets[0].title, "Keeper")
		assert.equal(bundle.practiceHistory.length, 0)
		assert.ok(issues.some((line) => line.includes("Skipped")))
	})

	it("fills in defaults for records with unknown enum values", () => {
		const { bundle, issues } = parseBundle(
			JSON.stringify({ version: 1, snippets: [{ title: "Odd", code: "a", language: "rust" }] }),
		)
		assert.equal(bundle.snippets[0].language, "cpp")
		assert.ok(issues.some((line) => line.includes("language defaulted")))
	})

	it("accepts the documented settings-as-array shape", () => {
		const { bundle, issues } = parseBundle(
			'{"version":1,"snippets":[],"settings":[{"theme":"light"}],"practiceHistory":[]}',
		)
		assert.equal(bundle.settings.theme, "light")
		assert.ok(issues.some((line) => line.includes("array")))
	})

	it("rejects a file with nothing importable", () => {
		assert.throws(() => parseBundle('{"version":1,"snippets":[],"practiceHistory":[]}'), /Nothing importable/)
	})

	it("never executes imported content", () => {
		globalThis.__pwned = false
		const { bundle } = parseBundle(
			JSON.stringify({
				version: 1,
				snippets: [{ title: "XSS attempt", code: "<script>globalThis.__pwned = true</script>" }],
			}),
		)
		assert.equal(globalThis.__pwned, false)
		assert.equal(bundle.snippets[0].code, "<script>globalThis.__pwned = true</script>")
	})
})

describe("import merge behaviour", () => {
	beforeEach(() => {
		setStorageArea(createMemoryArea())
	})

	it("merges into existing data without touching it", async () => {
		await createSnippet({ title: "Existing", code: "e", language: "c" })
		const summary = await importJson(JSON.stringify(validBundle))
		const store = await loadStore()
		assert.equal(summary.snippetsAdded, 1)
		assert.equal(summary.sessionsAdded, 1)
		assert.equal(store.snippets.length, 2)
		assert.equal(summary.settingsApplied, false)
		assert.equal(store.settings.theme, "system", "settings are only applied when asked for")
	})

	it("skips duplicates on a second import", async () => {
		await importJson(JSON.stringify(validBundle))
		const second = await importJson(JSON.stringify(validBundle))
		assert.equal(second.snippetsAdded, 0)
		assert.equal(second.snippetsSkipped, 1)
		assert.equal(second.sessionsSkipped, 1)
		assert.equal((await loadStore()).snippets.length, 1)
	})

	it("detects duplicates by title + code even with a different id", async () => {
		await importJson(JSON.stringify(validBundle))
		const renamed = {
			...validBundle,
			snippets: [{ ...validBundle.snippets[0], id: "snip_other" }],
			practiceHistory: [],
		}
		const summary = await importJson(JSON.stringify(renamed))
		assert.equal(summary.snippetsAdded, 0)
		assert.equal(summary.snippetsSkipped, 1)
	})

	it("replaces existing data when asked, and can apply settings", async () => {
		await createSnippet({ title: "Existing", code: "e", language: "c" })
		const summary = await importJson(JSON.stringify(validBundle), {
			mode: "replace",
			applySettings: true,
		})
		const store = await loadStore()
		assert.equal(summary.mode, "replace")
		assert.equal(store.snippets.length, 1)
		assert.equal(store.snippets[0].title, "Kadane's algorithm")
		assert.equal(store.settings.theme, "dark")
	})
})
