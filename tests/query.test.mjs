import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { filterSnippets, querySnippets, searchSnippets, sortSnippets } from "../dist/services/query.js"

function snippet(overrides) {
	return {
		id: overrides.id,
		title: overrides.title ?? "Untitled",
		language: overrides.language ?? "cpp",
		category: overrides.category ?? "Arrays",
		difficulty: overrides.difficulty ?? "Easy",
		code: overrides.code ?? "",
		explanation: overrides.explanation ?? "",
		timeComplexity: "O(n)",
		spaceComplexity: "O(1)",
		notes: overrides.notes ?? "",
		tags: overrides.tags ?? [],
		favorite: overrides.favorite ?? false,
		isTemplate: overrides.isTemplate ?? false,
		createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
		updatedAt: overrides.updatedAt ?? overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
	}
}

const data = [
	snippet({
		id: "a",
		title: "Sliding window maximum",
		language: "cpp",
		category: "Sliding Window",
		difficulty: "Hard",
		code: "deque<int> dq;",
		notes: "monotonic deque",
		createdAt: "2026-03-01T00:00:00.000Z",
		updatedAt: "2026-03-05T00:00:00.000Z",
		favorite: true,
	}),
	snippet({
		id: "b",
		title: "Binary search template",
		language: "python",
		category: "Binary Search",
		difficulty: "Easy",
		code: "lo, hi = 0, len(a) - 1",
		explanation: "Half-open interval variant",
		tags: ["Template"],
		isTemplate: true,
		createdAt: "2026-02-01T00:00:00.000Z",
		updatedAt: "2026-02-01T00:00:00.000Z",
	}),
	snippet({
		id: "c",
		title: "Number of islands",
		language: "java",
		category: "Graphs",
		difficulty: "Medium",
		code: "void dfs(int r, int c)",
		createdAt: "2026-01-15T00:00:00.000Z",
		updatedAt: "2026-04-01T00:00:00.000Z",
	}),
]

describe("search", () => {
	it("returns everything for an empty query", () => {
		assert.equal(searchSnippets(data, "   ").length, 3)
	})

	it("is case-insensitive across title, code, explanation, notes and tags", () => {
		assert.deepEqual(searchSnippets(data, "ISLANDS").map((s) => s.id), ["c"])
		assert.deepEqual(searchSnippets(data, "deque<int>").map((s) => s.id), ["a"])
		assert.deepEqual(searchSnippets(data, "half-open").map((s) => s.id), ["b"])
		assert.deepEqual(searchSnippets(data, "MONOTONIC").map((s) => s.id), ["a"])
		assert.deepEqual(searchSnippets(data, "template").map((s) => s.id), ["b"])
	})

	it("returns an empty list when nothing matches", () => {
		assert.deepEqual(searchSnippets(data, "segment tree"), [])
	})
})

describe("filters", () => {
	it("filters by language, difficulty, category and favourites", () => {
		assert.deepEqual(filterSnippets(data, { language: "python" }).map((s) => s.id), ["b"])
		assert.deepEqual(filterSnippets(data, { difficulty: "Hard" }).map((s) => s.id), ["a"])
		assert.deepEqual(filterSnippets(data, { category: "Graphs" }).map((s) => s.id), ["c"])
		assert.deepEqual(filterSnippets(data, { favorite: "favorites" }).map((s) => s.id), ["a"])
	})

	it("separates templates from solutions", () => {
		assert.deepEqual(filterSnippets(data, { kind: "templates" }).map((s) => s.id), ["b"])
		assert.deepEqual(filterSnippets(data, { kind: "solutions" }).map((s) => s.id), ["a", "c"])
	})

	it("treats 'all' as no constraint and combines filters", () => {
		assert.equal(filterSnippets(data, { language: "all", difficulty: "all" }).length, 3)
		assert.deepEqual(
			filterSnippets(data, { language: "cpp", favorite: "favorites" }).map((s) => s.id),
			["a"],
		)
		assert.deepEqual(filterSnippets(data, { language: "cpp", difficulty: "Easy" }), [])
	})
})

describe("sorting", () => {
	it("sorts by creation date, both directions", () => {
		assert.deepEqual(sortSnippets(data, "newest").map((s) => s.id), ["a", "b", "c"])
		assert.deepEqual(sortSnippets(data, "oldest").map((s) => s.id), ["c", "b", "a"])
	})

	it("sorts by last update, alphabetically and by difficulty", () => {
		assert.deepEqual(sortSnippets(data, "recently-updated").map((s) => s.id), ["c", "a", "b"])
		assert.deepEqual(sortSnippets(data, "alphabetical").map((s) => s.id), ["b", "c", "a"])
		assert.deepEqual(sortSnippets(data, "difficulty").map((s) => s.id), ["b", "c", "a"])
	})

	it("is stable and non-mutating", () => {
		const tied = [
			snippet({ id: "z", title: "Same", createdAt: "2026-01-01T00:00:00.000Z" }),
			snippet({ id: "y", title: "Same", createdAt: "2026-01-01T00:00:00.000Z" }),
		]
		assert.deepEqual(sortSnippets(tied, "newest").map((s) => s.id), ["y", "z"])
		assert.deepEqual(sortSnippets(tied, "newest").map((s) => s.id), ["y", "z"])
		assert.deepEqual(data.map((s) => s.id), ["a", "b", "c"], "input array is untouched")
	})
})

describe("combined query", () => {
	it("applies search, then filters, then sorting", () => {
		const result = querySnippets(data, { search: "e", difficulty: "all", sort: "alphabetical" })
		assert.deepEqual(result.map((s) => s.id), ["b", "c", "a"])
	})
})
