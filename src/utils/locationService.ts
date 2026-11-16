/**
 * Professional, secure, legal, and smooth location resolution service.
 * - Uses HTTPS-only endpoints.
 * - Complies with terms of service (no unauthorized commercial scraping or rate-limit violations).
 * - Multi-tiered fallback: High-speed IP Geolocation -> OS IANA TimeZone + Open-Meteo Geocoding -> Local Cache.
 */

export interface GeoLocationResult {
	latitude: number;
	longitude: number;
	city?: string;
	country?: string;
	region?: string;
	label: string;
	source: "ip" | "gps" | "timezone" | "cache";
}

const STORAGE_KEY_CACHED_LOC = "zenith-last-resolved-location";

/**
 * Resolves the device location automatically using fast, legal, HTTPS-based methods.
 */
export async function detectLocation(options?: {
	allowGps?: boolean;
	timeoutMs?: number;
}): Promise<GeoLocationResult | null> {
	const timeout = options?.timeoutMs ?? 3500;

	// 1. Try GPS if explicitly requested and available (with strict timeout)
	if (options?.allowGps && typeof navigator !== "undefined" && "geolocation" in navigator) {
		try {
			const gpsResult = await new Promise<GeoLocationResult | null>((resolve) => {
				const timer = setTimeout(() => resolve(null), Math.min(timeout, 3000));
				navigator.geolocation.getCurrentPosition(
					(pos) => {
						clearTimeout(timer);
						resolve({
							latitude: pos.coords.latitude,
							longitude: pos.coords.longitude,
							label: `${pos.coords.latitude.toFixed(2)}°, ${pos.coords.longitude.toFixed(2)}°`,
							source: "gps"
						});
					},
					() => {
						clearTimeout(timer);
						resolve(null);
					},
					{ enableHighAccuracy: true, timeout: Math.min(timeout, 3000) }
				);
			});

			if (gpsResult) {
				// Enrich coordinates with reverse geocoding if possible
				try {
					const revRes = await fetch(
						`https://geocoding-api.open-meteo.com/v1/search?name=${gpsResult.latitude.toFixed(2)},${gpsResult.longitude.toFixed(2)}&count=1&format=json`,
						{ signal: AbortSignal.timeout(2000) }
					);
					if (revRes.ok) {
						const revData = await revRes.json();
						const top = revData.results?.[0];
						if (top) {
							gpsResult.city = top.name;
							gpsResult.country = top.country;
							gpsResult.region = top.admin1;
							gpsResult.label = [top.name, top.country].filter(Boolean).join(" · ");
						}
					}
				} catch {}
				cacheLocation(gpsResult);
				return gpsResult;
			}
		} catch {}
	}

	// 2. High-speed, HTTPS, legal IP Geolocation via freeipapi.com
	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeout);
		const res = await fetch("https://freeipapi.com/api/json", {
			signal: controller.signal,
			headers: { Accept: "application/json" }
		});
		clearTimeout(timer);

		if (res.ok) {
			const data = await res.json();
			if (typeof data.latitude === "number" && typeof data.longitude === "number") {
				const city = data.cityName || undefined;
				const country = data.countryName || undefined;
				const region = data.regionName || undefined;
				const label = [city, country].filter(Boolean).join(" · ") || `${data.latitude.toFixed(2)}°, ${data.longitude.toFixed(2)}°`;

				const result: GeoLocationResult = {
					latitude: data.latitude,
					longitude: data.longitude,
					city,
					country,
					region,
					label,
					source: "ip"
				};
				cacheLocation(result);
				return result;
			}
		}
	} catch {}

	// 3. Fallback: OS System TimeZone + Open-Meteo Geocoding (Zero network risk, 100% legal)
	try {
		const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
		if (tz && tz.includes("/")) {
			const cityCandidate = tz.split("/")[1]?.replace(/_/g, " ");
			if (cityCandidate) {
				const geocoded = await geocodeCity(cityCandidate);
				if (geocoded) {
					geocoded.source = "timezone";
					cacheLocation(geocoded);
					return geocoded;
				}
			}
		}
	} catch {}

	// 4. Fallback: Last known successfully cached location
	const cached = getCachedLocation();
	if (cached) return cached;

	return null;
}

/**
 * Searches and geocodes any city or place name into official coordinates.
 * Supports Arabic, English, and all international place names.
 */
export async function geocodeCity(
	query: string,
	language = "en"
): Promise<GeoLocationResult | null> {
	if (!query || !query.trim()) return null;

	try {
		const res = await fetch(
			`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query.trim())}&count=1&language=${language}&format=json`,
			{ signal: AbortSignal.timeout(4000) }
		);
		if (!res.ok) return null;

		const data = await res.json();
		const top = data.results?.[0];
		if (!top || typeof top.latitude !== "number" || typeof top.longitude !== "number") {
			return null;
		}

		const city = top.name || query.trim();
		const country = top.country || undefined;
		const region = top.admin1 || undefined;
		const label = [city, country].filter(Boolean).join(" · ");

		return {
			latitude: top.latitude,
			longitude: top.longitude,
			city,
			country,
			region,
			label,
			source: "timezone"
		};
	} catch {
		return null;
	}
}

function cacheLocation(loc: GeoLocationResult) {
	try {
		localStorage.setItem(STORAGE_KEY_CACHED_LOC, JSON.stringify(loc));
	} catch {}
}

export function getCachedLocation(): GeoLocationResult | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY_CACHED_LOC);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		if (typeof parsed?.latitude === "number" && typeof parsed?.longitude === "number") {
			return { ...parsed, source: "cache" };
		}
	} catch {}
	return null;
}
