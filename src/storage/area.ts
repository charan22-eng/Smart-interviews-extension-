import { STORAGE_KEY } from "../utils/constants.js"

/** Thrown for every storage failure so callers can show a real message. */
export class StorageError extends Error {
	readonly detail: unknown
	constructor(message: string, detail?: unknown) {
		super(message)
		this.name = "StorageError"
		this.detail = detail
	}
}

/** The slice of chrome.storage.local this project depends on. */
export interface StorageArea {
	get(keys: string[] | string | null): Promise<Record<string, unknown>>
	set(items: Record<string, unknown>): Promise<void>
	remove(keys: string[] | string): Promise<void>
}

/** In-memory implementation used by the automated tests. */
export function createMemoryArea(seed: Record<string, unknown> = {}): StorageArea {
	const data = new Map<string, unknown>(Object.entries(seed))
	const clone = (value: unknown): unknown =>
		value === undefined ? undefined : JSON.parse(JSON.stringify(value))
	return {
		async get(keys) {
			const names = keys === null ? [...data.keys()] : typeof keys === "string" ? [keys] : keys
			const out: Record<string, unknown> = {}
			for (const name of names) {
				if (data.has(name)) out[name] = clone(data.get(name))
			}
			return out
		},
		async set(items) {
			for (const [key, value] of Object.entries(items)) data.set(key, clone(value))
		},
		async remove(keys) {
			for (const key of typeof keys === "string" ? [keys] : keys) data.delete(key)
		},
	}
}

/** A storage area that always fails; used to test storage-failure handling. */
export function createFailingArea(message = "quota exceeded"): StorageArea {
	const boom = async (): Promise<never> => {
		throw new Error(message)
	}
	return { get: boom, set: boom, remove: boom }
}

let override: StorageArea | null = null

/** Test seam: inject a storage area (pass null to restore chrome.storage.local). */
export function setStorageArea(area: StorageArea | null): void {
	override = area
}

export function getStorageArea(): StorageArea {
	if (override) return override
	const runtime = globalThis as { chrome?: { storage?: { local?: StorageArea } } }
	const local = runtime.chrome?.storage?.local
	if (!local) {
		throw new StorageError(
			"Extension storage is unavailable in this context (chrome.storage.local missing).",
		)
	}
	return local
}

function describe(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

export async function readRaw(): Promise<unknown> {
	try {
		const result = await getStorageArea().get([STORAGE_KEY])
		return result[STORAGE_KEY]
	} catch (error) {
		throw new StorageError(`Could not read saved data: ${describe(error)}`, error)
	}
}

export async function writeRaw(value: unknown): Promise<void> {
	try {
		await getStorageArea().set({ [STORAGE_KEY]: value })
	} catch (error) {
		throw new StorageError(`Could not save data: ${describe(error)}`, error)
	}
}

export async function clearRaw(): Promise<void> {
	try {
		await getStorageArea().remove([STORAGE_KEY])
	} catch (error) {
		throw new StorageError(`Could not clear saved data: ${describe(error)}`, error)
	}
}
