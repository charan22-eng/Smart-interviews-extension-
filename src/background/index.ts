/**
 * Background service worker (Manifest V3).
 *
 * Responsibilities:
 *  - initialise / repair storage on install and on browser startup
 *  - own the keyboard commands declared in the manifest
 *  - route validated insert requests from the popup to the controlled
 *    practice page (either the bundled extension page or a locally served
 *    copy reached through the content script)
 *
 * The worker holds no mutable module state that matters: every piece of state
 * lives in chrome.storage.local, so Chrome suspending the worker between
 * events is harmless.
 *
 * Scope boundary: the only insert targets are the practice page bundled in
 * this repository and an optional http://localhost copy of it. No third-party
 * site is scripted, observed or modified.
 */

import {
	isExtensionMessage,
	validateInsertPayload,
	type InsertPayload,
	type InsertResult,
} from "../services/messaging.js"
import type { Settings, Snippet } from "../types/models.js"
import { loadStore, loadStoreWithRepairs, mutateStore } from "../storage/repository.js"

const PRACTICE_PATH = "practice/index.html"

function describe(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

function practiceUrl(): string {
	return chrome.runtime.getURL(PRACTICE_PATH)
}

function buildPayload(snippet: Snippet, settings: Settings): InsertPayload {
	return {
		snippetId: snippet.id,
		title: snippet.title,
		language: snippet.language,
		code: snippet.code,
		mode: settings.insertMode,
	}
}

/** Narrows an untrusted sendMessage response into an InsertResult. */
function asInsertResult(value: unknown): InsertResult | null {
	if (typeof value !== "object" || value === null) return null
	const record = value as { ok?: unknown; error?: unknown; target?: unknown }
	if (typeof record.ok !== "boolean") return null
	return {
		ok: record.ok,
		error: typeof record.error === "string" ? record.error : undefined,
		target: typeof record.target === "string" ? record.target : undefined,
	}
}

/** Practice tabs: the bundled page, plus an optional local copy of it. */
async function findPracticeTabs(localOrigin: string): Promise<ChromeTab[]> {
	const patterns = [`${practiceUrl()}*`]
	if (localOrigin !== "") patterns.push(`${localOrigin}/*`)
	const tabs: ChromeTab[] = []
	for (const pattern of patterns) {
		try {
			for (const tab of await chrome.tabs.query({ url: pattern })) {
				if (typeof tab.id === "number") tabs.push(tab)
			}
		} catch (error) {
			console.warn(`DSA Practice Companion: could not query "${pattern}": ${describe(error)}`)
		}
	}
	return tabs
}

async function focusOrOpenPractice(): Promise<ChromeTab> {
	const existing = await findPracticeTabs("")
	const first = existing[0]
	if (first && typeof first.id === "number") {
		await chrome.tabs.update(first.id, { active: true })
		if (typeof first.windowId === "number" && chrome.windows) {
			try {
				await chrome.windows.update(first.windowId, { focused: true })
			} catch (error) {
				console.warn(`DSA Practice Companion: could not focus window: ${describe(error)}`)
			}
		}
		return first
	}
	return chrome.tabs.create({ url: practiceUrl(), active: true })
}

/**
 * Delivers a validated payload to an open practice page. If no practice page
 * is open the insert is queued in storage and the page is opened; the page
 * claims the queued insert once it is ready (see the "practice-ready" message).
 */
async function deliver(payload: InsertPayload): Promise<InsertResult> {
	const store = await loadStore()
	const tabs = await findPracticeTabs(store.settings.localPracticeOrigin)
	const failures: string[] = []

	for (const tab of tabs) {
		if (typeof tab.id !== "number") continue
		try {
			const response = await chrome.tabs.sendMessage(tab.id, {
				type: "insert-into-practice",
				payload,
			})
			const result = asInsertResult(response)
			if (result?.ok) return result
			failures.push(result?.error ?? "The practice page did not confirm the insert.")
		} catch (error) {
			// Typically "Receiving end does not exist": the tab is still loading or
			// the content script is not present on that page.
			failures.push(describe(error))
		}
	}

	await mutateStore((current) => {
		current.pendingInsert = { snippetId: payload.snippetId, createdAt: Date.now() }
	})
	const tab = await focusOrOpenPractice()
	if (typeof tab.id !== "number") {
		return { ok: false, error: "Could not open the practice page." }
	}
	return {
		ok: true,
		target:
			failures.length === 0
				? "Opened the practice page; your code will be inserted when it loads."
				: `Practice page reopened after an error (${failures[0]}); your code will be inserted when it loads.`,
	}
}

/** Entry point for both the popup button and the keyboard command. */
async function insertSnippet(snippetId?: string): Promise<InsertResult> {
	let store
	try {
		store = await loadStore()
	} catch (error) {
		return { ok: false, error: describe(error) }
	}
	const id = snippetId ?? store.selectedSnippetId
	if (!id) {
		return { ok: false, error: "Select a snippet in the popup first, then insert it." }
	}
	const snippet = store.snippets.find((entry) => entry.id === id)
	if (!snippet) return { ok: false, error: "That snippet no longer exists." }

	const check = validateInsertPayload(buildPayload(snippet, store.settings))
	if (!check.ok) return { ok: false, error: check.error }
	try {
		return await deliver(check.payload)
	} catch (error) {
		return { ok: false, error: describe(error) }
	}
}

/** Hands the queued insert (if any) to a practice page that just loaded. */
async function claimPendingInsert(): Promise<InsertPayload | null> {
	const { result } = await mutateStore((store) => {
		const pending = store.pendingInsert
		store.pendingInsert = null
		if (!pending) return null
		const snippet = store.snippets.find((entry) => entry.id === pending.snippetId)
		if (!snippet) return null
		const check = validateInsertPayload(buildPayload(snippet, store.settings))
		return check.ok ? check.payload : null
	})
	return result
}

/* ---- event wiring (registered once, at top level, as MV3 requires) ---- */

chrome.runtime.onInstalled.addListener((details) => {
	// Touching storage here creates the default store on first install and
	// repairs/migrates it after an update.
	void loadStoreWithRepairs()
		.then(({ repairs }) => {
			if (repairs.length > 0) {
				console.warn(`DSA Practice Companion repaired saved data (${details.reason}):`, repairs)
			}
		})
		.catch((error: unknown) => {
			console.error(`DSA Practice Companion: storage unavailable on install: ${describe(error)}`)
		})
})

chrome.runtime.onStartup.addListener(() => {
	void loadStore().catch((error: unknown) => {
		console.error(`DSA Practice Companion: storage unavailable on startup: ${describe(error)}`)
	})
})

chrome.commands.onCommand.addListener((command) => {
	switch (command) {
		case "open-snippet-manager":
			void chrome.runtime.openOptionsPage().catch((error: unknown) => {
				console.error(`DSA Practice Companion: could not open options: ${describe(error)}`)
			})
			break
		case "open-practice":
			void focusOrOpenPractice().catch((error: unknown) => {
				console.error(`DSA Practice Companion: could not open practice page: ${describe(error)}`)
			})
			break
		case "insert-snippet":
			void insertSnippet().then((result) => {
				if (!result.ok) console.warn(`DSA Practice Companion: insert failed - ${result.error}`)
			})
			break
		default:
			console.warn(`DSA Practice Companion: unknown command "${command}"`)
	}
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	// Only messages from this extension's own surfaces are accepted.
	if (sender.id !== undefined && sender.id !== chrome.runtime.id) return undefined
	if (!isExtensionMessage(message)) {
		sendResponse({ ok: false, error: "Unsupported or malformed message." })
		return undefined
	}

	switch (message.type) {
		case "ping":
			sendResponse({ ok: true, target: "background" })
			return undefined
		case "insert-snippet":
			void insertSnippet(message.snippetId).then(sendResponse)
			return true
		case "insert-into-practice":
			void deliver(message.payload)
				.then(sendResponse)
				.catch((error: unknown) => sendResponse({ ok: false, error: describe(error) }))
			return true
		case "open-practice":
			void focusOrOpenPractice()
				.then(() => sendResponse({ ok: true, target: "practice page" }))
				.catch((error: unknown) => sendResponse({ ok: false, error: describe(error) }))
			return true
		case "open-snippet-manager":
			void chrome.runtime
				.openOptionsPage()
				.then(() => sendResponse({ ok: true, target: "snippet manager" }))
				.catch((error: unknown) => sendResponse({ ok: false, error: describe(error) }))
			return true
		case "practice-ready":
			void claimPendingInsert()
				.then((payload) => sendResponse({ ok: true, payload }))
				.catch((error: unknown) => sendResponse({ ok: false, error: describe(error) }))
			return true
		default:
			sendResponse({ ok: false, error: "Unsupported message." })
			return undefined
	}
})
