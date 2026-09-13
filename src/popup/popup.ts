/**
 * Popup controller.
 *
 * Five views (Dashboard, Snippets, Practice, Statistics, Settings) over the
 * same locally stored data. The popup never talks to a website: it reads and
 * writes chrome.storage.local through the storage/service layer and asks the
 * background worker to deliver an insert into the controlled practice page.
 */

import { PROBLEMS } from "../practice/problems.js"
import { querySnippets, type SnippetQuery } from "../services/query.js"
import * as snippetsService from "../services/snippets.js"
import { computeStats } from "../services/stats.js"
import * as practiceTimer from "../services/timer.js"
import { exportJson } from "../services/transfer.js"
import { loadStore, mutateStore } from "../storage/repository.js"
import { defaultSettings, sanitizeLocalOrigin } from "../storage/schema.js"
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
import { formatDateTime, formatDuration, formatTotalTime } from "../utils/time.js"
import type { InsertResult } from "../services/messaging.js"
import type { PracticeSession, Settings, Snippet, Stats, TimerState } from "../types/models.js"

type ViewName = "dashboard" | "snippets" | "practice" | "statistics" | "settings"

/* ---------- element handles ---------- */

const loadingNode = query<HTMLElement>("#loading")
const fatalNode = query<HTMLElement>("#fatal")
const mainNode = query<HTMLElement>("#main")
const toast = createToaster(query<HTMLElement>("#toast"))

const views: Record<ViewName, HTMLElement> = {
	dashboard: query<HTMLElement>("#view-dashboard"),
	snippets: query<HTMLElement>("#view-snippets"),
	practice: query<HTMLElement>("#view-practice"),
	statistics: query<HTMLElement>("#view-statistics"),
	settings: query<HTMLElement>("#view-settings"),
}
const navButtons = [...document.querySelectorAll<HTMLButtonElement>(".nav__btn")]

// Dashboard
const dashSnippets = query<HTMLElement>("#dash-snippets")
const dashSolved = query<HTMLElement>("#dash-solved")
const dashAttempted = query<HTMLElement>("#dash-attempted")
const dashTime = query<HTMLElement>("#dash-time")
const dashSelected = query<HTMLElement>("#dash-selected")
const dashRecent = query<HTMLElement>("#dash-recent")
const dashInsert = query<HTMLButtonElement>("#dash-insert")
const dashCopy = query<HTMLButtonElement>("#dash-copy")
const openPracticeButton = query<HTMLButtonElement>("#open-practice")
const openManagerButton = query<HTMLButtonElement>("#open-manager")

// Snippets
const searchInput = query<HTMLInputElement>("#search")
const filterLanguage = query<HTMLSelectElement>("#filter-language")
const filterDifficulty = query<HTMLSelectElement>("#filter-difficulty")
const filterCategory = query<HTMLSelectElement>("#filter-category")
const filterKind = query<HTMLSelectElement>("#filter-kind")
const filterFavorite = query<HTMLSelectElement>("#filter-favorite")
const sortSelect = query<HTMLSelectElement>("#sort")
const snippetCount = query<HTMLElement>("#snippet-count")
const snippetList = query<HTMLElement>("#snippet-list")
const snippetEmpty = query<HTMLElement>("#snippet-empty")
const previewCard = query<HTMLElement>("#preview")
const previewTitle = query<HTMLElement>("#preview-title")
const previewMeta = query<HTMLElement>("#preview-meta")
const previewCode = query<HTMLElement>("#preview-code")
const previewExplanation = query<HTMLElement>("#preview-explanation")
const copyButton = query<HTMLButtonElement>("#copy-code")
const insertButton = query<HTMLButtonElement>("#insert-code")
const favoriteButton = query<HTMLButtonElement>("#toggle-favorite")
const duplicateButton = query<HTMLButtonElement>("#duplicate-snippet")
const deleteButton = query<HTMLButtonElement>("#delete-snippet")

// Practice
const timerValue = query<HTMLElement>("#practice-timer")
const timerStatus = query<HTMLElement>("#practice-timer-status")
const timerPause = query<HTMLButtonElement>("#timer-pause")
const timerResume = query<HTMLButtonElement>("#timer-resume")
const timerReset = query<HTMLButtonElement>("#timer-reset")
const markSolved = query<HTMLButtonElement>("#mark-solved")
const markFailed = query<HTMLButtonElement>("#mark-failed")
const markAttempted = query<HTMLButtonElement>("#mark-attempted")
const problemList = query<HTMLElement>("#problem-list")
const practiceOpen = query<HTMLButtonElement>("#practice-open")

// Statistics
const statTotal = query<HTMLElement>("#stat-total")
const statAttempted = query<HTMLElement>("#stat-attempted")
const statSolved = query<HTMLElement>("#stat-solved")
const statFailed = query<HTMLElement>("#stat-failed")
const statTime = query<HTMLElement>("#stat-time")
const statEasy = query<HTMLElement>("#stat-easy")
const statMedium = query<HTMLElement>("#stat-medium")
const statHard = query<HTMLElement>("#stat-hard")
const statCategory = query<HTMLElement>("#stat-category")
const statRecent = query<HTMLElement>("#stat-recent")

// Settings
const setTheme = query<HTMLSelectElement>("#set-theme")
const setLanguage = query<HTMLSelectElement>("#set-language")
const setSort = query<HTMLSelectElement>("#set-sort")
const setInsertMode = query<HTMLSelectElement>("#set-insert-mode")
const setTabSize = query<HTMLInputElement>("#set-tab-size")
const setConfirmDelete = query<HTMLInputElement>("#set-confirm-delete")
const setTimerAutostart = query<HTMLInputElement>("#set-timer-autostart")
const setPracticeOrigin = query<HTMLInputElement>("#set-practice-origin")
const saveSettingsButton = query<HTMLButtonElement>("#save-settings")
const exportButton = query<HTMLButtonElement>("#export-data")
const importButton = query<HTMLButtonElement>("#import-data")

/* ---------- state ---------- */

interface PopupState {
	snippets: Snippet[]
	history: PracticeSession[]
	settings: Settings
	stats: Stats
	timer: TimerState | null
	selectedId: string | null
	view: ViewName
}

const state: PopupState = {
	snippets: [],
	history: [],
	settings: defaultSettings(),
	stats: computeStats([], []),
	timer: null,
	selectedId: null,
	view: "dashboard",
}

const describe = (error: unknown): string => (error instanceof Error ? error.message : String(error))

const languageLabel = (language: Snippet["language"] | null): string =>
	language === null ? "unspecified language" : LANGUAGE_LABELS[language]

const selectedSnippet = (): Snippet | null =>
	state.snippets.find((snippet) => snippet.id === state.selectedId) ?? null

/* ---------- data loading ---------- */

async function refreshData(): Promise<void> {
	const store = await loadStore()
	state.snippets = store.snippets
	state.history = store.practiceHistory
	state.settings = store.settings
	state.timer = store.timer
	state.selectedId = store.selectedSnippetId
	state.stats = computeStats(store.practiceHistory, store.snippets)
	applyTheme(store.settings.theme)
}

function renderAll(): void {
	renderDashboard()
	renderSnippets()
	renderPractice()
	renderStatistics()
	renderSettings()
}

/* ---------- navigation ---------- */

function showView(view: ViewName): void {
	state.view = view
	for (const [name, section] of Object.entries(views)) {
		section.hidden = name !== view
	}
	for (const button of navButtons) {
		button.setAttribute("aria-pressed", String(button.dataset.view === view))
	}
}

/* ---------- dashboard ---------- */

function renderSessionList(host: HTMLElement, sessions: readonly PracticeSession[]): void {
	clear(host)
	if (sessions.length === 0) {
		host.appendChild(el("li", { class: "item__meta", text: "No practice sessions recorded yet." }))
		return
	}
	for (const session of sessions) {
		const row = el("li", { class: "entry" })
		row.appendChild(
			el("span", { text: `${session.problemName} \u00b7 ${languageLabel(session.language)}` }),
		)
		row.appendChild(
			el("span", {
				class: `entry__meta status--${session.status}`,
				text: `${session.status} \u00b7 ${formatDuration(session.durationMs)}`,
			}),
		)
		row.title = formatDateTime(session.completedAt)
		host.appendChild(row)
	}
}

function renderDashboard(): void {
	dashSnippets.textContent = String(state.stats.totalSnippets)
	dashSolved.textContent = String(state.stats.solvedProblems)
	dashAttempted.textContent = String(state.stats.attemptedProblems)
	dashTime.textContent = formatTotalTime(state.stats.totalPracticeMs)

	const snippet = selectedSnippet()
	if (snippet) {
		dashSelected.textContent = `${snippet.title} \u00b7 ${LANGUAGE_LABELS[snippet.language]} \u00b7 ${snippet.category}`
	} else {
		dashSelected.textContent =
			state.snippets.length === 0
				? "You have no saved snippets yet. Open the snippet manager to add one."
				: "Nothing selected yet. Pick a snippet in the Snippets tab."
	}
	dashInsert.disabled = snippet === null
	dashCopy.disabled = snippet === null

	renderSessionList(dashRecent, state.stats.recentSessions)
}

/* ---------- snippets ---------- */

function currentQuery(): SnippetQuery {
	const language = filterLanguage.value
	const difficulty = filterDifficulty.value
	const category = filterCategory.value
	return {
		search: searchInput.value,
		language: isLanguage(language) ? language : "all",
		difficulty: isDifficulty(difficulty) ? difficulty : "all",
		category: isCategory(category) ? category : "all",
		kind: filterKind.value === "solutions" || filterKind.value === "templates" ? filterKind.value : "all",
		favorite: filterFavorite.value === "favorites" ? "favorites" : "all",
		sort: isSortOrder(sortSelect.value) ? sortSelect.value : state.settings.defaultSort,
	}
}

function renderSnippets(): void {
	const visible = querySnippets(state.snippets, currentQuery())

	clear(snippetList)
	for (const snippet of visible) {
		const item = el("li", {
			class: `item${snippet.id === state.selectedId ? " item--selected" : ""}`,
		})
		item.tabIndex = 0
		item.setAttribute("role", "button")
		item.appendChild(
			el("p", {
				class: "item__title",
				text: `${snippet.favorite ? "\u2605 " : ""}${snippet.title}${snippet.isTemplate ? " (template)" : ""}`,
			}),
		)
		item.appendChild(
			el("p", {
				class: "item__meta",
				text: `${LANGUAGE_LABELS[snippet.language]} \u00b7 ${snippet.difficulty} \u00b7 ${snippet.category}`,
			}),
		)
		const choose = (): void => void select(snippet.id)
		item.addEventListener("click", choose)
		item.addEventListener("keydown", (event: KeyboardEvent) => {
			if (event.key === "Enter" || event.key === " ") {
				event.preventDefault()
				choose()
			}
		})
		snippetList.appendChild(item)
	}

	const total = state.snippets.length
	snippetCount.textContent = total === 0 ? "" : `Showing ${visible.length} of ${total}`
	snippetList.hidden = visible.length === 0
	snippetEmpty.hidden = visible.length > 0
	if (visible.length === 0) {
		snippetEmpty.textContent =
			total === 0
				? "No saved snippets yet. Open the snippet manager to create your first solution or template."
				: "No snippets match this search or filter combination."
	}

	renderPreview()
}

function renderPreview(): void {
	const snippet = selectedSnippet()
	previewCard.hidden = snippet === null
	if (!snippet) return

	previewTitle.textContent = snippet.title
	const bits = [
		LANGUAGE_LABELS[snippet.language],
		snippet.difficulty,
		snippet.category,
		snippet.isTemplate ? "template" : "solution",
	]
	if (snippet.timeComplexity) bits.push(`time ${snippet.timeComplexity}`)
	if (snippet.spaceComplexity) bits.push(`space ${snippet.spaceComplexity}`)
	if (snippet.tags.length > 0) bits.push(snippet.tags.join(", "))
	previewMeta.textContent = bits.join(" \u00b7 ")

	// textContent only - saved code is never parsed as HTML.
	previewCode.textContent = snippet.code === "" ? "(this snippet has no code yet)" : snippet.code
	previewExplanation.textContent = snippet.explanation || snippet.notes || ""
	previewExplanation.hidden = previewExplanation.textContent === ""
	favoriteButton.textContent = snippet.favorite ? "Unfavorite" : "Favorite"
	favoriteButton.setAttribute("aria-pressed", String(snippet.favorite))
}

async function select(id: string): Promise<void> {
	try {
		await snippetsService.selectSnippet(id)
		state.selectedId = id
		renderSnippets()
		renderDashboard()
	} catch (error) {
		toast(describe(error), "error")
	}
}

async function copySelected(): Promise<void> {
	const snippet = selectedSnippet()
	if (!snippet) {
		toast("Select a snippet first.", "error")
		return
	}
	try {
		await copyText(snippet.code)
		toast(`Copied "${snippet.title}" to the clipboard.`, "success")
	} catch (error) {
		toast(describe(error), "error")
	}
}

async function insertSelected(): Promise<void> {
	const snippet = selectedSnippet()
	if (!snippet) {
		toast("Select a snippet first.", "error")
		return
	}
	try {
		const result = (await chrome.runtime.sendMessage({
			type: "insert-snippet",
			snippetId: snippet.id,
		})) as InsertResult | undefined
		if (result?.ok) {
			toast(`Sent "${snippet.title}" to the ${result.target ?? "practice page"}.`, "success")
		} else {
			toast(result?.error ?? "The insert could not be delivered.", "error")
		}
	} catch (error) {
		toast(`Could not reach the extension worker: ${describe(error)}`, "error")
	}
}

async function toggleFavoriteSelected(): Promise<void> {
	const snippet = selectedSnippet()
	if (!snippet) return
	try {
		const updated = await snippetsService.toggleFavorite(snippet.id)
		await refreshData()
		renderAll()
		toast(updated.favorite ? "Added to favorites." : "Removed from favorites.", "success")
	} catch (error) {
		toast(describe(error), "error")
	}
}

async function duplicateSelected(): Promise<void> {
	const snippet = selectedSnippet()
	if (!snippet) return
	try {
		const copy = await snippetsService.duplicateSnippet(snippet.id)
		await snippetsService.selectSnippet(copy.id)
		await refreshData()
		renderAll()
		toast(`Duplicated as "${copy.title}".`, "success")
	} catch (error) {
		toast(describe(error), "error")
	}
}

async function deleteSelected(): Promise<void> {
	const snippet = selectedSnippet()
	if (!snippet) return
	if (state.settings.confirmBeforeDelete) {
		const confirmed = await confirmDialog(`Delete "${snippet.title}"? This cannot be undone.`)
		if (!confirmed) return
	}
	try {
		await snippetsService.deleteSnippet(snippet.id)
		await refreshData()
		renderAll()
		toast(`Deleted "${snippet.title}".`, "success")
	} catch (error) {
		toast(describe(error), "error")
	}
}

/* ---------- practice ---------- */

function paintTimer(): void {
	timerValue.textContent = formatDuration(practiceTimer.elapsedMs(state.timer))
	const running = practiceTimer.isRunning(state.timer)
	if (!state.timer) timerStatus.textContent = "No session yet - start the timer on the practice page."
	else timerStatus.textContent = `${running ? "Running" : "Paused"} \u00b7 ${state.timer.problemName}`

	timerPause.disabled = !running
	timerResume.disabled = state.timer === null || running
	timerReset.disabled = state.timer === null
	const noSession = state.timer === null
	markSolved.disabled = noSession
	markFailed.disabled = noSession
	markAttempted.disabled = noSession
}

function renderPractice(): void {
	paintTimer()
	if (problemList.childElementCount === 0) {
		for (const problem of PROBLEMS) {
			const row = el("li", { class: "entry" })
			row.appendChild(el("span", { text: problem.name }))
			row.appendChild(
				el("span", { class: "entry__meta", text: `${problem.difficulty} \u00b7 ${problem.category}` }),
			)
			problemList.appendChild(row)
		}
	}
}

async function timerAction(
	action: () => Promise<TimerState | null | void>,
	message?: string,
): Promise<void> {
	try {
		await action()
		await refreshData()
		renderAll()
		if (message) toast(message, "success")
	} catch (error) {
		toast(describe(error), "error")
	}
}

async function recordOutcome(status: "solved" | "failed" | "attempted"): Promise<void> {
	try {
		const session = await practiceTimer.recordOutcome(status)
		await refreshData()
		renderAll()
		toast(
			`Recorded ${status} \u00b7 ${session.problemName} \u00b7 ${formatDuration(session.durationMs)}`,
			status === "failed" ? "info" : "success",
		)
	} catch (error) {
		toast(describe(error), "error")
	}
}

/* ---------- statistics ---------- */

function renderStatistics(): void {
	const stats = state.stats
	statTotal.textContent = String(stats.totalProblems)
	statAttempted.textContent = String(stats.attemptedProblems)
	statSolved.textContent = String(stats.solvedProblems)
	statFailed.textContent = String(stats.failedProblems)
	statTime.textContent = formatTotalTime(stats.totalPracticeMs)
	statEasy.textContent = String(stats.easySolved)
	statMedium.textContent = String(stats.mediumSolved)
	statHard.textContent = String(stats.hardSolved)

	if (stats.mostPracticedCategory === null) {
		statCategory.textContent = "No sessions yet."
	} else {
		const top = stats.categoryBreakdown[0]
		statCategory.textContent =
			top === undefined
				? stats.mostPracticedCategory
				: `${stats.mostPracticedCategory} \u00b7 ${top.sessions} session${top.sessions === 1 ? "" : "s"} \u00b7 ${formatTotalTime(top.durationMs)}`
	}

	renderSessionList(statRecent, stats.recentSessions)
}

/* ---------- settings ---------- */

function renderSettings(): void {
	setTheme.value = state.settings.theme
	setLanguage.value = state.settings.defaultLanguage
	setSort.value = state.settings.defaultSort
	setInsertMode.value = state.settings.insertMode
	setTabSize.value = String(state.settings.editorTabSize)
	setConfirmDelete.checked = state.settings.confirmBeforeDelete
	setTimerAutostart.checked = state.settings.timerAutoStart
	setPracticeOrigin.value = state.settings.localPracticeOrigin
}

async function saveSettings(): Promise<void> {
	const theme = setTheme.value
	const language = setLanguage.value
	const sort = setSort.value
	const tabSize = Number.parseInt(setTabSize.value, 10)
	const origin = setPracticeOrigin.value.trim()
	const cleanedOrigin = sanitizeLocalOrigin(origin)
	if (origin !== "" && cleanedOrigin === "") {
		toast("Only http://localhost or http://127.0.0.1 origins are accepted.", "error")
		return
	}

	const next: Settings = {
		theme: theme === "light" || theme === "dark" ? theme : "system",
		defaultLanguage: isLanguage(language) ? language : state.settings.defaultLanguage,
		defaultSort: isSortOrder(sort) ? sort : state.settings.defaultSort,
		confirmBeforeDelete: setConfirmDelete.checked,
		timerAutoStart: setTimerAutostart.checked,
		insertMode: setInsertMode.value === "append" ? "append" : "replace",
		editorTabSize: Number.isFinite(tabSize) ? Math.min(8, Math.max(1, tabSize)) : 4,
		localPracticeOrigin: cleanedOrigin,
	}

	try {
		await mutateStore((store) => {
			store.settings = next
		})
		await refreshData()
		renderAll()
		toast("Settings saved.", "success")
	} catch (error) {
		toast(describe(error), "error")
	}
}

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
		// Give the download a tick to start before the blob is released.
		window.setTimeout(() => URL.revokeObjectURL(url), 4000)
		toast("Exported your data as JSON.", "success")
	} catch (error) {
		toast(describe(error), "error")
	}
}

async function sendSimple(
	type: "open-practice" | "open-snippet-manager",
	failure: string,
): Promise<void> {
	try {
		const result = (await chrome.runtime.sendMessage({ type })) as InsertResult | undefined
		if (result?.ok) window.close()
		else toast(result?.error ?? failure, "error")
	} catch (error) {
		toast(`${failure} ${describe(error)}`, "error")
	}
}

/* ---------- wiring ---------- */

function fillSelectors(): void {
	const languageOptions = LANGUAGES.map((language) => ({
		value: language,
		label: LANGUAGE_LABELS[language],
	}))
	const sortOptions = SORT_ORDERS.map((order) => ({ value: order, label: SORT_LABELS[order] }))

	fillSelect(filterLanguage, [{ value: "all", label: "All languages" }, ...languageOptions], "all")
	fillSelect(
		filterDifficulty,
		[
			{ value: "all", label: "All difficulties" },
			...DIFFICULTIES.map((difficulty) => ({ value: difficulty, label: difficulty })),
		],
		"all",
	)
	fillSelect(
		filterCategory,
		[
			{ value: "all", label: "All categories" },
			...CATEGORIES.map((category) => ({ value: category, label: category })),
		],
		"all",
	)
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

	fillSelect(
		setTheme,
		[
			{ value: "system", label: "Follow the system" },
			{ value: "dark", label: "Dark" },
			{ value: "light", label: "Light" },
		],
		state.settings.theme,
	)
	fillSelect(setLanguage, languageOptions, state.settings.defaultLanguage)
	fillSelect(setSort, sortOptions, state.settings.defaultSort)
	fillSelect(
		setInsertMode,
		[
			{ value: "replace", label: "Replace the editor contents" },
			{ value: "append", label: "Append below the editor contents" },
		],
		state.settings.insertMode,
	)
}

function isViewName(value: string | undefined): value is ViewName {
	return (
		value === "dashboard" ||
		value === "snippets" ||
		value === "practice" ||
		value === "statistics" ||
		value === "settings"
	)
}

function wire(): void {
	for (const button of navButtons) {
		button.addEventListener("click", () => {
			const target = button.dataset.view
			if (isViewName(target)) showView(target)
		})
	}

	searchInput.addEventListener("input", renderSnippets)
	for (const control of [
		filterLanguage,
		filterDifficulty,
		filterCategory,
		filterKind,
		filterFavorite,
		sortSelect,
	]) {
		control.addEventListener("change", renderSnippets)
	}

	copyButton.addEventListener("click", () => void copySelected())
	dashCopy.addEventListener("click", () => void copySelected())
	insertButton.addEventListener("click", () => void insertSelected())
	dashInsert.addEventListener("click", () => void insertSelected())
	favoriteButton.addEventListener("click", () => void toggleFavoriteSelected())
	duplicateButton.addEventListener("click", () => void duplicateSelected())
	deleteButton.addEventListener("click", () => void deleteSelected())

	for (const button of [openPracticeButton, practiceOpen]) {
		button.addEventListener("click", () => {
			void sendSimple("open-practice", "Could not open the practice page.")
		})
	}
	for (const button of [openManagerButton, importButton]) {
		button.addEventListener("click", () => {
			void sendSimple("open-snippet-manager", "Could not open the snippet manager.")
		})
	}

	timerPause.addEventListener("click", () => void timerAction(() => practiceTimer.pause()))
	timerResume.addEventListener("click", () => void timerAction(() => practiceTimer.resume()))
	timerReset.addEventListener("click", () => void timerAction(() => practiceTimer.reset(), "Timer reset."))
	markSolved.addEventListener("click", () => void recordOutcome("solved"))
	markFailed.addEventListener("click", () => void recordOutcome("failed"))
	markAttempted.addEventListener("click", () => void recordOutcome("attempted"))

	saveSettingsButton.addEventListener("click", () => void saveSettings())
	exportButton.addEventListener("click", () => void exportData())

	// Elapsed time is always derived from stored timestamps; this only repaints.
	window.setInterval(paintTimer, 500)

	// Another surface (practice page or snippet manager) may change the data
	// while the popup is open.
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
	renderAll()
	showView("dashboard")
	loadingNode.hidden = true
	mainNode.hidden = false
}

void init()
