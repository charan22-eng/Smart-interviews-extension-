/** Core domain models. Shared by popup, options, background, content script,
 * the practice environment and the automated tests. */

export type Language = "cpp" | "java" | "python" | "javascript" | "c"

export type Difficulty = "Easy" | "Medium" | "Hard"

export type Category =
	| "Arrays"
	| "Strings"
	| "Hashing"
	| "Two Pointers"
	| "Sliding Window"
	| "Binary Search"
	| "Stack"
	| "Queue"
	| "Linked List"
	| "Trees"
	| "BST"
	| "Heap"
	| "Graphs"
	| "Greedy"
	| "Backtracking"
	| "Dynamic Programming"
	| "Recursion"
	| "Sorting"
	| "Bit Manipulation"

export interface Snippet {
	id: string
	title: string
	language: Language
	category: Category
	difficulty: Difficulty
	code: string
	explanation: string
	timeComplexity: string
	spaceComplexity: string
	notes: string
	tags: string[]
	favorite: boolean
	/** Reusable personal template (boilerplate) rather than a problem solution. */
	isTemplate: boolean
	createdAt: string
	updatedAt: string
}

export type SnippetInput = Partial<Omit<Snippet, "id" | "createdAt" | "updatedAt">> & {
	title: string
}

export type SortOrder =
	| "newest"
	| "oldest"
	| "recently-updated"
	| "alphabetical"
	| "difficulty"

export type ThemePreference = "system" | "light" | "dark"

export type InsertMode = "replace" | "append"

export interface Settings {
	theme: ThemePreference
	defaultLanguage: Language
	defaultSort: SortOrder
	confirmBeforeDelete: boolean
	/** Start the practice timer automatically when a problem is opened. */
	timerAutoStart: boolean
	/** Editor behaviour: replace all editor content or append below it. */
	insertMode: InsertMode
	editorTabSize: number
	/**
	 * Optional origin of a locally served copy of the bundled practice page
	 * (for example http://localhost:5173). Only localhost / 127.0.0.1 origins
	 * are accepted; the extension refuses to bridge into any other origin.
	 */
	localPracticeOrigin: string
}

export type SessionStatus = "attempted" | "solved" | "failed"

export interface PracticeSession {
	id: string
	problemId: string
	problemName: string
	difficulty: Difficulty
	category: Category
	language: Language | null
	startedAt: string
	completedAt: string
	durationMs: number
	status: SessionStatus
	notes: string
}

/**
 * The timer is persisted as timestamps, never as a tick counter, so elapsed
 * time stays accurate when the popup closes, the page reloads, or the service
 * worker is suspended. Intervals are used only to repaint the label.
 */
export interface TimerState {
	problemId: string
	problemName: string
	difficulty: Difficulty
	category: Category
	language: Language | null
	startedAt: string
	accumulatedMs: number
	/** Epoch ms of the last resume, or null while paused. */
	runningSince: number | null
}

export interface PendingInsert {
	snippetId: string
	createdAt: number
}

export interface Store {
	version: number
	snippets: Snippet[]
	settings: Settings
	practiceHistory: PracticeSession[]
	timer: TimerState | null
	selectedSnippetId: string | null
	/** Queued insert consumed by the practice page when it finishes loading. */
	pendingInsert: PendingInsert | null
}

export interface ExportBundle {
	version: number
	exportedAt: string
	snippets: Snippet[]
	settings: Settings
	practiceHistory: PracticeSession[]
}

export interface CategoryCount {
	category: Category
	sessions: number
	durationMs: number
}

export interface Stats {
	totalProblems: number
	attemptedProblems: number
	solvedProblems: number
	failedProblems: number
	totalPracticeMs: number
	easySolved: number
	mediumSolved: number
	hardSolved: number
	mostPracticedCategory: Category | null
	categoryBreakdown: CategoryCount[]
	totalSnippets: number
	favoriteSnippets: number
	templateCount: number
	recentSessions: PracticeSession[]
}
