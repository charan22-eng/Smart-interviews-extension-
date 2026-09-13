/**
 * Safe DOM helpers. The entire UI is built with createElement + textContent.
 * innerHTML / outerHTML / insertAdjacentHTML are never used anywhere in this
 * project, so snippet titles, code, notes, tags and imported data can never be
 * interpreted as markup or script.
 */

type Attrs = Record<string, string | number | boolean | undefined>

export function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	attrs: Attrs = {},
	children: Array<Node | string> | string = [],
): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag)
	for (const [key, value] of Object.entries(attrs)) {
		if (value === undefined || value === false) continue
		if (key === "class") node.className = String(value)
		else if (key === "text") node.textContent = String(value)
		else if (key === "value" && (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement)) {
			node.value = String(value)
		} else if (value === true) node.setAttribute(key, "")
		else node.setAttribute(key, String(value))
	}
	const list = typeof children === "string" ? [children] : children
	for (const child of list) {
		node.appendChild(typeof child === "string" ? document.createTextNode(child) : child)
	}
	return node
}

export function clear(node: Element): void {
	while (node.firstChild) node.removeChild(node.firstChild)
}

export function query<T extends Element>(selector: string, root: ParentNode = document): T {
	const found = root.querySelector<T>(selector)
	if (!found) throw new Error(`Missing required element: ${selector}`)
	return found
}

export function optionalQuery<T extends Element>(
	selector: string,
	root: ParentNode = document,
): T | null {
	return root.querySelector<T>(selector)
}

export function fillSelect(
	select: HTMLSelectElement,
	options: Array<{ value: string; label: string }>,
	selected?: string,
): void {
	clear(select)
	for (const option of options) {
		const node = el("option", { value: option.value, text: option.label })
		if (selected !== undefined && option.value === selected) node.selected = true
		select.appendChild(node)
	}
}

export type ToastKind = "success" | "error" | "info"

/** Accessible toast notifications rendered into a polite live region. */
export function createToaster(host: HTMLElement): (message: string, kind?: ToastKind) => void {
	host.setAttribute("role", "status")
	host.setAttribute("aria-live", "polite")
	let timer: ReturnType<typeof setTimeout> | null = null
	return function toast(message: string, kind: ToastKind = "info"): void {
		clear(host)
		host.appendChild(el("div", { class: `toast toast--${kind}`, text: message }))
		if (timer !== null) clearTimeout(timer)
		timer = setTimeout(() => clear(host), kind === "error" ? 6000 : 3200)
	}
}

/** Promise-based confirmation dialog built on native <dialog>. */
export function confirmDialog(message: string, confirmLabel = "Delete"): Promise<boolean> {
	return new Promise((resolve) => {
		const dialog = el("dialog", { class: "confirm" })
		const cancel = el("button", { class: "btn", type: "button", text: "Cancel" })
		const confirm = el("button", { class: "btn btn--danger", type: "button", text: confirmLabel })
		dialog.appendChild(el("p", { class: "confirm__text", text: message }))
		dialog.appendChild(el("div", { class: "confirm__actions" }, [cancel, confirm]))
		const finish = (value: boolean): void => {
			dialog.close()
			dialog.remove()
			resolve(value)
		}
		cancel.addEventListener("click", () => finish(false))
		confirm.addEventListener("click", () => finish(true))
		dialog.addEventListener("cancel", (event) => {
			event.preventDefault()
			finish(false)
		})
		document.body.appendChild(dialog)
		dialog.showModal()
		confirm.focus()
	})
}

/** Copies text to the clipboard, surfacing failures instead of swallowing them. */
export async function copyText(text: string): Promise<void> {
	if (typeof text !== "string" || text.length === 0) {
		throw new Error("Nothing to copy: this snippet has no code.")
	}
	const clip = navigator.clipboard
	if (!clip || typeof clip.writeText !== "function") {
		throw new Error("Clipboard API unavailable in this context.")
	}
	try {
		await clip.writeText(text)
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error)
		throw new Error(`Clipboard write was blocked: ${reason}`)
	}
}

export function applyTheme(preference: "system" | "light" | "dark"): void {
	const root = document.documentElement
	if (preference === "system") root.removeAttribute("data-theme")
	else root.setAttribute("data-theme", preference)
}
