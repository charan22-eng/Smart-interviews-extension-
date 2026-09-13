export function nowIso(epochMs: number = Date.now()): string {
	return new Date(epochMs).toISOString()
}

/** Formats a duration as H:MM:SS, or M:SS under one hour. */
export function formatDuration(ms: number): string {
	const totalSeconds = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0
	const hours = Math.floor(totalSeconds / 3600)
	const minutes = Math.floor((totalSeconds % 3600) / 60)
	const seconds = totalSeconds % 60
	const pad = (n: number): string => String(n).padStart(2, "0")
	return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}

/** Human summary for the statistics dashboard, e.g. "3h 12m". */
export function formatTotalTime(ms: number): string {
	const totalMinutes = Math.floor((Number.isFinite(ms) && ms > 0 ? ms : 0) / 60000)
	const hours = Math.floor(totalMinutes / 60)
	const minutes = totalMinutes % 60
	return hours === 0 ? `${minutes}m` : `${hours}h ${minutes}m`
}

export function formatDateTime(iso: string): string {
	const date = new Date(iso)
	if (Number.isNaN(date.getTime())) return "\u2014"
	return date.toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	})
}

export function isValidIsoDate(value: unknown): value is string {
	return typeof value === "string" && !Number.isNaN(new Date(value).getTime())
}
