/**
 * Minimal ambient declarations for the subset of the Chrome extension API this
 * project uses. Declared locally so the build has zero external dependencies
 * (no @types/chrome download required).
 */

interface ChromeStorageArea {
	get(keys: string[] | string | null): Promise<Record<string, unknown>>
	set(items: Record<string, unknown>): Promise<void>
	remove(keys: string[] | string): Promise<void>
	clear(): Promise<void>
}

interface ChromeTab {
	id?: number
	url?: string
	active?: boolean
	windowId?: number
}

interface ChromeEvent<T extends (...args: never[]) => unknown> {
	addListener(cb: T): void
	removeListener(cb: T): void
	hasListener(cb: T): boolean
}

interface ChromeMessageSender {
	id?: string
	url?: string
	tab?: ChromeTab
	origin?: string
}

interface ChromeNamespace {
	storage: {
		local: ChromeStorageArea
		session?: ChromeStorageArea
		onChanged: ChromeEvent<
			(changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, areaName: string) => void
		>
	}
	runtime: {
		id: string
		lastError?: { message?: string }
		getURL(path: string): string
		sendMessage(message: unknown): Promise<unknown>
		openOptionsPage(): Promise<void>
		onMessage: ChromeEvent<
			(
				message: unknown,
				sender: ChromeMessageSender,
				sendResponse: (response: unknown) => void,
			) => boolean | undefined | void
		>
		onInstalled: ChromeEvent<(details: { reason: string; previousVersion?: string }) => void>
		onStartup: ChromeEvent<() => void>
	}
	tabs: {
		query(info: { url?: string | string[]; active?: boolean; currentWindow?: boolean }): Promise<ChromeTab[]>
		create(info: { url: string; active?: boolean }): Promise<ChromeTab>
		update(tabId: number, info: { active?: boolean }): Promise<ChromeTab>
		sendMessage(tabId: number, message: unknown): Promise<unknown>
	}
	commands: {
		onCommand: ChromeEvent<(command: string, tab?: ChromeTab) => void>
	}
	windows?: {
		update(windowId: number, info: { focused?: boolean }): Promise<unknown>
	}
}

declare const chrome: ChromeNamespace
