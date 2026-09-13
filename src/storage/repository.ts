import type { Store } from "../types/models.js"
import { clearRaw, readRaw, writeRaw } from "./area.js"
import { defaultStore, normalizeStore } from "./schema.js"

/**
 * Every write goes through one promise chain.
 *
 * The popup, the options page, the practice page and the service worker can all
 * mutate the store at the same time. Read-modify-write without serialisation
 * loses updates (classic lost-update race); enqueueing makes each mutation
 * atomic with respect to the others in this context.
 */
let queue: Promise<unknown> = Promise.resolve()

function enqueue<T>(task: () => Promise<T>): Promise<T> {
	const run = (): Promise<T> => task()
	const next = queue.then(run, run)
	// Swallow rejection on the chain itself so one failure cannot poison the queue.
	queue = next.then(
		() => undefined,
		() => undefined,
	)
	return next
}

export interface LoadResult {
	store: Store
	repairs: string[]
}

async function loadInternal(): Promise<LoadResult> {
	const { store, repairs } = normalizeStore(await readRaw())
	if (repairs.length > 0) {
		// Persist the repaired shape so the same repairs are not reported forever.
		await writeRaw(store)
	}
	return { store, repairs }
}

export function loadStoreWithRepairs(): Promise<LoadResult> {
	return enqueue(loadInternal)
}

export function loadStore(): Promise<Store> {
	return enqueue(async () => (await loadInternal()).store)
}

/**
 * Atomically read, mutate and persist the store.
 * The mutator receives a normalised store and may return any value.
 */
export function mutateStore<T>(
	mutator: (store: Store) => T | Promise<T>,
): Promise<{ store: Store; result: T }> {
	return enqueue(async () => {
		const { store } = await loadInternal()
		const result = await mutator(store)
		await writeRaw(store)
		return { store, result }
	})
}

/** Replaces the whole store (used by import); input is normalised first. */
export function replaceStore(next: Store): Promise<Store> {
	return enqueue(async () => {
		const { store } = normalizeStore(next)
		await writeRaw(store)
		return store
	})
}

export function resetStore(): Promise<Store> {
	return enqueue(async () => {
		await clearRaw()
		const store = defaultStore()
		await writeRaw(store)
		return store
	})
}
