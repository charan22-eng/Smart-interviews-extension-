#!/usr/bin/env node
/**
 * Zero-dependency build script.
 *
 * 1. Cleans dist/
 * 2. Compiles src/ with the local TypeScript compiler
 * 3. Copies static assets (manifest, HTML, CSS, icons) into dist/
 * 4. Verifies that every file referenced by manifest.json exists in dist/
 * 5. Fails the build on unsafe patterns (innerHTML / eval / new Function)
 *
 * There is no bundler: the extension ships native ES modules, which Manifest V3
 * supports for both the service worker and extension pages.
 */
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

import { generateIcons } from "./make-icons.mjs"

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, "..")
const dist = path.join(root, "dist")
const cleanOnly = process.argv.includes("--clean")

function log(message) {
	process.stdout.write(`[build] ${message}\n`)
}

function fail(message) {
	process.stderr.write(`[build] ERROR ${message}\n`)
	process.exit(1)
}

function rmrf(target) {
	fs.rmSync(target, { recursive: true, force: true })
}

function copyFile(from, to) {
	fs.mkdirSync(path.dirname(to), { recursive: true })
	fs.copyFileSync(from, to)
}

/** Recursively copy every file matching the predicate. */
function copyTree(fromDir, toDir, predicate = () => true) {
	if (!fs.existsSync(fromDir)) return 0
	let count = 0
	for (const entry of fs.readdirSync(fromDir, { withFileTypes: true })) {
		const from = path.join(fromDir, entry.name)
		const to = path.join(toDir, entry.name)
		if (entry.isDirectory()) count += copyTree(from, to, predicate)
		else if (predicate(from)) {
			copyFile(from, to)
			count += 1
		}
	}
	return count
}

function resolveTsc() {
	const local = path.join(
		root,
		"node_modules",
		".bin",
		process.platform === "win32" ? "tsc.cmd" : "tsc",
	)
	if (fs.existsSync(local)) return { command: local, args: [] }
	// Fall back to a hoisted install (monorepo / sandbox) or npx.
	let dir = root
	for (let i = 0; i < 5; i += 1) {
		dir = path.dirname(dir)
		const candidate = path.join(dir, "node_modules", ".bin", "tsc")
		if (fs.existsSync(candidate)) return { command: candidate, args: [] }
	}
	return { command: process.platform === "win32" ? "npx.cmd" : "npx", args: ["tsc"] }
}

function compileTypeScript() {
	const { command, args } = resolveTsc()
	log(`compiling TypeScript via ${command} ${args.join(" ")}`.trim())
	const result = spawnSync(command, [...args, "--project", path.join(root, "tsconfig.json")], {
		stdio: "inherit",
		cwd: root,
	})
	if (result.error) fail(`could not run the TypeScript compiler: ${result.error.message}`)
	if (result.status !== 0) fail(`TypeScript compilation failed (exit ${result.status})`)
}

/** Every path referenced from manifest.json must exist in dist/. */
function verifyManifestReferences() {
	const manifestPath = path.join(dist, "manifest.json")
	const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
	const refs = new Set()
	const add = (value) => {
		if (typeof value === "string" && value.length > 0) refs.add(value)
	}

	add(manifest.background?.service_worker)
	add(manifest.action?.default_popup)
	add(manifest.options_page)
	for (const script of manifest.content_scripts ?? []) {
		for (const file of script.js ?? []) add(file)
		for (const file of script.css ?? []) add(file)
	}
	for (const page of manifest.sandbox?.pages ?? []) add(page)
	for (const icon of Object.values(manifest.icons ?? {})) add(icon)
	for (const resource of manifest.web_accessible_resources ?? []) {
		for (const file of resource.resources ?? []) {
			if (!file.includes("*")) add(file)
		}
	}

	const missing = [...refs].filter((ref) => !fs.existsSync(path.join(dist, ref)))
	if (missing.length > 0) fail(`manifest references missing files: ${missing.join(", ")}`)
	if (manifest.manifest_version !== 3) fail("manifest_version must be 3")
	log(`manifest OK (${refs.size} referenced files present)`)
}

/** Guard against the extension bundle regaining a security-sensitive pattern. */
function scanBundle() {
	const offenders = []
	const walk = (dir) => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name)
			if (entry.isDirectory()) {
				walk(full)
				continue
			}
			if (!/\.(js|html)$/.test(entry.name)) continue
			// practice/runner.* is the one deliberate, manifest-sandboxed evaluator.
			const relative = path.relative(dist, full).split(path.sep).join("/")
			if (relative.startsWith("practice/runner.")) continue
			const text = fs.readFileSync(full, "utf8")
			const patterns = [/\binnerHTML\b/, /\bouterHTML\b/, /insertAdjacentHTML/, /\beval\(/, /new Function\(/]
			for (const pattern of patterns) {
				if (pattern.test(text)) offenders.push(`${relative}: ${pattern.source}`)
			}
		}
	}
	walk(dist)
	if (offenders.length > 0) fail(`unsafe pattern found in build output:\n  ${offenders.join("\n  ")}`)
	log("static safety scan OK (no innerHTML / eval / new Function outside the sandbox)")
}

log(`cleaning ${path.relative(root, dist)}/`)
rmrf(dist)
if (cleanOnly) {
	log("clean complete")
	process.exit(0)
}

compileTypeScript()

copyFile(path.join(root, "manifest.json"), path.join(dist, "manifest.json"))
const staticCount = copyTree(path.join(root, "src"), dist, (file) => /\.(html|css|svg|png|json)$/.test(file))
log(`copied ${staticCount} static file(s) from src/`)
const icons = generateIcons()
log(`generated ${icons.length} icon(s): ${icons.join(", ")}`)
const iconCount = copyTree(path.join(root, "public", "icons"), path.join(dist, "assets"))
log(`copied ${iconCount} icon(s) into dist/assets/`)

verifyManifestReferences()
scanBundle()
log("build complete -> dist/")
