/**
 * Snippet manager (options page).
 *
 * This is the full CRUD surface: create, read, update, delete, duplicate,
 * favorite, search, filter and sort your own solutions and templates, plus
 * JSON import/export and practice-history maintenance. The file picker lives
 * here rather than in the popup because opening a picker can dismiss a popup
 * window.
 */

import { querySnippets, type SnippetQuery } from "../services/query.js"
import * as snippetsService from "../services/snippets.js"
import * as practiceTimer from "../services/timer.js"
import { exportJson, importJson, type ImportSummary } from "../services/transfer.js"
import { loadStore, resetStore } from "../storage/repository.js"
import { defaultSettings } from "../storage/schema.js"
import {
	CATEGORIES,
	DIFFICULTIES,
	LANGUAGES,
	LANGUAGE_LABELS,
	SORT_LABELS,
	SORT_ORDERS,
	isCategory,
	isDifficulty,
	isLanguage,
	isSortOrder,
} from "../utils/constants.js"
import {
	applyTheme,
	clear,
	confirmDialog,
	copyText,
	createToaster,
	el,
	fillSelect,
	query,
} from "../utils/dom.js"
import { formatDateTime, formatDuration } from "../utils/time.js"
import type { InsertResult } from "../services/messaging.js"
import type { PracticeSession, Settings, Snippet } from "../types/models.js"

/* ---------- element handles ---------- */

const loadingNode = query<HTMLElement>("#loading")
const fatalNode = query<HTMLElement>("#fatal")
const mainNode = query<HTMLElement>("#main")
const toast = createToaster(query<HTMLElement>("#toast"))

const openPracticeButton = query<HTMLButtonElement>("#open-practice")
const newSnippetButton = query<HTMLButtonElement>("#new-snippet")
const newTemplateButton = query<HTMLButtonElement>("#new-template")

const searchInput = query<HTMLInputElement>("#search")
const filterLanguage = query<HTMLSelectElement>("#filter-language")
const filterDifficulty = query<HTMLSelectElement>("#filter-difficulty")
const filterCategory = query<HTMLSelectElement>("#filter-category")
const filterKind = query<HTMLSelectElement>("#filter-kind")
const filterFavorite = query<HTMLSelectElement>("#filter-favorite")
const sortSelect = query<HTMLSelectElement>("#sort")
const countNode = query<HTMLElement>("#count")
const listNode = query<HTMLElement>("#list")
const emptyNode = query<HTMLElement>("#empty")

const formTitle = query<HTMLElement>("#form-title")
const formMeta = query<HTMLElement>("#form-meta")
const formNode = query<HTMLFormElement>("#form")
const formError = query<HTMLElement>("#form-error")
const fTitle = query<HTMLInputElement>("#f-title")
const fLanguage = query<HTMLSelectElement>("#f-language")
const fDifficulty = query<HTMLSelectElement>("#f-difficulty")
const fCategory = query<HTMLSelectElement>("#f-category")
const fCode = query<HTMLTextAreaElement>("#f-code")
const fExplanation = query<HTMLTextAreaElement>("#f-explanation")
const fTime = query<HTMLInputElement>("#f-time")
const fSpace = query<HTMLInputElement>("#f-space")
const fTags = query<HTMLInputElement>("#f-tags")
const fNotes = query<HTMLTextAreaElement>("#f-notes")
const fFavorite = query<HTMLInputElement>("#f-favorite")
const fTemplate = query<HTMLInputElement>("#f-template")
const cancelButton = query<HTMLButtonElement>("#cancel")
const copyButton = query<HTMLButtonElement>("#copy")
const insertButton = query<HTMLButtonElement>("#insert")
const duplicateButton = query<HTMLButtonElement>("#duplicate")
const deleteButton = query<HTMLButtonElement>("#delete")

const exportButton = query<HTMLButtonElement>("#export")
const importFile = query<HTMLInputElement>("#import-file")
const importMode = query<HTMLSelectElement>("#import-mode")
const importApplySettings = query<HTMLInputElement>("#import-apply-settings")
const importRun = query<HTMLButtonElement>("#import-run")
const importSummaryList = query<HTMLElement>("#import-summary")

const historyList = query<HTMLElement>("#history-list")
const clearHistoryButton = query<HTMLButtonElement>("#clear-history")
const resetAllButton = query<HTMLButtonElement>("#reset-all")

/* ---------- state ---------- */

interface ManagerState {
	snippets: Snippet[]
	history: PracticeSession[]
	settings: Settings
	/** null means the form is in "create" mode. */
	editingId: string | null
}

const state: ManagerState = {
	snippets: [],
	history: [],
	settings: defaultSettings(),
	editingId: null,
}

const describe = (error: unknown): string => (error instanceof Error ? error.message : String(error))

const editing = (): Snippet | null =>
	state.snippets.find((snippet) => snippet.id === state.editingId) ?? null

function showFormError(message: string | null): void {
	formError.hidden = message === null
	formError.textContent = message ?? ""
}

/* ---------- data ---------- */

async function refreshData(): Promise<void> {
	const store = await loadStore()
	state.snippets = store.snippets
	state.history = store.practiceHistory
	state.settings = store.settings
	applyTheme(store.settings.theme)
}

function renderAll(): void {
	renderList()
	renderFormHeader()
	renderHistory()
}

/* ---------- list ---------- */

function currentQuery(): SnippetQuery {
	const language = filterLanguage.value
	const difficulty = filterDifficulty.value
	const category = filterCategory.value
	return {
		search: searchInput.value,
		language: isLanguage(language) ? language : "all",
		difficulty: isDifficulty(difficulty) ? difficulty : "all",
		category: isCategory(category) ? category : "all",
		kind:
			filterKind.value === "solutions" || filterKind.value === "templates" ? filterKind.value : "all",
		favorite: filterFavorite.value === "favorites" ? "favorites" : "all",
		sort: isSortOrder(sortSelect.value) ? sortSelect.value : state.settings.defaultSort,
	}
}

function renderList(): void {
	const visible = querySnippets(state.snippets, currentQuery())

	clear(listNode)
	for (const snippet of visible) {
		const item = el("li", {
			class: `item${snippet.id === state.editingId ? " item--selected" : ""}`,
		})
		item.tabIndex = 0
		item.setAttribute("role", "button")
		item.appendChild(
			el("p", {
				class: "item__title",
				text: `${snippet.favorite ? "\u2605 " : ""}${snippet.title}${
					snippet.isTemplate ? " (template)" : ""
				}`,
			}),
		)
		item.appendChild(
			el("p", {
				class: "item__meta",
				text: `${LANGUAGE_LABELS[snippet.language]} \u00b7 ${snippet.difficulty} \u00b7 ${snippet.category}`,
			}),
		)
		item.appendChild(
			el("p", { class: "item__meta", text: `updated ${formatDateTime(snippet.updatedAt)}` }),
		)
		const open = (): void => {
			loadIntoForm(snippet)
			void snippetsService.selectSnippet(snippet.id).catch(() => undefined)
			renderList()
		}
		item.addEventListener("click", open)
		item.addEventListener("keydown", (event: KeyboardEvent) => {
			if (event.key === "Enter" || event.key === " ") {
				event.preventDefault()
				open()
			}
		})
		listNode.appendChild(item)
	}

	const total = state.snippets.length
	countNode.textContent = total === 0 ? "" : `Showing ${visible.length} of ${total}`
	listNode.hidden = visible.length === 0
	emptyNode.hidden = visible.length > 0
	if (visible.length === 0) {
		emptyNode.textContent =
			total === 0
				? "Nothing saved yet. Use \u201cNew solution\u201d to store your first snippet."
				: "No snippets match this search or filter combination."
	}
}

/* ---------- form ---------- */

function renderFormHeader(): void {
	const snippet = editing()
	if (snippet) {
		formTitle.textContent = `Editing: ${snippet.title}`
		formMeta.textContent = `Created ${formatDateTime(snippet.createdAt)} \u00b7 updated ${formatDateTime(
			snippet.updatedAt,
		)}`
	} else {
		formTitle.textContent = fTemplate.checked ? "New template" : "New solution"
		formMeta.textContent = "Nothing is saved until you press Save."
	}
	const existing = snippet !== null
	duplicateButton.disabled = !existing
	deleteButton.disabled = !existing
	insertButton.disabled = !existing
}

function loadIntoForm(snippet: Snippet): void {
	state.editingId = snippet.id
	fTitle.value = snippet.title
	fLanguage.value = snippet.language
	fDifficulty.value = snippet.difficulty
	fCategory.value = snippet.category
	fCode.value = snippet.code
	fExplanation.value = snippet.explanation
	fTime.value = snippet.timeComplexity
	fSpace.value = snippet.spaceComplexity
	fNotes.value = snippet.notes
	fTags.value = snippet.tags.join(", ")
	fFavorite.checked = snippet.favorite
	fTemplate.checked = snippet.isTemplate
	showFormError(null)
	renderFormHeader()
}

function resetForm(asTemplate = false): void {
	state.editingId = null
	formNode.reset()
	fTitle.value = ""
	fLanguage.value = state.settings.defaultLanguage
	fDifficulty.value = "Easy"
	fCategory.value = "Arrays"
	fCode.value = ""
	fExplanation.value = ""
	fTime.value = ""
	fSpace.value = ""
	fNotes.value = ""
	fTags.value = ""
	fFavorite.checked = false
	fTemplate.checked = asTemplate
	showFormError(null)
	renderFormHeader()
	renderList()
	fTitle.focus()
}

function readForm(): {
	title: string
	language: Snippet["language"]
	difficulty: Snippet["difficulty"]
	category: Snippet["category"]
	code: string
	explanation: string
	timeComplexity: string
	spaceComplexity: string
	notes: string
	tags: string[]
	favorite: boolean
	isTemplate: boolean
} {
	const language = fLanguage.value
	const difficulty = fDifficulty.value
	const category = fCategory.value
	return {
		title: fTitle.value.trim(),
		language: isLanguage(language) ? language : state.settings.defaultLanguage,
		difficulty: isDifficulty(difficulty) ? difficulty : "Easy",
		category: isCategory(category) ? category : "Arrays",
		code: fCode.value,
		explanation: fExplanation.value.trim(),
		timeComplexity: fTime.value.trim(),
		spaceComplexity: fSpace.value.trim(),
		notes: fNotes.value.trim(),
		tags: fTags.value
			.split(",")
			.map((tag) => tag.trim())
			.filter((tag) => tag !== ""),
		favorite: fFavorite.checked,
		isTemplate: fTemplate.checked,
	}
}

async function save(): Promise<void> {
	const input = readForm()
	if (input.title === "") {
		showFormError("A title is required.")
		fTitle.focus()
		return
	}
	showFormError(null)

	try {
		const existingId = state.editingId
		const saved =
			existingId === null
				? await snippetsService.createSnippet(input)
				: await snippetsService.updateSnippet(existingId, input)
		await refreshData()
		loadIntoForm(saved)
		renderAll()
		toast(existingId === null ? `Saved "${saved.title}".` : `Updated "${saved.title}".`, "success")
	} catch (error) {
		showFormError(describe(error))
		toast(describe(error), "error")
	}
}

async function duplicateCurrent(): Promise<void> {
	const snippet = editing()
	if (!snippet) return
	try {
		const copy = await snippetsService.duplicateSnippet(snippet.id)
		await refreshData()
		loadIntoForm(copy)
		renderAll()
		toast(`Duplicated as "${copy.title}".`, "success")
	} catch (error) {
		toast(describe(error), "error")
	}
}

async function deleteCurrent(): Promise<void> {
	const snippet = editing()
	if (!snippet) return
	if (state.settings.confirmBeforeDelete) {
		const confirmed = await confirmDialog(`Delete "${snippet.title}"? This cannot be undone.`)
		if (!confirmed) return
	}
	try {
		await snippetsService.deleteSnippet(snippet.id)
		await refreshData()
		resetForm()
		renderAll()
		toast(`Deleted "${snippet.title}".`, "success")
	} catch (error) {
		toast(describe(error), "error")
	}
}

async function copyCurrent(): Promise<void> {
	try {
		await copyText(fCode.value)
		toast("Code copied to the clipboard.", "success")
	} catch (error) {
		toast(describe(error), "error")
	}
}

async function insertCurrent(): Promise<void> {
	const snippet = editing()
	if (!snippet) {
		toast("Save this snippet before inserting it.", "error")
		return
	}
	try {
		const result = (await chrome.runtime.sendMessage({
			type: "insert-snippet",
			snippetId: snippet.id,
		})) as InsertResult | undefined
		if (result?.ok) toast(`Sent "${snippet.title}" to the ${result.target ?? "practice page"}.`, "success")
		else toast(result?.error ?? "The insert could not be delivered.", "error")
	} catch (error) {
		toast(`Could not reach the extension worker: ${describe(error)}`, "error")
	}
}

/* ---------- import / export ---------- */

async function exportData(): Promise<void> {
	try {
		const json = await exportJson()
		const blob = new Blob([json], { type: "application/json" })
		const url = URL.createObjectURL(blob)
		const stamp = new Date().toISOString().slice(0, 10)
		const link = el("a", { href: url, download: `dsa-practice-companion-${stamp}.json` })
		document.body.appendChild(link)
		link.click()
		link.remove()
		window.setTimeout(() => URL.revokeObjectURL(url), 4000)
		toast("Exported your data as JSON.", "success")
	} catch (error) {
		toast(describe(error), "error")
	}
}

function renderImportSummary(summary: ImportSummary): void {
	clear(importSummaryList)
	const lines = [
		`Mode: ${summary.mode}`,
		`Snippets added: ${summary.snippetsAdded}`,
		`Snippets skipped: ${summary.snippetsSkipped}`,
		`Sessions added: ${summary.sessionsAdded}`,
		`Sessions skipped: ${summary.sessionsSkipped}`,
		`Settings applied: ${summary.settingsApplied ? "yes" : "no"}`,
		...summary.issues.map((issue) => `Issue: ${issue}`),
	]
	for (const line of lines) {
		importSummaryList.appendChild(el("li", { class: "entry", text: line }))
	}
}

async function runImport(): Promise<void> {
	const file = importFile.files?.[0]
	if (!file) {
		toast("Choose a JSON file to import first.", "error")
		return
	}
	const mode = importMode.value === "replace" ? "replace" : "merge"
	if (mode === "replace") {
		const confirmed = await confirmDialog(
			"Replace all local snippets and history with the contents of this file?",
			"Replace",
		)
		if (!confirmed) return
	}

	importRun.disabled = true
	try {
		const text = await file.text()
		// Parsed as JSON data only; imported content is never evaluated.
		const summary = await importJson(text, {
			mode,
			applySettings: importApplySettings.checked,
		})
		await refreshData()
		resetForm()
		renderAll()
		renderImportSummary(summary)
		toast(
			`Imported ${summary.snippetsAdded} snippet(s) and ${summary.sessionsAdded} session(s).`,
			"success",
		)
	} catch (error) {
		clear(importSummaryList)
		importSummaryList.appendChild(el("li", { class: "entry", text: describe(error) }))
		toast(describe(error), "error")
	} finally {
		importRun.disabled = false
	}
}

/* ---------- history ---------- */

function renderHistory(): void {
	clear(historyList)
	if (state.history.length === 0) {
		historyList.appendChild(el("li", { class: "entry", text: "No practice sessions recorded yet." }))
		clearHistoryButton.disabled = true
		return
	}
	clearHistoryButton.disabled = false

	for (const session of state.history.slice(0, 50)) {
		const row = el("li", { class: "entry" })
		row.appendChild(
			el("span", {
				text: `${session.problemName} \u00b7 ${formatDateTime(session.completedAt)}`,
			}),
		)
		const right = el("span", { class: "row" })
		right.appendChild(
			el("span", {
				class: `entry__meta status--${session.status}`,
				text: `${session.status} \u00b7 ${formatDuration(session.durationMs)}`,
			}),
		)
		const remove = el("button", { class: "btn", type: "button", text: "Delete" })
		remove.addEventListener("click", () => {
			void (async () => {
				try {
					await practiceTimer.deleteSession(session.id)
					await refreshData()
					renderAll()
					toast("Session deleted.", "success")
				} catch (error) {
					toast(describe(error), "error")
				}
			})()
		})
		right.appendChild(remove)
		row.appendChild(right)
		historyList.appendChild(row)
	}
}

async function clearHistory(): Promise<void> {
	const confirmed = await confirmDialog("Delete every recorded practice session?", "Clear")
	if (!confirmed) return
	try {
		await practiceTimer.clearHistory()
		await refreshData()
		renderAll()
		toast("Practice history cleared.", "success")
	} catch (error) {
		toast(describe(error), "error")
	}
}

async function eraseEverything(): Promise<void> {
	const confirmed = await confirmDialog(
		"Erase all snippets, history and settings stored by this extension?",
		"Erase",
	)
	if (!confirmed) return
	try {
		await resetStore()
		await refreshData()
		resetForm()
		renderAll()
		toast("All local extension data erased.", "success")
	} catch (error) {
		toast(describe(error), "error")
	}
}

/* ---------- wiring ---------- */

function fillSelectors(): void {
	const languageOptions = LANGUAGES.map((language) => ({
		value: language,
		label: LANGUAGE_LABELS[language],
	}))
	const difficultyOptions = DIFFICULTIES.map((difficulty) => ({
		value: difficulty,
		label: difficulty,
	}))
	const categoryOptions = CATEGORIES.map((category) => ({ value: category, label: category }))
	const sortOptions = SORT_ORDERS.map((order) => ({ value: order, label: SORT_LABELS[order] }))

	fillSelect(filterLanguage, [{ value: "all", label: "All languages" }, ...languageOptions], "all")
	fillSelect(
		filterDifficulty,
		[{ value: "all", label: "All difficulties" }, ...difficultyOptions],
		"all",
	)
	fillSelect(filterCategory, [{ value: "all", label: "All categories" }, ...categoryOptions], "all")
	fillSelect(
		filterKind,
		[
			{ value: "all", label: "Solutions and templates" },
			{ value: "solutions", label: "Solutions only" },
			{ value: "templates", label: "Templates only" },
		],
		"all",
	)
	fillSelect(
		filterFavorite,
		[
			{ value: "all", label: "All snippets" },
			{ value: "favorites", label: "Favorites only" },
		],
		"all",
	)
	fillSelect(sortSelect, sortOptions, state.settings.defaultSort)

	fillSelect(fLanguage, languageOptions, state.settings.defaultLanguage)
	fillSelect(fDifficulty, difficultyOptions, "Easy")
	fillSelect(fCategory, categoryOptions, "Arrays")
	fillSelect(
		importMode,
		[
			{ value: "merge", label: "Merge with existing data (skip duplicates)" },
			{ value: "replace", label: "Replace existing data" },
		],
		"merge",
	)
}

function wire(): void {
	openPracticeButton.addEventListener("click", () => {
		void (async () => {
			try {
				const result = (await chrome.runtime.sendMessage({ type: "open-practice" })) as
					| InsertResult
					| undefined
				if (!result?.ok) toast(result?.error ?? "Could not open the practice page.", "error")
			} catch (error) {
				toast(describe(error), "error")
			}
		})()
	})

	newSnippetButton.addEventListener("click", () => resetForm(false))
	newTemplateButton.addEventListener("click", () => resetForm(true))
	cancelButton.addEventListener("click", () => resetForm(fTemplate.checked))

	searchInput.addEventListener("input", renderList)
	for (const control of [
		filterLanguage,
		filterDifficulty,
		filterCategory,
		filterKind,
		filterFavorite,
		sortSelect,
	]) {
		control.addEventListener("change", renderList)
	}

	formNode.addEventListener("submit", (event: SubmitEvent) => {
		event.preventDefault()
		void save()
	})
	fTemplate.addEventListener("change", renderFormHeader)
	copyButton.addEventListener("click", () => void copyCurrent())
	insertButton.addEventListener("click", () => void insertCurrent())
	duplicateButton.addEventListener("click", () => void duplicateCurrent())
	deleteButton.addEventListener("click", () => void deleteCurrent())

	// Tab inside the code textarea should indent instead of leaving the field.
	fCode.addEventListener("keydown", (event: KeyboardEvent) => {
		if (event.key !== "Tab" || event.shiftKey) return
		event.preventDefault()
		const pad = " ".repeat(state.settings.editorTabSize)
		const { selectionStart, selectionEnd, value } = fCode
		fCode.value = `${value.slice(0, selectionStart)}${pad}${value.slice(selectionEnd)}`
		fCode.selectionStart = selectionStart + pad.length
		fCode.selectionEnd = fCode.selectionStart
	})

	exportButton.addEventListener("click", () => void exportData())
	importRun.addEventListener("click", () => void runImport())
	clearHistoryButton.addEventListener("click", () => void clearHistory())
	resetAllButton.addEventListener("click", () => void eraseEverything())

	chrome.storage.onChanged.addListener((_changes, areaName) => {
		if (areaName !== "local") return
		void refreshData()
			.then(renderAll)
			.catch((error: unknown) => toast(describe(error), "error"))
	})
}

async function init(): Promise<void> {
	try {
		await refreshData()
	} catch (error) {
		loadingNode.hidden = true
		fatalNode.hidden = false
		fatalNode.textContent = `Your saved data could not be loaded: ${describe(error)}`
		return
	}

	fillSelectors()
	wire()
	resetForm()
	renderAll()
	loadingNode.hidden = true
	mainNode.hidden = false
}

void init()
