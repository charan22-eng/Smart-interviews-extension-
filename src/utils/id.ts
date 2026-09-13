/** Collision-resistant id generation that works in the service worker,
 * extension pages, and plain Node (used by the automated tests). */
export function createId(prefix = "id"): string {
	const globalCrypto = (globalThis as { crypto?: Crypto }).crypto
	if (globalCrypto && typeof globalCrypto.randomUUID === "function") {
		return `${prefix}_${globalCrypto.randomUUID()}`
	}
	if (globalCrypto && typeof globalCrypto.getRandomValues === "function") {
		const bytes = new Uint8Array(16)
		globalCrypto.getRandomValues(bytes)
		let out = ""
		for (const byte of bytes) out += byte.toString(16).padStart(2, "0")
		return `${prefix}_${out}`
	}
	return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}
