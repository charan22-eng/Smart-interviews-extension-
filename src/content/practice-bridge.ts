/**
 * Content script: bridge between the extension and a *locally served* copy of
 * the controlled practice page (http://localhost or http://127.0.0.1 only, per
 * the manifest's host_permissions).
 *
 * Deliberate limits, so this can never act as an assessment-platform bypass:
 *  - it is injected only on localhost / 127.0.0.1;
 *  - it stays completely inert unless the page declares the practice marker
 *    <meta name="dsa-practice-environment">;
 *  - it accepts insert requests only from this extension's own background
 *    worker, and only after full payload validation;
 *  - it never reads page content, never watches keystrokes, and never posts
 *    anything to a remote origin.
 *
 * When the practice page is opened as a bundled extension page, this script is
 * not involved at all: that page talks to the background worker directly.
 */

import {
	buildPageEnvelope,
	isAllowedLocalOrigin,
	isExtensionMessage,
	isPageAck,
	validateInsertPayload,
	type InsertPayload,
	type InsertResult,
	PRACTICE_MARKER,
} from "../services/messaging.js"

/** How long to wait for the page to confirm an insert before giving up. */
const ACK_TIMEOUT_MS = 4000

function isPracticePage(): boolean {
	return document.querySelector(PRACTICE_MARKER) !== null
}

/** Resolvers for inserts awaiting a page acknowledgement, in FIFO order. */
const awaitingAck: Array<(result: InsertResult) => void> = []
let pageListenerAttached = false

function attachPageListener(): void {
	if (pageListenerAttached) return
	pageListenerAttached = true
	// A single listener for the lifetime of the page: no duplicate listeners.
	window.addEventListener("message", (event: MessageEvent<unknown>) => {
		if (event.source !== window) return
		if (event.origin !== window.location.origin) return
		if (!isPageAck(event.data)) return
		const resolve = awaitingAck.shift()
		if (resolve) resolve(event.data.result)
	})
}

function forwardToPage(payload: InsertPayload): Promise<InsertResult> {
	attachPageListener()
	return new Promise<InsertResult>((resolve) => {
		let timeout: ReturnType<typeof setTimeout> | undefined
		let settled = false
		const settle = (result: InsertResult): void => {
			if (settled) return
			settled = true
			if (timeout !== undefined) clearTimeout(timeout)
			const index = awaitingAck.indexOf(settle)
			if (index !== -1) awaitingAck.splice(index, 1)
			resolve(result)
		}
		awaitingAck.push(settle)
		timeout = setTimeout(() => {
			settle({
				ok: false,
				error: "The practice page did not respond. Reload the page and try again.",
			})
		}, ACK_TIMEOUT_MS)
		try {
			// Same-origin only: the target origin is this page's own origin.
			window.postMessage(buildPageEnvelope(payload), window.location.origin)
		} catch (error) {
			settle({
				ok: false,
				error: `Could not reach the practice editor: ${
					error instanceof Error ? error.message : String(error)
				}`,
			})
		}
	})
}

function install(): void {
	chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
		// Accept only this extension's own messages.
		if (sender.id !== undefined && sender.id !== chrome.runtime.id) return undefined
		if (!isExtensionMessage(message)) {
			sendResponse({ ok: false, error: "Malformed message ignored by the practice bridge." })
			return undefined
		}
		if (message.type === "ping") {
			sendResponse({ ok: true, target: "practice bridge" })
			return undefined
		}
		if (message.type !== "insert-into-practice") {
			sendResponse({ ok: false, error: "The practice bridge only handles code inserts." })
			return undefined
		}
		const check = validateInsertPayload(message.payload)
		if (!check.ok) {
			sendResponse({ ok: false, error: check.error })
			return undefined
		}
		if (!isPracticePage()) {
			sendResponse({ ok: false, error: "This page is not the controlled practice environment." })
			return undefined
		}
		void forwardToPage(check.payload).then(sendResponse)
		return true
	})
}

if (isAllowedLocalOrigin(window.location.origin) && isPracticePage()) {
	install()
}
