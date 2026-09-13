import type { Category, Difficulty, Language, SessionStatus, SortOrder } from "../types/models.js"

/** Bumped whenever the persisted shape changes; drives storage migrations. */
export const SCHEMA_VERSION = 1

/** Single top-level key in chrome.storage.local holding the whole store. */
export const STORAGE_KEY = "dsaPracticeCompanion"

export const LANGUAGES: readonly Language[] = ["cpp", "java", "python", "javascript", "c"]

export const LANGUAGE_LABELS: Record<Language, string> = {
	cpp: "C++",
	java: "Java",
	python: "Python",
	javascript: "JavaScript",
	c: "C",
}

export const DIFFICULTIES: readonly Difficulty[] = ["Easy", "Medium", "Hard"]

export const DIFFICULTY_RANK: Record<Difficulty, number> = { Easy: 0, Medium: 1, Hard: 2 }

export const SESSION_STATUSES: readonly SessionStatus[] = ["attempted", "solved", "failed"]

export const CATEGORIES: readonly Category[] = [
	"Arrays",
	"Strings",
	"Hashing",
	"Two Pointers",
	"Sliding Window",
	"Binary Search",
	"Stack",
	"Queue",
	"Linked List",
	"Trees",
	"BST",
	"Heap",
	"Graphs",
	"Greedy",
	"Backtracking",
	"Dynamic Programming",
	"Recursion",
	"Sorting",
	"Bit Manipulation",
]

export const SORT_ORDERS: readonly SortOrder[] = [
	"newest",
	"oldest",
	"recently-updated",
	"alphabetical",
	"difficulty",
]

export const SORT_LABELS: Record<SortOrder, string> = {
	newest: "Recently created",
	oldest: "Oldest first",
	"recently-updated": "Recently updated",
	alphabetical: "Alphabetical",
	difficulty: "Difficulty",
}

/** Keys that must never be copied from untrusted JSON onto an object. */
export const FORBIDDEN_KEYS: readonly string[] = ["__proto__", "constructor", "prototype"]

/** Hard caps so a pathological import cannot exhaust chrome.storage.local. */
export const MAX_SNIPPETS = 5000
export const MAX_HISTORY = 2000
export const MAX_CODE_LENGTH = 200_000

export function isLanguage(value: unknown): value is Language {
	return typeof value === "string" && (LANGUAGES as readonly string[]).includes(value)
}

export function isDifficulty(value: unknown): value is Difficulty {
	return typeof value === "string" && (DIFFICULTIES as readonly string[]).includes(value)
}

export function isCategory(value: unknown): value is Category {
	return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value)
}

export function isSortOrder(value: unknown): value is SortOrder {
	return typeof value === "string" && (SORT_ORDERS as readonly string[]).includes(value)
}

export function isSessionStatus(value: unknown): value is SessionStatus {
	return typeof value === "string" && (SESSION_STATUSES as readonly string[]).includes(value)
}
