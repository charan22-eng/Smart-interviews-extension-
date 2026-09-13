import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"

import { StorageError, createFailingArea, createMemoryArea, setStorageArea } from "../dist/storage/area.js"
import { loadStore, loadStoreWithRepairs, mutateStore, resetStore } from "../dist/storage/repository.js"
import { defaultStore, normalizeSettings, normalizeStore, sanitizeLocalOrigin } from "../dist/storage/schema.js"
import { STORAGE_KEY } from "../dist/utils/constants.js"

describe("storage schema", () => {
	it("returns defaults on first installation (no stored data)", () => {
		const { store, repairs } = normalizeStore(undefined)
		assert.deepEqual(store, defaultStore())
		assert.deepEqual(repairs, [], "a fresh install is not a repair")
	})

	it("recovers from completely corrupt data", () => {
		const { store, repairs } = normalizeStore("not-an-object")
		assert.deepEqual(store.snippets, [])
		assert.equal(repairs.length, 1)
	})

	it("drops invalid records but keeps the valid ones", () => {
		const { store, repairs } = normalizeStore({
			version: 1,
			snippets: [
				{ title: "Good", code: "x", language: "python", category: "Arrays", difficulty: "Easy" },
				{ code: "no title" },
				"garbage",
			],
		})
		assert.equal(store.snippets.length, 1)
		assert.equal(store.snippets[0].title, "Good")
		assert.ok(repairs.some((line) => line.includes("missing title")))
	})

	it("migrates unversioned legacy data", () => {
		const { store, repairs } = normalizeStore({ snippets: [{ title: "Legacy", code: "a" }] })
		assert.equal(store.version, 1)
		assert.equal(store.snippets.length, 1)
		assert.ok(repairs.some((line) => line.includes("schema version")))
	})

	it("reports data written by a newer schema version", () => {
		const { repairs } = normalizeStore({ version: 99, snippets: [] })
		assert.ok(repairs.some((line) => line.includes("newer version")))
	})

	it("ignores prototype-polluting payloads", () => {
		const payload = JSON.parse('{"version":1,"snippets":[],"__proto__":{"polluted":true}}')
		const { store } = normalizeStore(payload)
		assert.deepEqual(store.snippets, [])
		assert.equal({}.polluted, undefined)
	})

	it("coerces unknown settings values to safe defaults", () => {
		const settings = normalizeSettings({ theme: "neon", editorTabSize: 99, defaultLanguage: "cobol" })
		assert.equal(settings.theme, "system")
		assert.equal(settings.editorTabSize, 8)
		assert.equal(settings.defaultLanguage, "cpp")
	})

	it("accepts only localhost practice origins", () => {
		assert.equal(sanitizeLocalOrigin("http://localhost:5173/practice"), "http://localhost:5173")
		assert.equal(sanitizeLocalOrigin("http://127.0.0.1:8080"), "http://127.0.0.1:8080")
		assert.equal(sanitizeLocalOrigin("https://example.com"), "")
		assert.equal(sanitizeLocalOrigin("not a url"), "")
	})
})

describe("storage repository", () => {
	beforeEach(() => {
		setStorageArea(createMemoryArea())
	})

	it("saves and retrieves data", async () => {
		await mutateStore((store) => {
			store.settings.defaultLanguage = "python"
		})
		const store = await loadStore()
		assert.equal(store.settings.defaultLanguage, "python")
	})

	it("updates and deletes values", async () => {
		await mutateStore((store) => {
			store.settings.timerAutoStart = true
		})
		assert.equal((await loadStore()).settings.timerAutoStart, true)
		const fresh = await resetStore()
		assert.equal(fresh.settings.timerAutoStart, false)
	})

	it("serialises concurrent read-modify-write operations", async () => {
		await Promise.all(
			Array.from({ length: 25 }, (_unused, index) =>
				mutateStore((store) => {
					store.practiceHistory.push({
						id: `ses_${index}`,
						problemId: "two-sum",
						problemName: "Two Sum",
						difficulty: "Easy",
						category: "Arrays",
						language: "python",
						startedAt: new Date(1700000000000).toISOString(),
						completedAt: new Date(1700000060000).toISOString(),
						durationMs: 60000,
						status: "solved",
						notes: "",
					})
				}),
			),
		)
		const store = await loadStore()
		assert.equal(store.practiceHistory.length, 25, "no update may be lost")
	})

	it("persists repaired data so repairs are reported once", async () => {
		const area = createMemoryArea({ [STORAGE_KEY]: { snippets: [{ title: "Legacy", code: "a" }] } })
		setStorageArea(area)
		const first = await loadStoreWithRepairs()
		assert.ok(first.repairs.length > 0)
		const second = await loadStoreWithRepairs()
		assert.deepEqual(second.repairs, [])
		assert.equal(second.store.snippets.length, 1)
	})

	it("surfaces storage failures as StorageError", async () => {
		setStorageArea(createFailingArea("QUOTA_BYTES quota exceeded"))
		await assert.rejects(() => loadStore(), (error) => {
			assert.ok(error instanceof StorageError)
			assert.match(error.message, /quota exceeded/)
			return true
		})
	})

	it("keeps working after a failed operation (queue is not poisoned)", async () => {
		setStorageArea(createFailingArea())
		await assert.rejects(() => loadStore())
		setStorageArea(createMemoryArea())
		const store = await loadStore()
		assert.deepEqual(store.snippets, [])
	})

	it("reports a clear error when chrome.storage is unavailable", async () => {
		setStorageArea(null)
		await assert.rejects(() => loadStore(), /storage is unavailable/i)
		setStorageArea(createMemoryArea())
	})
})
