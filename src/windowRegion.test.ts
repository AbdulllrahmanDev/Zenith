// @ts-expect-error -- bun:test is provided by Bun's test runner (@types/bun is not installed)
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createRegionSender, type RegionRect } from "./windowRegion";

describe("createRegionSender", () => {
	const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");

	beforeEach(() => {
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			writable: true,
			value: {
				innerWidth: 1920,
				innerHeight: 1080,
				devicePixelRatio: 1,
				matchMedia: () => ({
					addEventListener: () => {},
					removeEventListener: () => {}
				})
			}
		});
	});

	afterEach(() => {
		if (originalWindowDescriptor) {
			Object.defineProperty(globalThis, "window", originalWindowDescriptor);
		} else {
			delete (globalThis as { window?: unknown }).window;
		}
	});

	test("re-sends identical rects and active held rects when force is true", async () => {
		const sent: RegionRect[][] = [];
		const sender = createRegionSender((rects) => {
			sent.push(rects);
		}, 40);

		const leftZone: RegionRect = { x: 0, y: 400, width: 66, height: 244 };
		const ringRect: RegionRect = { x: 700, y: 500, width: 300, height: 88 };

		// Initial two rects trigger a send; identical unforced send is deduplicated.
		sender([leftZone, ringRect]);
		sender([leftZone, ringRect]);
		expect(sent).toHaveLength(1);
		expect(sent[0]).toEqual([leftZone, ringRect]);

		// Forced send with identical rects re-sends even though key did not change.
		sender([leftZone, ringRect], true);
		expect(sent).toHaveLength(2);
		expect(sent[1]).toEqual([leftZone, ringRect]);

		// Shrink from [leftZone, ringRect] -> [leftZone]: creates an active held entry.
		sender([leftZone]);
		expect(sent).toHaveLength(3);
		expect(sent[2]).toEqual([leftZone, leftZone, ringRect]);

		// Forced re-send during hold window preserves both current and active held rects.
		sender([leftZone], true);
		expect(sent).toHaveLength(4);
		expect(sent[3]).toEqual([leftZone, leftZone, ringRect]);

		// Once holdMs elapses, scheduled expiry emits the shrunk current region cleanly.
		await new Promise((resolve) => setTimeout(resolve, 65));
		expect(sent).toHaveLength(5);
		expect(sent[4]).toEqual([leftZone]);
	});
});
