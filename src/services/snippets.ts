import type { Snippet, SnippetInput } from "../types/models.js"
import { MAX_SNIPPETS } from "../utils/constants.js"
import { createId } from "../utils/id.js"
import { nowIso } from "../utils/time.js"
import { loadStore, mutateStore } from "../storage/repository.js"
import { normalizeSnippet } from "../storage/schema.js"

/** Snippet service: CRUD, duplicate, favourite, and selection. */

export class SnippetError extends Error {
	constructor(message: string) {
		super(message)
		this.name = "SnippetError"
	}
}

/** Pure factory, shared by the UI and the tests. */
export function buildSnippet(input: SnippetInput, at: number = Date.now()): Snippet {
	const timestamp = nowIso(at)
	const { snippet, issues } = normalizeSnippet({ ...input, createdAt: timestamp, updatedAt: timestamp })
	if (!snippet) {
		throw new SnippetError(issues[0] ?? "A snippet needs a title.")
	}
	snippet.id = createId("snip")
	return snippet
}

/** Pure patch application, so update semantics are directly testable. */
export function applyPatch(
	snippet: Snippet,
	patch: Partial<SnippetInput>,
	at: number = Date.now(),
): Snippet {
	const merged = { ...snippet, ...patch, id: snippet.id, createdAt: snippet.createdAt }
	const { snippet: normalized, issues } = normalizeSnippet(merged)
	if (!normalized) throw new SnippetError(issues[0] ?? "Invalid snippet update.")
	normalized.updatedAt = nowIso(at)
	return normalized
}

/** Pure duplicate: new id, " (copy)" title, fresh timestamps, never favourited. */
export function buildDuplicate(snippet: Snippet, at: number = Date.now()): Snippet {
	const timestamp = nowIso(at)
	return {
		...snippet,
		id: createId("snip"),
		title: `${snippet.title} (copy)`.slice(0, 200),
		favorite: false,
		tags: [...snippet.tags],
		createdAt: timestamp,
		updatedAt: timestamp,
	}
}

export async function listSnippets(): Promise<Snippet[]> {
	return (await loadStore()).snippets
}

export async function getSnippet(id: string): Promise<Snippet | null> {
	const store = await loadStore()
	return store.snippets.find((snippet) => snippet.id === id) ?? null
}

export async function createSnippet(input: SnippetInput): Promise<Snippet> {
	const { result } = await mutateStore((store) => {
		if (store.snippets.length >= MAX_SNIPPETS) {
			throw new SnippetError(`Snippet limit reached (${MAX_SNIPPETS}).`)
		}
		const snippet = buildSnippet(input)
		store.snippets.push(snippet)
		return snippet
	})
	return result
}

export async function updateSnippet(id: string, patch: Partial<SnippetInput>): Promise<Snippet> {
	const { result } = await mutateStore((store) => {
		const index = store.snippets.findIndex((snippet) => snippet.id === id)
		const existing = store.snippets[index]
		if (index === -1 || !existing) throw new SnippetError("That snippet no longer exists.")
		const updated = applyPatch(existing, patch)
		store.snippets[index] = updated
		return updated
	})
	return result
}

export async function deleteSnippet(id: string): Promise<void> {
	await mutateStore((store) => {
		const index = store.snippets.findIndex((snippet) => snippet.id === id)
		if (index === -1) throw new SnippetError("That snippet no longer exists.")
		store.snippets.splice(index, 1)
		if (store.selectedSnippetId === id) store.selectedSnippetId = null
		if (store.pendingInsert?.snippetId === id) store.pendingInsert = null
	})
}

export async function duplicateSnippet(id: string): Promise<Snippet> {
	const { result } = await mutateStore((store) => {
		const index = store.snippets.findIndex((snippet) => snippet.id === id)
		const existing = store.snippets[index]
		if (!existing) throw new SnippetError("That snippet no longer exists.")
		const copy = buildDuplicate(existing)
		store.snippets.splice(index + 1, 0, copy)
		return copy
	})
	return result
}

export async function setFavorite(id: string, favorite: boolean): Promise<Snippet> {
	return updateSnippet(id, { favorite })
}

export async function toggleFavorite(id: string): Promise<Snippet> {
	const { result } = await mutateStore((store) => {
		const index = store.snippets.findIndex((snippet) => snippet.id === id)
		const existing = store.snippets[index]
		if (!existing) throw new SnippetError("That snippet no longer exists.")
		const updated = applyPatch(existing, { favorite: !existing.favorite })
		store.snippets[index] = updated
		return updated
	})
	return result
}

export async function selectSnippet(id: string | null): Promise<void> {
	await mutateStore((store) => {
		if (id !== null && !store.snippets.some((snippet) => snippet.id === id)) {
			throw new SnippetError("That snippet no longer exists.")
		}
		store.selectedSnippetId = id
	})
}

export async function getSelectedSnippet(): Promise<Snippet | null> {
	const store = await loadStore()
	if (!store.selectedSnippetId) return null
	return store.snippets.find((snippet) => snippet.id === store.selectedSnippetId) ?? null
}
