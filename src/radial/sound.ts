let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
	if (typeof window === "undefined") return null;
	try {
		if (!audioCtx) {
			const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
			audioCtx = new AudioContextClass();
		}
		if (audioCtx.state === "suspended") {
			audioCtx.resume().catch(() => {});
		}
		return audioCtx;
	} catch {
		return null;
	}
}

/**
 * Play a high-end futuristic chime when the radial wheel blooms open.
 */
export function playRadialBloom(volumePercent = 70) {
	if (volumePercent <= 0) return;
	const ctx = getAudioContext();
	if (!ctx) return;

	try {
		const now = ctx.currentTime;
		const gain = ctx.createGain();
		const masterVol = (volumePercent / 100) * 0.12;
		gain.gain.setValueAtTime(0.001, now);
		gain.gain.exponentialRampToValueAtTime(masterVol, now + 0.04);
		gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
		gain.connect(ctx.destination);

		// Tone 1 (fundamental)
		const osc1 = ctx.createOscillator();
		osc1.type = "sine";
		osc1.frequency.setValueAtTime(587.33, now); // D5
		osc1.frequency.exponentialRampToValueAtTime(880, now + 0.18); // A5
		osc1.connect(gain);
		osc1.start(now);
		osc1.stop(now + 0.35);

		// Tone 2 (harmonic shimmer)
		const osc2 = ctx.createOscillator();
		osc2.type = "triangle";
		osc2.frequency.setValueAtTime(1174.66, now + 0.02); // D6
		osc2.frequency.exponentialRampToValueAtTime(1760, now + 0.22);
		const gain2 = ctx.createGain();
		gain2.gain.setValueAtTime(0.001, now);
		gain2.gain.exponentialRampToValueAtTime(masterVol * 0.4, now + 0.05);
		gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
		osc2.connect(gain2);
		gain2.connect(ctx.destination);
		osc2.start(now);
		osc2.stop(now + 0.3);
	} catch {}
}

/**
 * Play a subtle micro-tick when hovering between radial slices.
 */
export function playRadialHover(volumePercent = 70) {
	if (volumePercent <= 0) return;
	const ctx = getAudioContext();
	if (!ctx) return;

	try {
		const now = ctx.currentTime;
		const gain = ctx.createGain();
		const masterVol = (volumePercent / 100) * 0.06;
		gain.gain.setValueAtTime(masterVol, now);
		gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);
		gain.connect(ctx.destination);

		const osc = ctx.createOscillator();
		osc.type = "sine";
		osc.frequency.setValueAtTime(987.77, now); // B5
		osc.frequency.exponentialRampToValueAtTime(1318.51, now + 0.02); // E6
		osc.connect(gain);
		osc.start(now);
		osc.stop(now + 0.04);
	} catch {}
}
