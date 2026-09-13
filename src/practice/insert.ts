/**
 * Pure insertion logic for the controlled practice editor.
 *
 * The DOM work stays in practice.ts; everything that decides *what* the editor
 * should contain after an insert lives here so it can be unit tested without a
 * browser. Every insert - from the popup, the options page or the local content
 * script - goes through `planInsert`, so validation happens in exactly one
 * place.
 */

import { validateInsertPayload, type InsertPayload } from "../services/messaging.js"
import type { Language } from "../types/models.js"

export type InsertPlan =
	| {
			ok: true
			payload: InsertPayload
			/** Exact text the editor should hold after the insert. */
			nextCode: string
			/** True when the editor's language selector has to follow the snippet. */
			languageChanged: boolean
	  }
	| { ok: false; error: string }

/**
 * Combines the editor's current text with an incoming snippet.
 *
 * - "replace" always wins: the editor ends up holding only the snippet.
 * - "append" keeps existing work and separates the two blocks with a blank
 *   line, without doubling a newline the user already typed.
 * - Appending into an empty (or whitespace-only) editor behaves like replace,
 *   so the user never gets a leading blank block.
 */
export function composeCode(currentCode: string, payload: InsertPayload): string {
	if (payload.mode !== "append") return payload.code
	if (currentCode.trim() === "") return payload.code
	const separator = currentCode.endsWith("\n") ? "\n" : "\n\n"
	return currentCode + separator + payload.code
}

/** Validates an untrusted payload and works out the resulting editor state. */
export function planInsert(
	rawPayload: unknown,
	currentCode: string,
	currentLanguage: Language,
): InsertPlan {
	const check = validateInsertPayload(rawPayload)
	if (!check.ok) return { ok: false, error: check.error }
	const payload = check.payload
	return {
		ok: true,
		payload,
		nextCode: composeCode(currentCode, payload),
		languageChanged: payload.language !== currentLanguage,
	}
}

/** Message shown in the output panel after a successful insert. */
export function describeInsert(payload: InsertPayload, languageLabel: string): string {
	return `Inserted "${payload.title}" (${languageLabel}, ${payload.mode}). Press Run or Test when you are ready.`
}
