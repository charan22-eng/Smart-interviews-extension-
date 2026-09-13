import type {
	Category,
	Difficulty,
	Language,
	PracticeSession,
	Settings,
	Snippet,
	Store,
	TimerState,
} from "../types/models.js"
import {
	FORBIDDEN_KEYS,
	MAX_CODE_LENGTH,
	MAX_HISTORY,
	MAX_SNIPPETS,
	SCHEMA_VERSION,
	isCategory,
	isDifficulty,
	isLanguage,
	isSessionStatus,
	isSortOrder,
} from "../utils/constants.js"
import { createId } from "../utils/id.js"
import { isValidIsoDate, nowIso } from "../utils/time.js"

/**
 * Validation + normalisation + migration for everything that is persisted.
 *
 * Nothing here ever spreads untrusted input onto an object: every field is read
 * explicitly and coerced, which makes prototype pollution structurally
 * impossible even for hand-crafted import files.
 */

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false
	for (const key of FORBIDDEN_KEYS) {
		if (Object.prototype.hasOwnProperty.call(value, key)) return false
	}
	return true
}

function text(value: unknown, fallback = "", max = 4000): string {
	if (typeof value !== "string") return fallback
	return value.length > max ? value.slice(0, max) : value
}

function bool(value: unknown, fallback = false): boolean {
	return typeof value === "boolean" ? value : fallback
}

function intIn(value: unknown, fallback: number, min: number, max: number): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return fallback
	return Math.min(Math.max(Math.round(value), min), max)
}

function isoOr(value: unknown, fallback: string): string {
	return isValidIsoDate(value) ? value : fallback
}

function tagList(value: unknown): string[] {
	if (!Array.isArray(value)) return []
	const out: string[] = []
	for (const entry of value) {
		if (typeof entry !== "string") continue
		const tag = entry.trim().slice(0, 40)
		if (tag.length > 0 && !out.includes(tag)) out.push(tag)
		if (out.length >= 20) break
	}
	return out
}

/** Only localhost origins are ever accepted for the local practice copy. */
export function sanitizeLocalOrigin(value: unknown): string {
	if (typeof value !== "string" || value.trim() === "") return ""
	try {
		const url = new URL(value.trim())
		const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1"
		if (!isLocal || url.protocol !== "http:") return ""
		return url.origin
	} catch {
		return ""
	}
}

export function defaultSettings(): Settings {
	return {
		theme: "system",
		defaultLanguage: "cpp",
		defaultSort: "newest",
		confirmBeforeDelete: true,
		timerAutoStart: false,
		insertMode: "replace",
		editorTabSize: 4,
		localPracticeOrigin: "",
	}
}

export function defaultStore(): Store {
	return {
		version: SCHEMA_VERSION,
		snippets: [],
		settings: defaultSettings(),
		practiceHistory: [],
		timer: null,
		selectedSnippetId: null,
		pendingInsert: null,
	}
}

export function normalizeSettings(raw: unknown): Settings {
	const defaults = defaultSettings()
	if (!isPlainRecord(raw)) return defaults
	return {
		theme:
			raw.theme === "light" || raw.theme === "dark" || raw.theme === "system"
				? raw.theme
				: defaults.theme,
		defaultLanguage: isLanguage(raw.defaultLanguage) ? raw.defaultLanguage : defaults.defaultLanguage,
		defaultSort: isSortOrder(raw.defaultSort) ? raw.defaultSort : defaults.defaultSort,
		confirmBeforeDelete: bool(raw.confirmBeforeDelete, defaults.confirmBeforeDelete),
		timerAutoStart: bool(raw.timerAutoStart, defaults.timerAutoStart),
		insertMode: raw.insertMode === "append" ? "append" : "replace",
		editorTabSize: intIn(raw.editorTabSize, defaults.editorTabSize, 2, 8),
		localPracticeOrigin: sanitizeLocalOrigin(raw.localPracticeOrigin),
	}
}

export interface SnippetNormalizeResult {
	snippet: Snippet | null
	issues: string[]
}

/**
 * A snippet is rejected only when it has no usable identity (title) or its code
 * is not a string. Everything else falls back to a safe default and is reported.
 */
export function normalizeSnippet(raw: unknown, label = "snippet"): SnippetNormalizeResult {
	const issues: string[] = []
	if (!isPlainRecord(raw)) return { snippet: null, issues: [`${label}: not an object`] }

	const title = text(raw.title, "", 200).trim()
	if (title === "") return { snippet: null, issues: [`${label}: missing title`] }
	if (raw.code !== undefined && typeof raw.code !== "string") {
		return { snippet: null, issues: [`${label} "${title}": code must be a string`] }
	}

	const now = nowIso()
	const createdAt = isoOr(raw.createdAt, now)
	if (!isValidIsoDate(raw.createdAt)) issues.push(`${label} "${title}": createdAt defaulted`)
	if (!isLanguage(raw.language)) issues.push(`${label} "${title}": language defaulted to cpp`)
	if (!isCategory(raw.category)) issues.push(`${label} "${title}": category defaulted to Arrays`)
	if (!isDifficulty(raw.difficulty)) issues.push(`${label} "${title}": difficulty defaulted to Easy`)

	const language: Language = isLanguage(raw.language) ? raw.language : "cpp"
	const category: Category = isCategory(raw.category) ? raw.category : "Arrays"
	const difficulty: Difficulty = isDifficulty(raw.difficulty) ? raw.difficulty : "Easy"

	return {
		snippet: {
			id: typeof raw.id === "string" && raw.id.trim() !== "" ? raw.id.trim().slice(0, 80) : createId("snip"),
			title,
			language,
			category,
			difficulty,
			code: text(raw.code, "", MAX_CODE_LENGTH),
			explanation: text(raw.explanation, "", 8000),
			timeComplexity: text(raw.timeComplexity, "", 60),
			spaceComplexity: text(raw.spaceComplexity, "", 60),
			notes: text(raw.notes, "", 8000),
			tags: tagList(raw.tags),
			favorite: bool(raw.favorite),
			isTemplate: bool(raw.isTemplate),
			createdAt,
			updatedAt: isoOr(raw.updatedAt, createdAt),
		},
		issues,
	}
}

export interface SessionNormalizeResult {
	session: PracticeSession | null
	issues: string[]
}

export function normalizeSession(raw: unknown, label = "session"): SessionNormalizeResult {
	if (!isPlainRecord(raw)) return { session: null, issues: [`${label}: not an object`] }
	const problemId = text(raw.problemId, "", 80).trim()
	const problemName = text(raw.problemName, "", 200).trim()
	if (problemId === "" && problemName === "") {
		return { session: null, issues: [`${label}: missing problem reference`] }
	}
	if (!isSessionStatus(raw.status)) {
		return { session: null, issues: [`${label} "${problemName}": invalid status`] }
	}
	const startedAt = isoOr(raw.startedAt, nowIso())
	const completedAt = isoOr(raw.completedAt, startedAt)
	const fallbackDuration = Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime())
	return {
		session: {
			id: typeof raw.id === "string" && raw.id.trim() !== "" ? raw.id.trim().slice(0, 80) : createId("ses"),
			problemId: problemId === "" ? problemName : problemId,
			problemName: problemName === "" ? problemId : problemName,
			difficulty: isDifficulty(raw.difficulty) ? raw.difficulty : "Easy",
			category: isCategory(raw.category) ? raw.category : "Arrays",
			language: isLanguage(raw.language) ? raw.language : null,
			startedAt,
			completedAt,
			durationMs:
				typeof raw.durationMs === "number" && Number.isFinite(raw.durationMs) && raw.durationMs >= 0
					? Math.round(raw.durationMs)
					: fallbackDuration,
			status: raw.status,
			notes: text(raw.notes, "", 2000),
		},
		issues: [],
	}
}

export function normalizeTimer(raw: unknown): TimerState | null {
	if (!isPlainRecord(raw)) return null
	const problemId = text(raw.problemId, "", 80).trim()
	if (problemId === "") return null
	const runningSince =
		typeof raw.runningSince === "number" && Number.isFinite(raw.runningSince) ? raw.runningSince : null
	return {
		problemId,
		problemName: text(raw.problemName, problemId, 200),
		difficulty: isDifficulty(raw.difficulty) ? raw.difficulty : "Easy",
		category: isCategory(raw.category) ? raw.category : "Arrays",
		language: isLanguage(raw.language) ? raw.language : null,
		startedAt: isoOr(raw.startedAt, nowIso()),
		accumulatedMs:
			typeof raw.accumulatedMs === "number" && Number.isFinite(raw.accumulatedMs) && raw.accumulatedMs >= 0
				? Math.round(raw.accumulatedMs)
				: 0,
		runningSince,
	}
}

export interface StoreNormalizeResult {
	store: Store
	/** Human-readable description of anything that had to be repaired. */
	repairs: string[]
}

/**
 * Version migrations. Each entry upgrades from `version` to `version + 1`.
 * Unversioned legacy data is treated as version 0 and normalised field by field.
 */
const MIGRATIONS: Array<(input: Record<string, unknown>) => Record<string, unknown>> = [
	// 0 -> 1: the original unversioned shape only had `snippets`; everything else
	// is supplied by normalisation below.
	(input) => ({ ...input, version: 1 }),
]

export function normalizeStore(raw: unknown): StoreNormalizeResult {
	const repairs: string[] = []

	if (raw === undefined || raw === null) {
		// First install: no repair needed, this is the expected empty state.
		return { store: defaultStore(), repairs }
	}

	let record: Record<string, unknown>
	if (isPlainRecord(raw)) {
		record = raw
	} else {
		repairs.push("Saved data was not an object; reset to defaults.")
		return { store: defaultStore(), repairs }
	}

	let version =
		typeof record.version === "number" && Number.isFinite(record.version) ? Math.floor(record.version) : 0
	if (version < 0) version = 0
	if (version === 0) repairs.push("Saved data had no schema version; migrated from legacy layout.")
	while (version < SCHEMA_VERSION) {
		const migrate = MIGRATIONS[version]
		if (!migrate) break
		record = migrate(record)
		version += 1
		repairs.push(`Migrated saved data to schema version ${version}.`)
	}
	if (version > SCHEMA_VERSION) {
		repairs.push(
			`Saved data came from a newer version (${version}); unknown fields were dropped.`,
		)
	}

	const snippets: Snippet[] = []
	const seenIds = new Set<string>()
	const rawSnippets = Array.isArray(record.snippets) ? record.snippets : []
	if (!Array.isArray(record.snippets) && record.snippets !== undefined) {
		repairs.push("Snippet list was corrupt; replaced with an empty list.")
	}
	for (const [index, entry] of rawSnippets.entries()) {
		const { snippet, issues } = normalizeSnippet(entry, `snippet #${index + 1}`)
		if (!snippet) {
			repairs.push(...issues.map((issue) => `Dropped ${issue}`))
			continue
		}
		if (seenIds.has(snippet.id)) {
			snippet.id = createId("snip")
			repairs.push(`Duplicate snippet id for "${snippet.title}"; assigned a new id.`)
		}
		seenIds.add(snippet.id)
		repairs.push(...issues)
		snippets.push(snippet)
		if (snippets.length >= MAX_SNIPPETS) {
			repairs.push(`Snippet limit (${MAX_SNIPPETS}) reached; remaining entries ignored.`)
			break
		}
	}

	const history: PracticeSession[] = []
	const rawHistory = Array.isArray(record.practiceHistory) ? record.practiceHistory : []
	if (!Array.isArray(record.practiceHistory) && record.practiceHistory !== undefined) {
		repairs.push("Practice history was corrupt; replaced with an empty list.")
	}
	for (const [index, entry] of rawHistory.entries()) {
		const { session, issues } = normalizeSession(entry, `session #${index + 1}`)
		if (!session) {
			repairs.push(...issues.map((issue) => `Dropped ${issue}`))
			continue
		}
		history.push(session)
		if (history.length >= MAX_HISTORY) {
			repairs.push(`Practice history limit (${MAX_HISTORY}) reached; older entries ignored.`)
			break
		}
	}

	const selectedSnippetId =
		typeof record.selectedSnippetId === "string" &&
		snippets.some((snippet) => snippet.id === record.selectedSnippetId)
			? record.selectedSnippetId
			: null

	const pending = isPlainRecord(record.pendingInsert) ? record.pendingInsert : null
	const pendingInsert =
		pending && typeof pending.snippetId === "string" && snippets.some((s) => s.id === pending.snippetId)
			? {
					snippetId: pending.snippetId,
					createdAt:
						typeof pending.createdAt === "number" && Number.isFinite(pending.createdAt)
							? pending.createdAt
							: Date.now(),
				}
			: null

	return {
		store: {
			version: SCHEMA_VERSION,
			snippets,
			settings: normalizeSettings(record.settings),
			practiceHistory: history,
			timer: normalizeTimer(record.timer),
			selectedSnippetId,
			pendingInsert,
		},
		repairs,
	}
}
