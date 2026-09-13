import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { computeStats } from "../dist/services/stats.js"

function session(overrides) {
	return {
		id: overrides.id,
		problemId: overrides.problemId,
		problemName: overrides.problemName ?? overrides.problemId,
		difficulty: overrides.difficulty ?? "Easy",
		category: overrides.category ?? "Arrays",
		language: overrides.language ?? "python",
		startedAt: overrides.startedAt ?? "2026-05-01T10:00:00.000Z",
		completedAt: overrides.completedAt ?? "2026-05-01T10:10:00.000Z",
		durationMs: overrides.durationMs ?? 600_000,
		status: overrides.status ?? "attempted",
		notes: "",
	}
}

const history = [
	session({ id: "1", problemId: "two-sum", status: "solved", durationMs: 300_000 }),
	session({ id: "2", problemId: "islands", category: "Graphs", difficulty: "Medium", status: "failed", durationMs: 900_000 }),
	session({
		id: "3",
		problemId: "islands",
		category: "Graphs",
		difficulty: "Medium",
		status: "solved",
		durationMs: 600_000,
		completedAt: "2026-05-02T10:10:00.000Z",
	}),
	session({ id: "4", problemId: "lru-cache", difficulty: "Hard", category: "Hashing", status: "failed", durationMs: 1_200_000 }),
	session({ id: "5", problemId: "climbing-stairs", status: "attempted", durationMs: 120_000 }),
	session({
		id: "6",
		problemId: "binary-search",
		category: "Binary Search",
		status: "solved",
		durationMs: 180_000,
		completedAt: "2026-05-03T10:10:00.000Z",
	}),
]

const snippets = [
	{ id: "s1", favorite: true, isTemplate: false },
	{ id: "s2", favorite: false, isTemplate: true },
	{ id: "s3", favorite: false, isTemplate: false },
]

describe("statistics", () => {
	const stats = computeStats(history, snippets)

	it("counts distinct attempted problems", () => {
		assert.equal(stats.totalProblems, 5)
		assert.equal(stats.attemptedProblems, 5)
	})

	it("counts solved problems once per problem", () => {
		assert.equal(stats.solvedProblems, 3)
	})

	it("counts a problem as failed only if it was never solved later", () => {
		assert.equal(stats.failedProblems, 1, "islands was solved after failing, lru-cache was not")
	})

	it("sums total practice time across all sessions", () => {
		assert.equal(stats.totalPracticeMs, 3_300_000)
	})

	it("breaks solved problems down by difficulty", () => {
		assert.equal(stats.easySolved, 2)
		assert.equal(stats.mediumSolved, 1)
		assert.equal(stats.hardSolved, 0)
	})

	it("identifies the most practised category", () => {
		assert.equal(stats.mostPracticedCategory, "Graphs")
		const graphs = stats.categoryBreakdown.find((entry) => entry.category === "Graphs")
		assert.equal(graphs.sessions, 2)
		assert.equal(graphs.durationMs, 1_500_000)
	})

	it("lists recent sessions newest first", () => {
		assert.deepEqual(stats.recentSessions.slice(0, 3).map((entry) => entry.id), ["6", "3", "1"])
	})

	it("summarises the snippet library", () => {
		assert.equal(stats.totalSnippets, 3)
		assert.equal(stats.favoriteSnippets, 1)
		assert.equal(stats.templateCount, 1)
	})

	it("returns an empty-but-valid shape with no history", () => {
		const empty = computeStats([], [])
		assert.equal(empty.totalProblems, 0)
		assert.equal(empty.solvedProblems, 0)
		assert.equal(empty.failedProblems, 0)
		assert.equal(empty.totalPracticeMs, 0)
		assert.equal(empty.mostPracticedCategory, null)
		assert.deepEqual(empty.recentSessions, [])
	})
})
