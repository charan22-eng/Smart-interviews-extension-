import type { ExportBundle, PracticeSession, Snippet, Store } from "../types/models.js"
import { MAX_HISTORY, MAX_SNIPPETS, SCHEMA_VERSION } from "../utils/constants.js"
import { nowIso } from "../utils/time.js"
import { loadStore, mutateStore } from "../storage/repository.js"
import {
	defaultSettings,
	isPlainRecord,
	normalizeSession,
	normalizeSettings,
	normalizeSnippet,
} from "../storage/schema.js"

/**
 * Import / export service.
 *
 * Imported content is parsed with JSON.parse and then rebuilt field by field.
 * It is never evaluated, never assigned with spread onto a prototype-bearing
 * object, and never inserted as markup.
 */

export class ImportError extends Error {
	readonly issues: string[]
	constructor(message: string, issues: string[] = []) {
		super(message)
		this.name = "ImportError"
		this.issues = issues
	}
}

export function buildExport(store: Store, at: number = Date.now()): ExportBundle {
	return {
		version: SCHEMA_VERSION,
		exportedAt: nowIso(at),
		snippets: store.snippets,
		settings: store.settings,
		practiceHistory: store.practiceHistory,
	}
}

export async function exportJson(): Promise<string> {
	return JSON.stringify(buildExport(await loadStore()), null, 2)
}

export interface ParsedBundle {
	bundle: ExportBundle
	/** Non-fatal problems: skipped records, defaulted fields, version notes. */
	issues: string[]
}

/**
 * Validates JSON syntax, schema shape, version and field types.
 * Throws ImportError for fatal problems; returns issues for recoverable ones.
 */
export function parseBundle(text: string): ParsedBundle {
	let raw: unknown
	try {
		raw = JSON.parse(text)
	} catch (error) {
		throw new ImportError(
			`The file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
		)
	}
	if (!isPlainRecord(raw)) {
		throw new ImportError("The file must contain a JSON object at the top level.")
	}

	const issues: string[] = []
	const version =
		typeof raw.version === "number" && Number.isFinite(raw.version) ? Math.floor(raw.version) : null
	if (version === null) {
		issues.push(`No version field; assuming version ${SCHEMA_VERSION}.`)
	} else if (version > SCHEMA_VERSION) {
		throw new ImportError(
			`This file was exported by a newer version (schema ${version}). Update the extension first.`,
		)
	} else if (version < SCHEMA_VERSION) {
		issues.push(`Upgrading imported data from schema ${version} to ${SCHEMA_VERSION}.`)
	}

	if (raw.snippets !== undefined && !Array.isArray(raw.snippets)) {
		throw new ImportError('The "snippets" field must be an array.')
	}
	if (raw.practiceHistory !== undefined && !Array.isArray(raw.practiceHistory)) {
		throw new ImportError('The "practiceHistory" field must be an array.')
	}

	const snippets: Snippet[] = []
	for (const [index, entry] of (raw.snippets as unknown[] | undefined ?? []).entries()) {
		const { snippet, issues: entryIssues } = normalizeSnippet(entry, `snippet #${index + 1}`)
		if (!snippet) {
			issues.push(`Skipped ${entryIssues[0] ?? `snippet #${index + 1}`}`)
			continue
		}
		issues.push(...entryIssues)
		snippets.push(snippet)
	}

	const practiceHistory: PracticeSession[] = []
	for (const [index, entry] of (raw.practiceHistory as unknown[] | undefined ?? []).entries()) {
		const { session, issues: entryIssues } = normalizeSession(entry, `session #${index + 1}`)
		if (!session) {
			issues.push(`Skipped ${entryIssues[0] ?? `session #${index + 1}`}`)
			continue
		}
		practiceHistory.push(session)
	}

	// Exports written by hand (and the documented example) may carry settings as
	// an array; accept both shapes rather than failing the whole import.
	const rawSettings = Array.isArray(raw.settings) ? raw.settings[0] : raw.settings
	if (Array.isArray(raw.settings)) issues.push("Settings were provided as an array; used the first entry.")
	const settings = rawSettings === undefined ? defaultSettings() : normalizeSettings(rawSettings)

	if (snippets.length === 0 && practiceHistory.length === 0 && rawSettings === undefined) {
		throw new ImportError("Nothing importable was found in this file.", issues)
	}

	return {
		bundle: {
			version: SCHEMA_VERSION,
			exportedAt: typeof raw.exportedAt === "string" ? raw.exportedAt : nowIso(),
			snippets,
			settings,
			practiceHistory,
		},
		issues,
	}
}

export type ImportMode = "merge" | "replace"

export interface ImportSummary {
	mode: ImportMode
	snippetsAdded: number
	snippetsSkipped: number
	sessionsAdded: number
	sessionsSkipped: number
	settingsApplied: boolean
	issues: string[]
}

/** Pure merge, so duplicate handling is directly testable. */
export function mergeBundle(
	store: Store,
	bundle: ExportBundle,
	mode: ImportMode,
	applySettings: boolean,
): ImportSummary {
	const summary: ImportSummary = {
		mode,
		snippetsAdded: 0,
		snippetsSkipped: 0,
		sessionsAdded: 0,
		sessionsSkipped: 0,
		settingsApplied: false,
		issues: [],
	}

	if (mode === "replace") {
		store.snippets = []
		store.practiceHistory = []
		store.selectedSnippetId = null
		store.pendingInsert = null
	}

	const ids = new Set(store.snippets.map((snippet) => snippet.id))
	// Identical title + code counts as a duplicate even with a different id.
	const fingerprints = new Set(store.snippets.map((snippet) => `${snippet.title}\u0000${snippet.code}`))

	for (const snippet of bundle.snippets) {
		const fingerprint = `${snippet.title}\u0000${snippet.code}`
		if (ids.has(snippet.id) || fingerprints.has(fingerprint)) {
			summary.snippetsSkipped += 1
			continue
		}
		if (store.snippets.length >= MAX_SNIPPETS) {
			summary.snippetsSkipped += 1
			summary.issues.push(`Snippet limit (${MAX_SNIPPETS}) reached; some entries were skipped.`)
			break
		}
		ids.add(snippet.id)
		fingerprints.add(fingerprint)
		store.snippets.push(snippet)
		summary.snippetsAdded += 1
	}

	const sessionIds = new Set(store.practiceHistory.map((session) => session.id))
	for (const session of bundle.practiceHistory) {
		if (sessionIds.has(session.id)) {
			summary.sessionsSkipped += 1
			continue
		}
		if (store.practiceHistory.length >= MAX_HISTORY) {
			summary.sessionsSkipped += 1
			break
		}
		sessionIds.add(session.id)
		store.practiceHistory.push(session)
		summary.sessionsAdded += 1
	}
	store.practiceHistory.sort(
		(a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime(),
	)

	if (applySettings) {
		store.settings = bundle.settings
		summary.settingsApplied = true
	}

	return summary
}

export async function importJson(
	text: string,
	options: { mode?: ImportMode; applySettings?: boolean } = {},
): Promise<ImportSummary> {
	const { bundle, issues } = parseBundle(text)
	const mode = options.mode ?? "merge"
	const { result } = await mutateStore((store) =>
		mergeBundle(store, bundle, mode, options.applySettings ?? false),
	)
	return { ...result, issues: [...issues, ...result.issues] }
}
