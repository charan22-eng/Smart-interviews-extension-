import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"

import { createMemoryArea, setStorageArea } from "../dist/storage/area.js"
import { loadStore } from "../dist/storage/repository.js"
import {
	buildDuplicate,
	buildSnippet,
	createSnippet,
	deleteSnippet,
	duplicateSnippet,
	getSelectedSnippet,
	getSnippet,
	listSnippets,
	selectSnippet,
	toggleFavorite,
	updateSnippet,
} from "../dist/services/snippets.js"

const sample = {
	title: "Two Sum - hash map",
	language: "python",
	category: "Hashing",
	difficulty: "Easy",
	code: "def two_sum(nums, target):\n    pass",
	explanation: "One pass with a value -> index map.",
	timeComplexity: "O(n)",
	spaceComplexity: "O(n)",
	notes: "Watch for duplicate values.",
	tags: ["hash-map", "array"],
}

describe("snippet service", () => {
	beforeEach(() => {
		setStorageArea(createMemoryArea())
	})

	it("creates a snippet with all 15 fields populated", async () => {
		const snippet = await createSnippet(sample)
		assert.match(snippet.id, /^snip_/)
		assert.equal(snippet.title, sample.title)
		assert.equal(snippet.language, "python")
		assert.equal(snippet.category, "Hashing")
		assert.equal(snippet.difficulty, "Easy")
		assert.equal(snippet.favorite, false)
		assert.equal(snippet.isTemplate, false)
		assert.deepEqual(snippet.tags, ["hash-map", "array"])
		assert.equal(snippet.createdAt, snippet.updatedAt)
	})

	it("rejects a snippet without a title", () => {
		assert.throws(() => buildSnippet({ title: "   " }), /title/i)
	})

	it("stores reusable templates", async () => {
		const template = await createSnippet({ ...sample, title: "C++ fast IO", isTemplate: true })
		assert.equal(template.isTemplate, true)
	})

	it("reads a snippet back by id", async () => {
		const created = await createSnippet(sample)
		const found = await getSnippet(created.id)
		assert.equal(found?.id, created.id)
		assert.equal(await getSnippet("missing"), null)
	})

	it("updates a snippet and bumps updatedAt only", async () => {
		const created = await createSnippet(sample)
		const updated = await updateSnippet(created.id, { title: "Two Sum (optimised)", difficulty: "Medium" })
		assert.equal(updated.title, "Two Sum (optimised)")
		assert.equal(updated.difficulty, "Medium")
		assert.equal(updated.createdAt, created.createdAt)
		assert.ok(new Date(updated.updatedAt) >= new Date(created.updatedAt))
	})

	it("reports a helpful error when updating a missing snippet", async () => {
		await assert.rejects(() => updateSnippet("nope", { title: "x" }), /no longer exists/)
	})

	it("deletes a snippet and clears related references", async () => {
		const created = await createSnippet(sample)
		await selectSnippet(created.id)
		await deleteSnippet(created.id)
		assert.deepEqual(await listSnippets(), [])
		assert.equal((await loadStore()).selectedSnippetId, null)
		assert.equal(await getSelectedSnippet(), null)
	})

	it("duplicates a snippet next to the original with a new id", async () => {
		const created = await createSnippet(sample)
		await createSnippet({ ...sample, title: "Other" })
		const copy = await duplicateSnippet(created.id)
		const all = await listSnippets()
		assert.notEqual(copy.id, created.id)
		assert.equal(copy.title, `${created.title} (copy)`)
		assert.equal(copy.code, created.code)
		assert.equal(all[1].id, copy.id, "copy is inserted directly after the original")
		assert.equal(all.length, 3)
	})

	it("never copies the favourite flag when duplicating", () => {
		const original = buildSnippet({ ...sample, favorite: true })
		assert.equal(buildDuplicate(original).favorite, false)
	})

	it("toggles favourite state", async () => {
		const created = await createSnippet(sample)
		assert.equal((await toggleFavorite(created.id)).favorite, true)
		assert.equal((await toggleFavorite(created.id)).favorite, false)
	})

	it("refuses to select a snippet that does not exist", async () => {
		await assert.rejects(() => selectSnippet("ghost"), /no longer exists/)
	})

	it("truncates oversized code instead of failing", async () => {
		const snippet = await createSnippet({ ...sample, code: "a".repeat(250_000) })
		assert.equal(snippet.code.length, 200_000)
	})
})
