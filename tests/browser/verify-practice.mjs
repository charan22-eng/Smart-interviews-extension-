/**
 * Browser verification for the controlled practice environment.
 *
 * This is not part of `npm test`: it needs a real browser, so it is run on
 * demand. It drives the built practice page with Playwright and the system
 * Chromium, and checks the things unit tests cannot: that modules execute,
 * that the sandboxed runner really runs code, that controlled insertion lands
 * in the editor, that malformed or foreign messages are ignored, and that a
 * runaway loop does not freeze the tab.
 *
 * Usage:
 *   npm run build
 *   (cd dist && python3 -m http.server 8123) &
 *   CHROMIUM_PATH=$(command -v chromium) node tests/browser/verify-practice.mjs
 *
 * Serving dist/ over http://127.0.0.1 exercises the same page the extension
 * ships, but without the chrome.* APIs, so timer/history controls are expected
 * to be disabled and the page shows its "local copy" notice. Popup, options,
 * keyboard shortcuts, storage persistence and the real content script cannot be
 * checked this way; those need the unpacked extension loaded in Chrome.
 */
import { chromium } from "playwright"

const BASE = process.env.PRACTICE_URL ?? "http://127.0.0.1:8123/practice/index.html"
const results = []
const record = (name, passed, detail = "") => {
	results.push({ name, passed, detail })
	console.log(`${passed ? "PASS" : "FAIL"} | ${name}${detail ? ` | ${detail}` : ""}`)
}

const browser = await chromium.launch({
	executablePath: process.env.CHROMIUM_PATH,
	headless: true,
	args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
})
const page = await browser.newPage()
const consoleErrors = []
page.on("console", (msg) => {
	const text = msg.text()
	// The throwaway static server has no favicon; extension pages never request one.
	if (msg.type() === "error" && !text.includes("favicon.ico")) consoleErrors.push(text)
})
page.on("pageerror", (error) => consoleErrors.push(String(error)))

await page.goto(BASE, { waitUntil: "load", timeout: 30000 })
await page.waitForTimeout(1200)

// Problem rendering
const problemCount = await page.locator("#problem-select option").count()
record("practice page lists all 8 problems", problemCount === 8, `options=${problemCount}`)
record(
	"problem metadata rendered",
	(await page.locator("#problem-title").innerText()).length > 0 &&
		(await page.locator("#problem-cases li").count()) > 0,
	`title="${await page.locator("#problem-title").innerText()}"`,
)

// Editor: starter code, gutter, highlighting
const starter = await page.locator("#editor").inputValue()
const gutterLines = await page.locator("#gutter .editor__line").count()
const tokenSpans = await page.locator("#highlight-code .tok").count()
record("starter code loaded into editor", starter.trim().length > 0 && /twoSum|two_sum/.test(starter))
record("line numbers match code lines", gutterLines === starter.split("\n").length, `gutter=${gutterLines}`)
record("syntax highlighting produced tokens", tokenSpans > 0, `tokens=${tokenSpans}`)

// Per-language starter code
await page.selectOption("#language-select", "python")
await page.waitForTimeout(300)
record(
	"language switch loads that language's starter code",
	(await page.locator("#editor").inputValue()).includes("def "),
)
await page.selectOption("#language-select", "javascript")
await page.waitForTimeout(300)

// Sandboxed runner: correct solution
const correct =
	"function twoSum(nums, target) {\n\tconst seen = new Map()\n\tfor (let i = 0; i < nums.length; i += 1) {\n\t\tconst need = target - nums[i]\n\t\tif (seen.has(need)) return [seen.get(need), i]\n\t\tseen.set(nums[i], i)\n\t}\n\treturn []\n}\n"
await page.fill("#editor", correct)
await page.click("#test")
await page.waitForSelector("#output .output__summary", { timeout: 20000 })
const summary = await page.locator("#output .output__summary").innerText()
record("sandboxed runner ran all test cases and passed", /passed/.test(summary) && !/^Tests: 0/.test(summary), summary)

// Wrong solution
await page.fill("#editor", "function twoSum() { return [9, 9] }\n")
await page.click("#test")
await page.waitForTimeout(1500)
record(
	"wrong solution reports failing cases",
	(await page.locator("#output .output__case--fail").count()) > 0,
	await page.locator("#output .output__summary").innerText(),
)

// Thrown error
await page.fill("#editor", "function twoSum() { throw new Error('boom') }\n")
await page.click("#test")
await page.waitForTimeout(1500)
record("runtime error surfaced without breaking the page", /boom|error/i.test(await page.locator("#output").innerText()))

// Controlled insertion, as the content script sends it
const insertOutcome = await page.evaluate(async () => {
	const acks = []
	const listener = (event) => {
		if (event.data && event.data.channel === "dsa-practice-page") acks.push(event.data.result)
	}
	window.addEventListener("message", listener)
	window.postMessage(
		{
			channel: "dsa-practice-companion",
			type: "insert-code",
			payload: {
				snippetId: "snip_browser_check",
				title: "My Saved Two Sum",
				language: "javascript",
				code: "// inserted by the verification run\nfunction twoSum() { return [0, 1] }\n",
				mode: "replace",
			},
		},
		window.location.origin,
	)
	await new Promise((resolve) => setTimeout(resolve, 600))
	window.removeEventListener("message", listener)
	return { acks, editor: document.querySelector("#editor").value }
})
record(
	"valid insert lands in the editor and is acknowledged",
	insertOutcome.editor.includes("inserted by the verification run") &&
		insertOutcome.acks.some((ack) => ack && ack.ok === true),
	`ack=${JSON.stringify(insertOutcome.acks[0])}`,
)

// Append mode keeps existing work
const appended = await page.evaluate(async () => {
	window.postMessage(
		{
			channel: "dsa-practice-companion",
			type: "insert-code",
			payload: {
				snippetId: "snip_append",
				title: "Helper",
				language: "javascript",
				code: "function helper() {}\n",
				mode: "append",
			},
		},
		window.location.origin,
	)
	await new Promise((resolve) => setTimeout(resolve, 600))
	return document.querySelector("#editor").value
})
record(
	"append mode preserves existing editor contents",
	appended.includes("inserted by the verification run") && appended.includes("function helper"),
)

// Unsupported mode must not wipe the editor
const rejected = await page.evaluate(async () => {
	const before = document.querySelector("#editor").value
	window.postMessage(
		{
			channel: "dsa-practice-companion",
			type: "insert-code",
			payload: {
				snippetId: "snip_bad",
				title: "Bad",
				language: "javascript",
				code: "x",
				mode: "overwrite-everything",
			},
		},
		window.location.origin,
	)
	await new Promise((resolve) => setTimeout(resolve, 500))
	return { before, after: document.querySelector("#editor").value }
})
record("unsupported insert mode is ignored and the editor is untouched", rejected.before === rejected.after)

// Foreign channel must be ignored
const foreignIgnored = await page.evaluate(async () => {
	const before = document.querySelector("#editor").value
	window.postMessage(
		{ channel: "some-other-extension", type: "insert-code", payload: { code: "not mine" } },
		window.location.origin,
	)
	await new Promise((resolve) => setTimeout(resolve, 400))
	return before === document.querySelector("#editor").value
})
record("messages from another channel are ignored", foreignIgnored === true)

// Toolbar
await page.click("#reset")
await page.waitForTimeout(300)
const afterReset = await page.locator("#editor").inputValue()
record("reset restores starter code", afterReset.includes("function twoSum") && !afterReset.includes("helper"))
await page.click("#clear-code")
await page.waitForTimeout(300)
record("clear empties the editor", (await page.locator("#editor").inputValue()) === "")
await page.click("#run")
await page.waitForTimeout(600)
record(
	"running an empty editor shows a helpful message instead of executing",
	/empty/i.test(await page.locator("#output").innerText()),
)

// Honest degradation outside the extension
record(
	"local copy explains that timer/history need the extension page",
	(await page.locator("#page-notice").isVisible()) && (await page.locator("#mark-solved").isDisabled()),
)

// Languages the bundled runner cannot execute
await page.selectOption("#language-select", "cpp")
await page.fill("#editor", "int main(){}")
await page.click("#run")
await page.waitForTimeout(500)
record(
	"non-JavaScript languages explain the run limitation",
	/JavaScript only/i.test(await page.locator("#output").innerText()),
)

// Runaway loop: must be terminated, and must not freeze the tab
await page.selectOption("#language-select", "javascript")
await page.fill("#editor", "function twoSum() { while (true) {} }\n")
await page.click("#test")
const loopStart = Date.now()
let loopHandled = false
let loopDetail = "no timeout message within 15s - the renderer thread appears blocked by the loop"
try {
	await page.waitForSelector("#output .output__error", { timeout: 15000 })
	const loopText = await page.locator("#output .output__error").innerText()
	loopHandled = /did not finish/i.test(loopText)
	loopDetail = `${Math.round((Date.now() - loopStart) / 1000)}s: ${loopText.slice(0, 80)}`
} catch {}
record("infinite loop is abandoned after the run timeout", loopHandled, loopDetail)

let responsive = false
try {
	responsive = await Promise.race([
		page.evaluate(() => document.readyState === "complete"),
		new Promise((resolve) => setTimeout(() => resolve("timeout"), 5000)),
	])
} catch {}
record(
	"page stays responsive during a runaway loop",
	responsive === true,
	responsive === true ? "" : "the page did not answer an evaluate() call",
)

let recovered = "page unresponsive"
try {
	await page.fill("#editor", "function twoSum() { return [0, 1] }\n", { timeout: 8000 })
	await page.click("#run", { timeout: 8000 })
	await page.waitForTimeout(2500)
	recovered = await page.locator("#output").innerText()
} catch {}
record("page recovers and can run again afterwards", /passed/i.test(recovered), recovered.split("\n")[0].slice(0, 60))

record("no uncaught console errors during the run", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "))

try {
	await page.close()
} catch {}
try {
	await browser.close()
} catch {}

const failed = results.filter((result) => !result.passed)
console.log(`\nBROWSER CHECKS: ${results.length - failed.length}/${results.length} passed`)
if (failed.length > 0) console.log(`FAILED: ${failed.map((result) => result.name).join("; ")}`)
process.exit(failed.length === 0 ? 0 : 1)
