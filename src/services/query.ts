import type { Category, Difficulty, Language, Snippet, SortOrder } from "../types/models.js"
import { DIFFICULTY_RANK } from "../utils/constants.js"

/** Pure search / filter / sort. No storage access, so it is trivially testable. */

export interface SnippetFilters {
	language?: Language | "all"
	difficulty?: Difficulty | "all"
	category?: Category | "all"
	favorite?: "all" | "favorites"
	kind?: "all" | "solutions" | "templates"
}

export interface SnippetQuery extends SnippetFilters {
	search?: string
	sort?: SortOrder
}

/** Case-insensitive search over title, code, explanation, notes and tags. */
export function searchSnippets(snippets: readonly Snippet[], term: string): Snippet[] {
	const needle = term.trim().toLowerCase()
	if (needle === "") return [...snippets]
	return snippets.filter((snippet) => {
		if (snippet.title.toLowerCase().includes(needle)) return true
		if (snippet.code.toLowerCase().includes(needle)) return true
		if (snippet.explanation.toLowerCase().includes(needle)) return true
		if (snippet.notes.toLowerCase().includes(needle)) return true
		return snippet.tags.some((tag) => tag.toLowerCase().includes(needle))
	})
}

export function filterSnippets(snippets: readonly Snippet[], filters: SnippetFilters): Snippet[] {
	return snippets.filter((snippet) => {
		if (filters.language && filters.language !== "all" && snippet.language !== filters.language) return false
		if (filters.difficulty && filters.difficulty !== "all" && snippet.difficulty !== filters.difficulty) {
			return false
		}
		if (filters.category && filters.category !== "all" && snippet.category !== filters.category) return false
		if (filters.favorite === "favorites" && !snippet.favorite) return false
		if (filters.kind === "templates" && !snippet.isTemplate) return false
		if (filters.kind === "solutions" && snippet.isTemplate) return false
		return true
	})
}

function time(iso: string): number {
	const value = new Date(iso).getTime()
	return Number.isNaN(value) ? 0 : value
}

/**
 * Stable sort: ties always fall back to the title, then the id, so repeated
 * sorts of the same data produce byte-identical order.
 */
export function sortSnippets(snippets: readonly Snippet[], order: SortOrder = "newest"): Snippet[] {
	const tieBreak = (a: Snippet, b: Snippet): number =>
		a.title.localeCompare(b.title, undefined, { sensitivity: "base" }) || a.id.localeCompare(b.id)

	const comparators: Record<SortOrder, (a: Snippet, b: Snippet) => number> = {
		newest: (a, b) => time(b.createdAt) - time(a.createdAt) || tieBreak(a, b),
		oldest: (a, b) => time(a.createdAt) - time(b.createdAt) || tieBreak(a, b),
		"recently-updated": (a, b) => time(b.updatedAt) - time(a.updatedAt) || tieBreak(a, b),
		alphabetical: (a, b) => tieBreak(a, b),
		difficulty: (a, b) =>
			DIFFICULTY_RANK[a.difficulty] - DIFFICULTY_RANK[b.difficulty] || tieBreak(a, b),
	}
	return [...snippets].sort(comparators[order])
}

export function querySnippets(snippets: readonly Snippet[], query: SnippetQuery = {}): Snippet[] {
	const searched = searchSnippets(snippets, query.search ?? "")
	const filtered = filterSnippets(searched, query)
	return sortSnippets(filtered, query.sort ?? "newest")
}
