import type { Category, CategoryCount, PracticeSession, Snippet, Stats, Store } from "../types/models.js"
import { loadStore } from "../storage/repository.js"

/**
 * Statistics service. Everything is derived from practice history on demand -
 * no duplicated counters are persisted, so statistics can never drift out of
 * sync with the underlying sessions.
 */

const RECENT_LIMIT = 8

export function computeStats(
	history: readonly PracticeSession[],
	snippets: readonly Snippet[] = [],
): Stats {
	const byCategory = new Map<Category, CategoryCount>()
	const problems = new Set<string>()
	const solvedProblems = new Set<string>()
	const failedProblems = new Set<string>()
	let totalPracticeMs = 0
	let easySolved = 0
	let mediumSolved = 0
	let hardSolved = 0

	for (const session of history) {
		problems.add(session.problemId)
		totalPracticeMs += session.durationMs

		const bucket = byCategory.get(session.category) ?? {
			category: session.category,
			sessions: 0,
			durationMs: 0,
		}
		bucket.sessions += 1
		bucket.durationMs += session.durationMs
		byCategory.set(session.category, bucket)

		if (session.status === "solved") {
			solvedProblems.add(session.problemId)
			if (session.difficulty === "Easy") easySolved += 1
			else if (session.difficulty === "Medium") mediumSolved += 1
			else hardSolved += 1
		} else if (session.status === "failed") {
			failedProblems.add(session.problemId)
		}
	}

	// A problem counts as failed only if it was never solved afterwards.
	for (const problemId of solvedProblems) failedProblems.delete(problemId)

	const categoryBreakdown = [...byCategory.values()].sort(
		(a, b) => b.sessions - a.sessions || b.durationMs - a.durationMs || a.category.localeCompare(b.category),
	)

	const recentSessions = [...history]
		.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
		.slice(0, RECENT_LIMIT)

	return {
		totalProblems: problems.size,
		attemptedProblems: problems.size,
		solvedProblems: solvedProblems.size,
		failedProblems: failedProblems.size,
		totalPracticeMs,
		easySolved,
		mediumSolved,
		hardSolved,
		mostPracticedCategory: categoryBreakdown[0]?.category ?? null,
		categoryBreakdown,
		totalSnippets: snippets.length,
		favoriteSnippets: snippets.filter((snippet) => snippet.favorite).length,
		templateCount: snippets.filter((snippet) => snippet.isTemplate).length,
		recentSessions,
	}
}

export function statsFromStore(store: Store): Stats {
	return computeStats(store.practiceHistory, store.snippets)
}

export async function getStats(): Promise<Stats> {
	return statsFromStore(await loadStore())
}
