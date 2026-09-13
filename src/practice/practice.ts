/**
 * Controller for the controlled practice environment.
 *
 * This page is part of this repository and is the ONLY place the extension
 * inserts code into. It receives the user's own saved snippet through one of
 * two validated paths:
 *   1. opened as an extension page: background -> chrome.runtime message
 *      ("practice-ready" claims a queued insert);
 *   2. served locally (http://localhost): content script -> window.postMessage
 *      envelope, acknowledged back to the content script.
 *
 * Nothing here touches a third-party site, simulates input, or inspects other
 * pages. Code is executed only in the sandboxed runner frame, only when the
 * user clicks Run or Test.
 */

import { describeValue, formatArgs, type CaseResult, type TestCase } from "./grading.js"
import { insertIndent, lineCount, tokenize } from "./highlight.js"
import { PROBLEMS, firstProblem, getProblem, isRunnable, starterCodeFor, type Problem } from "./problems.js"
import { buildRunnerRequest, isRunnerResponse, type RunnerResponse } from "./protocol.js"
import { buildPageAck, isPageEnvelope, validateInsertPayload, type InsertResult } from "../services/messaging.js"
import * as practiceTimer from "../services/timer.js"
import { loadStore } from "../storage/repository.js"
import { defaultSettings } from "../storage/schema.js"
import { LANGUAGES, LANGUAGE_LABELS, isLanguage } from "../utils/constants.js"
import { applyTheme, clear, copyText, createToaster, el, fillSelect, query } from "../utils/dom.js"
import { formatDuration } from "../utils/time.js"
import type { Language, Settings, TimerState } from "../types/models.js"

const RUN_TIMEOUT_MS = 5000

/* ---------- element handles ---------- */

const problemSelect = query<HTMLSelectElement>("#problem-select")
const languageSelect = query<HTMLSelectElement>("#language-select")
const titleNode = query<HTMLElement>("#problem-title")
const difficultyNode = query<HTMLElement>("#problem-difficulty")
const categoryNode = query<HTMLElement>("#problem-category")
const descriptionNode = query<HTMLElement>("#problem-description")
const examplesNode = query<HTMLElement>("#problem-examples")
const constraintsNode = query<HTMLElement>("#problem-constraints")
const expectedNode = query<HTMLElement>("#problem-expected")
const casesNode = query<HTMLElement>("#problem-cases")
const noticeNode = query<HTMLElement>("#page-notice")

const editor = query<HTMLTextAreaElement>("#editor")
const highlightPre = query<HTMLElement>("#highlight")
const highlightCode = query<HTMLElement>("#highlight-code")
const gutter = query<HTMLElement>("#gutter")
const outputNode = query<HTMLElement>("#output")

const runButton = query<HTMLButtonElement>("#run")
const testButton = query<HTMLButtonElement>("#test")
const resetButton = query<HTMLButtonElement>("#reset")
const clearButton = query<HTMLButtonElement>("#clear-code")
const copyButton = query<HTMLButtonElement>("#copy")

const timerDisplay = query<HTMLElement>("#timer-display")
const timerStatus = query<HTMLElement>("#timer-status")
const timerStart = query<HTMLButtonElement>("#timer-start")
const timerPause = query<HTMLButtonElement>("#timer-pause")
const timerResume = query<HTMLButtonElement>("#timer-resume")
const timerReset = query<HTMLButtonElement>("#timer-reset")
const markSolved = query<HTMLButtonElement>("#mark-solved")
const markFailed = query<HTMLButtonElement>("#mark-failed")
const markAttempted = query<HTMLButtonElement>("#mark-attempted")

const toast = createToaster(query<HTMLElement>("#toast"))

/* ---------- state ---------- */

/** True when this page runs as an extension page (chrome.* available). */
const hasExtensionApis =
	typeof chrome !== "undefined" && typeof chrome.runtime !== "undefined" && Boolean(chrome.runtime.id)

let settings: Settings = defaultSettings()
let currentProblem: Problem = firstProblem()
let currentLanguage: Language = settings.defaultLanguage
let timerState: TimerState | null = null
let runnerFrame = query<HTMLIFrameElement>("#runner")
let runnerUsable = true
let requestCounter = 0

/** Unsaved editor contents, keyed by problem + language, kept in memory. */
const drafts = new Map<string, string>()
const draftKey = (problemId: string, language: Language): string => `${problemId}::${language}`

interface PendingRun {
	resolve: (response: RunnerResponse) => void
	reject: (error: Error) => void
	timeoutId: number
}
const pendingRuns = new Map<string, PendingRun>()

/* ---------- problem rendering ---------- */

function difficultyClass(problem: Problem): string {
	return `badge badge--${problem.difficulty.toLowerCase()}`
}

function renderProblem(problem: Problem): void {
	titleNode.textContent = problem.name
	difficultyNode.textContent = problem.difficulty
	difficultyNode.className = difficultyClass(problem)
	categoryNode.textContent = problem.category

	clear(descriptionNode)
	for (const paragraph of problem.description) {
		descriptionNode.appendChild(el("p", { text: paragraph }))
	}

	clear(examplesNode)
	problem.examples.forEach((example, index) => {
		const card = el("div", { class: "example" })
		card.appendChild(el("p", { class: "example__row" }, [
			el("span", { class: "example__label", text: `Example ${index + 1} input: ` }),
			document.createTextNode(example.input),
		]))
		card.appendChild(el("p", { class: "example__row" }, [
			el("span", { class: "example__label", text: "Output: " }),
			document.createTextNode(example.output),
		]))
		if (example.explanation) {
			card.appendChild(el("p", { class: "example__note", text: example.explanation }))
		}
		examplesNode.appendChild(card)
	})

	clear(constraintsNode)
	for (const constraint of problem.constraints) {
		constraintsNode.appendChild(el("li", { text: constraint }))
	}

	expectedNode.textContent = problem.expectedBehavior

	clear(casesNode)
	for (const testCase of problem.testCases) {
		const label = `${testCase.name}: ${problem.functionName}(${formatArgs(testCase.args)}) \u2192 ${describeValue(testCase.expected)}`
		casesNode.appendChild(el("li", { text: label }))
	}
}

/* ---------- editor ---------- */

function paintGutter(lines: number): void {
	if (gutter.childElementCount === lines) return
	clear(gutter)
	for (let line = 1; line <= lines; line += 1) {
		gutter.appendChild(el("div", { class: "editor__line", text: String(line) }))
	}
}

function paintEditor(): void {
	const code = editor.value
	const fragment = document.createDocumentFragment()
	for (const token of tokenize(code, currentLanguage)) {
		if (token.type === "plain") fragment.appendChild(document.createTextNode(token.value))
		else fragment.appendChild(el("span", { class: `tok tok--${token.type}`, text: token.value }))
	}
	// Keeps the highlight layer's height in step with a trailing newline.
	fragment.appendChild(document.createTextNode("\n"))
	clear(highlightCode)
	highlightCode.appendChild(fragment)
	paintGutter(lineCount(code))
	syncScroll()
}

function syncScroll(): void {
	highlightPre.scrollTop = editor.scrollTop
	highlightPre.scrollLeft = editor.scrollLeft
	gutter.scrollTop = editor.scrollTop
}

function setEditorCode(code: string): void {
	editor.value = code
	drafts.set(draftKey(currentProblem.id, currentLanguage), code)
	paintEditor()
}

function loadEditorForSelection(): void {
	const existing = drafts.get(draftKey(currentProblem.id, currentLanguage))
	editor.value = existing ?? starterCodeFor(currentProblem, currentLanguage)
	paintEditor()
}

/* ---------- output panel ---------- */

function showPlaceholder(message: string): void {
	clear(outputNode)
	outputNode.appendChild(el("p", { class: "output__placeholder", text: message }))
}

function showError(message: string): void {
	clear(outputNode)
	outputNode.appendChild(el("p", { class: "output__error", text: message }))
}

function caseRow(key: string, value: string): HTMLElement {
	return el("p", { class: "output__row" }, [
		el("span", { class: "output__key", text: `${key}: ` }),
		document.createTextNode(value),
	])
}

function renderResults(response: RunnerResponse, mode: "run" | "test"): void {
	clear(outputNode)

	if (!response.ok) {
		outputNode.appendChild(
			el("p", { class: "output__error", text: response.error ?? "Your code could not be executed." }),
		)
		if (response.logs.length > 0) {
			outputNode.appendChild(el("pre", { class: "output__logs", text: response.logs.join("\n") }))
		}
		return
	}

	const { passed, total, allPassed } = response.summary
	const heading = mode === "run" ? "Run" : "Tests"
	outputNode.appendChild(
		el("p", {
			class: `output__summary output__summary--${allPassed ? "pass" : "fail"}`,
			text: `${heading}: ${passed}/${total} passed`,
		}),
	)

	for (const result of response.results) {
		outputNode.appendChild(renderCase(result))
	}

	if (response.logs.length > 0) {
		outputNode.appendChild(el("pre", { class: "output__logs", text: response.logs.join("\n") }))
	}
}

function renderCase(result: CaseResult): HTMLElement {
	const card = el("div", { class: `output__case output__case--${result.passed ? "pass" : "fail"}` })
	card.appendChild(
		el("p", {
			class: "output__case-title",
			text: `${result.passed ? "PASS" : "FAIL"} \u00b7 ${result.name}`,
		}),
	)
	card.appendChild(caseRow("expected", result.expected))
	card.appendChild(caseRow("received", result.actual))
	if (result.error) card.appendChild(caseRow("error", result.error))
	return card
}

/* ---------- sandboxed runner ---------- */

function rebuildRunner(): void {
	const replacement = el("iframe", {
		id: "runner",
		class: "runner-frame",
		src: "runner.html",
		title: "Sandboxed code runner",
	})
	runnerFrame.replaceWith(replacement)
	runnerFrame = replacement
	runnerUsable = true
}

function settleRun(response: RunnerResponse): void {
	const pending = pendingRuns.get(response.requestId)
	if (!pending) return
	pendingRuns.delete(response.requestId)
	window.clearTimeout(pending.timeoutId)
	pending.resolve(response)
}

function requestRun(code: string, functionName: string, cases: TestCase[]): Promise<RunnerResponse> {
	const frameWindow = runnerFrame.contentWindow
	if (!frameWindow) {
		return Promise.reject(new Error("The sandboxed runner is not ready yet. Try again in a moment."))
	}
	requestCounter += 1
	const requestId = `run-${requestCounter}`
	const request = buildRunnerRequest({ requestId, code, functionName, cases })
	return new Promise<RunnerResponse>((resolve, reject) => {
		const timeoutId = window.setTimeout(() => {
			pendingRuns.delete(requestId)
			// The frame is still spinning; replace it so the next run starts clean.
			runnerUsable = false
			rebuildRunner()
			reject(
				new Error(
					`Your code did not finish within ${RUN_TIMEOUT_MS / 1000} seconds and was abandoned. Check for an infinite loop. If Run stays unresponsive, reload this page.`,
				),
			)
		}, RUN_TIMEOUT_MS)
		pendingRuns.set(requestId, { resolve, reject, timeoutId })
		// The sandboxed frame has an opaque origin, so "*" is the only usable
		// target. The frame itself only accepts messages from its parent.
		frameWindow.postMessage(request, "*")
	})
}

function setBusy(busy: boolean): void {
	runButton.disabled = busy
	testButton.disabled = busy
}

async function execute(mode: "run" | "test"): Promise<void> {
	if (!isRunnable(currentLanguage)) {
		showPlaceholder(
			`This environment executes JavaScript only. You can still write, insert, copy and time ${LANGUAGE_LABELS[currentLanguage]} solutions, and switch the language selector to JavaScript to run tests.`,
		)
		return
	}
	if (editor.value.trim() === "") {
		showError("The editor is empty. Write a solution, or insert one of your saved snippets.")
		return
	}
	if (!runnerUsable) {
		showPlaceholder("Restarting the sandboxed runner\u2026 press Run again.")
		return
	}

	const cases = mode === "run" ? currentProblem.testCases.slice(0, 1) : currentProblem.testCases
	setBusy(true)
	showPlaceholder(mode === "run" ? "Running the first test case\u2026" : "Running all test cases\u2026")
	try {
		const response = await requestRun(editor.value, currentProblem.functionName, cases)
		renderResults(response, mode)
		if (response.ok && response.summary.allPassed) {
			toast(mode === "run" ? "First case passed." : "All test cases passed.", "success")
		} else if (!response.ok) {
			toast("Your code raised an error.", "error")
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		showError(message)
		toast(message, "error")
	} finally {
		setBusy(false)
	}
}

/* ---------- code insertion (the controlled target) ---------- */

function applyInsert(rawPayload: unknown): InsertResult {
	const check = validateInsertPayload(rawPayload)
	if (!check.ok) {
		toast(check.error, "error")
		showError(`Insert rejected: ${check.error}`)
		return { ok: false, error: check.error }
	}
	const payload = check.payload

	if (payload.language !== currentLanguage) {
		currentLanguage = payload.language
		languageSelect.value = payload.language
	}

	if (payload.mode === "append" && editor.value.trim() !== "") {
		const separator = editor.value.endsWith("\n") ? "\n" : "\n\n"
		setEditorCode(editor.value + separator + payload.code)
	} else {
		setEditorCode(payload.code)
	}

	editor.focus()
	toast(`Inserted "${payload.title}" into the practice editor.`, "success")
	showPlaceholder(
		`Inserted "${payload.title}" (${LANGUAGE_LABELS[payload.language]}, ${payload.mode}). Press Run or Test when you are ready.`,
	)
	return { ok: true, target: "practice editor" }
}

/** Asks the background worker for a queued insert, if any. */
async function claimPendingInsert(): Promise<void> {
	if (!hasExtensionApis) return
	try {
		const response = (await chrome.runtime.sendMessage({ type: "practice-ready" })) as
			| { ok?: boolean; payload?: unknown; error?: string }
			| undefined
		if (response && response.ok === true && response.payload) applyInsert(response.payload)
	} catch (error) {
		// The service worker may still be waking up; this is not fatal for the page.
		const message = error instanceof Error ? error.message : String(error)
		toast(`Could not reach the extension: ${message}`, "error")
	}
}

window.addEventListener("message", (event: MessageEvent<unknown>) => {
	if (isRunnerResponse(event.data)) {
		if (!event.source || event.source !== runnerFrame.contentWindow) return
		settleRun(event.data)
		return
	}
	if (isPageEnvelope(event.data)) {
		// Only this page's own content script may bridge an insert.
		if (event.origin !== window.location.origin || event.source !== window) return
		const result = applyInsert(event.data.payload)
		window.postMessage(buildPageAck(result), window.location.origin)
	}
})

/* ---------- timer ---------- */

function problemRef(): practiceTimer.ProblemRef {
	return {
		problemId: currentProblem.id,
		problemName: currentProblem.name,
		difficulty: currentProblem.difficulty,
		category: currentProblem.category,
		language: currentLanguage,
	}
}

function paintTimer(): void {
	timerDisplay.textContent = formatDuration(practiceTimer.elapsedMs(timerState))
	if (!timerState) {
		timerStatus.textContent = hasExtensionApis
			? "No session yet"
			: "Timer needs the extension page"
	} else if (practiceTimer.isRunning(timerState)) {
		timerStatus.textContent = `Running \u00b7 ${timerState.problemName}`
	} else {
		timerStatus.textContent = `Paused \u00b7 ${timerState.problemName}`
	}

	const running = practiceTimer.isRunning(timerState)
	timerPause.disabled = !running
	timerResume.disabled = timerState === null || running
	timerReset.disabled = timerState === null
	const noSession = timerState === null
	markSolved.disabled = noSession
	markFailed.disabled = noSession
	markAttempted.disabled = noSession
}

async function refreshTimer(): Promise<void> {
	if (!hasExtensionApis) return
	try {
		timerState = await practiceTimer.getTimer()
	} catch (error) {
		toast(error instanceof Error ? error.message : String(error), "error")
	}
	paintTimer()
}

async function timerAction(action: () => Promise<TimerState | null | void>, message?: string): Promise<void> {
	if (!hasExtensionApis) {
		toast("Open this page from the extension to use the practice timer.", "error")
		return
	}
	try {
		const next = await action()
		if (next === undefined) await refreshTimer()
		else {
			timerState = next
			paintTimer()
		}
		if (message) toast(message, "success")
	} catch (error) {
		toast(error instanceof Error ? error.message : String(error), "error")
	}
}

async function recordOutcome(status: "solved" | "failed" | "attempted"): Promise<void> {
	if (!hasExtensionApis) {
		toast("Open this page from the extension to record practice sessions.", "error")
		return
	}
	try {
		const session = await practiceTimer.recordOutcome(status)
		await refreshTimer()
		toast(
			`Recorded ${status} \u00b7 ${session.problemName} \u00b7 ${formatDuration(session.durationMs)}`,
			status === "failed" ? "info" : "success",
		)
	} catch (error) {
		toast(error instanceof Error ? error.message : String(error), "error")
	}
}

/* ---------- wiring ---------- */

function selectProblem(problemId: string): void {
	const problem = getProblem(problemId)
	if (!problem) return
	currentProblem = problem
	renderProblem(problem)
	loadEditorForSelection()
	showPlaceholder(`Loaded ${problem.name}. Press Run to check the first test case.`)
	void maybeAutoStartTimer()
}

async function maybeAutoStartTimer(): Promise<void> {
	if (!hasExtensionApis || !settings.timerAutoStart) return
	if (timerState && timerState.problemId === currentProblem.id) return
	await timerAction(() => practiceTimer.start(problemRef()))
}

function wireEditor(): void {
	editor.addEventListener("input", () => {
		drafts.set(draftKey(currentProblem.id, currentLanguage), editor.value)
		paintEditor()
	})
	editor.addEventListener("scroll", syncScroll)
	editor.addEventListener("keydown", (event: KeyboardEvent) => {
		if (event.key === "Tab" && !event.ctrlKey && !event.metaKey && !event.altKey) {
			event.preventDefault()
			const { value, caret } = insertIndent(
				editor.value,
				editor.selectionStart,
				editor.selectionEnd,
				settings.editorTabSize,
			)
			setEditorCode(value)
			editor.setSelectionRange(caret, caret)
			return
		}
		if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
			event.preventDefault()
			void execute(event.shiftKey ? "test" : "run")
		}
	})
}

function wireToolbar(): void {
	runButton.addEventListener("click", () => void execute("run"))
	testButton.addEventListener("click", () => void execute("test"))
	resetButton.addEventListener("click", () => {
		setEditorCode(starterCodeFor(currentProblem, currentLanguage))
		toast("Starter code restored.", "info")
	})
	clearButton.addEventListener("click", () => {
		setEditorCode("")
		editor.focus()
		toast("Editor cleared.", "info")
	})
	copyButton.addEventListener("click", () => {
		void copyText(editor.value)
			.then(() => toast("Editor contents copied.", "success"))
			.catch((error: unknown) => {
				const message = error instanceof Error ? error.message : String(error)
				toast(message, "error")
			})
	})
}

function wireSelectors(): void {
	problemSelect.addEventListener("change", () => selectProblem(problemSelect.value))
	languageSelect.addEventListener("change", () => {
		if (!isLanguage(languageSelect.value)) return
		currentLanguage = languageSelect.value
		loadEditorForSelection()
	})
}

function wireTimer(): void {
	timerStart.addEventListener("click", () => {
		void timerAction(() => practiceTimer.start(problemRef()), `Timer started for ${currentProblem.name}.`)
	})
	timerPause.addEventListener("click", () => void timerAction(() => practiceTimer.pause()))
	timerResume.addEventListener("click", () => void timerAction(() => practiceTimer.resume()))
	timerReset.addEventListener("click", () => void timerAction(() => practiceTimer.reset(), "Timer reset."))
	markSolved.addEventListener("click", () => void recordOutcome("solved"))
	markFailed.addEventListener("click", () => void recordOutcome("failed"))
	markAttempted.addEventListener("click", () => void recordOutcome("attempted"))
	// Repaint only; elapsed time is always derived from stored timestamps.
	window.setInterval(paintTimer, 500)
	document.addEventListener("visibilitychange", () => {
		if (!document.hidden) void refreshTimer()
	})
}

function wireStorageSync(): void {
	if (!hasExtensionApis) return
	let syncing = false
	chrome.storage.onChanged.addListener((_changes, areaName) => {
		if (areaName !== "local" || syncing) return
		syncing = true
		void (async () => {
			try {
				const store = await loadStore()
				timerState = store.timer
				settings = store.settings
				applyTheme(settings.theme)
				paintTimer()
				if (store.pendingInsert) await claimPendingInsert()
			} finally {
				syncing = false
			}
		})()
	})
}

async function init(): Promise<void> {
	fillSelect(
		problemSelect,
		PROBLEMS.map((problem) => ({ value: problem.id, label: `${problem.name} \u00b7 ${problem.difficulty}` })),
		currentProblem.id,
	)
	fillSelect(
		languageSelect,
		LANGUAGES.map((language) => ({ value: language, label: LANGUAGE_LABELS[language] })),
		currentLanguage,
	)

	if (hasExtensionApis) {
		try {
			const store = await loadStore()
			settings = store.settings
			timerState = store.timer
		} catch (error) {
			toast(error instanceof Error ? error.message : String(error), "error")
		}
	} else {
		noticeNode.hidden = false
		noticeNode.textContent =
			"This copy of the practice page is served locally, so the timer, practice history and settings are unavailable. Open the practice page from the extension for the full experience; inserting code still works through the content script."
	}

	currentLanguage = settings.defaultLanguage
	languageSelect.value = currentLanguage
	applyTheme(settings.theme)

	renderProblem(currentProblem)
	loadEditorForSelection()
	paintTimer()
	showPlaceholder(
		"Write a solution, or insert one of your saved snippets from the extension popup, then press Run.",
	)

	wireEditor()
	wireToolbar()
	wireSelectors()
	wireTimer()
	wireStorageSync()

	await claimPendingInsert()
	await maybeAutoStartTimer()
}

void init().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error)
	showError(`The practice page failed to start: ${message}`)
})
