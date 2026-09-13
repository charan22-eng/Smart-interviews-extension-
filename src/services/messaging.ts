import type { InsertMode, Language } from "../types/models.js"
import { MAX_CODE_LENGTH, isLanguage } from "../utils/constants.js"
import { isPlainRecord } from "../storage/schema.js"

/**
 * The message contract between popup, background, content script and the
 * controlled practice page - plus validators for every hop.
 *
 * Two transports are used, deliberately kept separate:
 *  - chrome.runtime messaging for extension surfaces (popup, background,
 *    the bundled practice page, content script).
 *  - window.postMessage for a locally served copy of the practice page, where
 *    the content script is the only bridge and both the origin and a marker
 *    element on the page are checked first.
 */

/** Namespace tag carried by every window.postMessage payload. */
export const CHANNEL = "dsa-practice-companion"
export const PAGE_CHANNEL = "dsa-practice-page"
/** The practice page must declare this marker before any bridging happens. */
export const PRACTICE_MARKER = 'meta[name="dsa-practice-environment"]'

export type ExtensionMessage =
	| { type: "insert-snippet"; snippetId: string }
	| { type: "insert-into-practice"; payload: InsertPayload }
	| { type: "open-practice" }
	| { type: "open-snippet-manager" }
	| { type: "practice-ready" }
	| { type: "ping" }

export interface InsertPayload {
	snippetId: string
	title: string
	language: Language
	code: string
	mode: InsertMode
}

export interface InsertResult {
	ok: boolean
	error?: string
	/** Where the code ended up, for user-facing confirmation. */
	target?: string
}

export function isExtensionMessage(value: unknown): value is ExtensionMessage {
	if (!isPlainRecord(value) || typeof value.type !== "string") return false
	switch (value.type) {
		case "insert-snippet":
			return typeof value.snippetId === "string" && value.snippetId.length > 0
		case "insert-into-practice":
			return validateInsertPayload(value.payload).ok
		case "open-practice":
		case "open-snippet-manager":
		case "practice-ready":
		case "ping":
			return true
		default:
			return false
	}
}

export type PayloadCheck =
	| { ok: true; payload: InsertPayload }
	| { ok: false; error: string }

/** Structural validation of an insert payload. Used on every hop. */
export function validateInsertPayload(value: unknown): PayloadCheck {
	if (!isPlainRecord(value)) return { ok: false, error: "Insert payload must be an object." }
	if (typeof value.snippetId !== "string" || value.snippetId.trim() === "") {
		return { ok: false, error: "Insert payload is missing a snippet id." }
	}
	if (typeof value.code !== "string") {
		return { ok: false, error: "Insert payload code must be a string." }
	}
	if (value.code.length === 0) {
		return { ok: false, error: "This snippet has no code to insert." }
	}
	if (value.code.length > MAX_CODE_LENGTH) {
		return { ok: false, error: "This snippet is too large to insert." }
	}
	if (!isLanguage(value.language)) {
		return { ok: false, error: "Insert payload has an unsupported language." }
	}
	const mode: InsertMode = value.mode === "append" ? "append" : "replace"
	return {
		ok: true,
		payload: {
			snippetId: value.snippetId,
			title: typeof value.title === "string" ? value.title.slice(0, 200) : "Snippet",
			language: value.language,
			code: value.code,
			mode,
		},
	}
}

/** Envelope used for the content script -> local practice page hop. */
export interface PageEnvelope {
	channel: typeof CHANNEL
	type: "insert-code"
	payload: InsertPayload
}

export function buildPageEnvelope(payload: InsertPayload): PageEnvelope {
	return { channel: CHANNEL, type: "insert-code", payload }
}

export function isPageEnvelope(value: unknown): value is PageEnvelope {
	return (
		isPlainRecord(value) &&
		value.channel === CHANNEL &&
		value.type === "insert-code" &&
		validateInsertPayload(value.payload).ok
	)
}

/** Envelope used for the practice page -> content script acknowledgement. */
export interface PageAck {
	channel: typeof PAGE_CHANNEL
	type: "insert-result"
	result: InsertResult
}

export function buildPageAck(result: InsertResult): PageAck {
	return { channel: PAGE_CHANNEL, type: "insert-result", result }
}

export function isPageAck(value: unknown): value is PageAck {
	if (!isPlainRecord(value) || value.channel !== PAGE_CHANNEL || value.type !== "insert-result") {
		return false
	}
	return isPlainRecord(value.result) && typeof value.result.ok === "boolean"
}

/** Only http://localhost and http://127.0.0.1 are ever bridged. */
export function isAllowedLocalOrigin(origin: string): boolean {
	try {
		const url = new URL(origin)
		return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")
	} catch {
		return false
	}
}
