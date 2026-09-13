#!/usr/bin/env node
/**
 * Generates the extension PNG icons with zero dependencies.
 *
 * Chrome requires bitmap icons (SVG is not accepted in `manifest.icons`), but
 * committing binaries to the repository is undesirable. So the icons are
 * generated at build time by a tiny PNG encoder built on node:zlib.
 */
import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import zlib from "node:zlib"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(here, "..", "public", "icons")
const SIZES = [16, 48, 128]

const BG = [17, 24, 39, 255]
const ACCENT = [96, 200, 255, 255]
const HIGHLIGHT = [250, 204, 21, 255]

const crcTable = (() => {
	const table = new Int32Array(256)
	for (let n = 0; n < 256; n += 1) {
		let c = n
		for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
		table[n] = c
	}
	return table
})()

function crc32(buffer) {
	let c = 0xffffffff
	for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
	return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
	const length = Buffer.alloc(4)
	length.writeUInt32BE(data.length, 0)
	const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data])
	const crc = Buffer.alloc(4)
	crc.writeUInt32BE(crc32(typeAndData), 0)
	return Buffer.concat([length, typeAndData, crc])
}

function encodePng(size, pixels) {
	const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
	const ihdr = Buffer.alloc(13)
	ihdr.writeUInt32BE(size, 0)
	ihdr.writeUInt32BE(size, 4)
	ihdr[8] = 8 // bit depth
	ihdr[9] = 6 // RGBA
	ihdr[10] = 0
	ihdr[11] = 0
	ihdr[12] = 0
	const stride = size * 4
	const raw = Buffer.alloc((stride + 1) * size)
	for (let y = 0; y < size; y += 1) {
		raw[y * (stride + 1)] = 0 // filter: none
		pixels.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
	}
	return Buffer.concat([
		signature,
		chunk("IHDR", ihdr),
		chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
		chunk("IEND", Buffer.alloc(0)),
	])
}

function createCanvas(size) {
	const pixels = Buffer.alloc(size * size * 4, 0)
	const set = (x, y, color, alpha = 1) => {
		const px = Math.round(x)
		const py = Math.round(y)
		if (px < 0 || py < 0 || px >= size || py >= size) return
		const offset = (py * size + px) * 4
		const srcAlpha = (color[3] / 255) * alpha
		for (let i = 0; i < 3; i += 1) {
			const dst = pixels[offset + i]
			pixels[offset + i] = Math.round(color[i] * srcAlpha + dst * (1 - srcAlpha))
		}
		pixels[offset + 3] = Math.max(pixels[offset + 3], Math.round(srcAlpha * 255))
	}
	const line = (x0, y0, x1, y1, color, thickness) => {
		const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 3) + 1
		const half = thickness / 2
		for (let step = 0; step <= steps; step += 1) {
			const t = step / steps
			const cx = x0 + (x1 - x0) * t
			const cy = y0 + (y1 - y0) * t
			for (let dx = -half; dx <= half; dx += 0.5) {
				for (let dy = -half; dy <= half; dy += 0.5) {
					if (Math.hypot(dx, dy) <= half) set(cx + dx, cy + dy, color)
				}
			}
		}
	}
	const roundedRect = (radius, color) => {
		for (let y = 0; y < size; y += 1) {
			for (let x = 0; x < size; x += 1) {
				const cx = Math.min(Math.max(x, radius), size - 1 - radius)
				const cy = Math.min(Math.max(y, radius), size - 1 - radius)
				if (Math.hypot(x - cx, y - cy) <= radius + 0.4) set(x, y, color)
			}
		}
	}
	return { pixels, line, roundedRect }
}

function drawIcon(size) {
	const canvas = createCanvas(size)
	canvas.roundedRect(Math.max(2, Math.round(size * 0.18)), BG)
	const mid = (size - 1) / 2
	const thickness = Math.max(1, size * 0.085)
	const inset = size * 0.24
	const reach = size * 0.11
	const rise = size * 0.15
	// "<"
	canvas.line(inset + reach, mid - rise, inset, mid, ACCENT, thickness)
	canvas.line(inset, mid, inset + reach, mid + rise, ACCENT, thickness)
	// ">"
	canvas.line(size - 1 - inset - reach, mid - rise, size - 1 - inset, mid, ACCENT, thickness)
	canvas.line(size - 1 - inset, mid, size - 1 - inset - reach, mid + rise, ACCENT, thickness)
	// "/"
	canvas.line(mid + size * 0.07, mid - size * 0.2, mid - size * 0.07, mid + size * 0.2, HIGHLIGHT, thickness)
	return encodePng(size, canvas.pixels)
}

export function generateIcons() {
	fs.mkdirSync(outDir, { recursive: true })
	const written = []
	for (const size of SIZES) {
		const file = path.join(outDir, `icon-${size}.png`)
		fs.writeFileSync(file, drawIcon(size))
		written.push(path.basename(file))
	}
	return written
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const written = generateIcons()
	process.stdout.write(`[icons] generated ${written.join(", ")}\n`)
}
