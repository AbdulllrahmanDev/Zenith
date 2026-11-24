// @ts-expect-error -- bun:test is provided by Bun's test runner (@types/bun is not installed)
import { describe, expect, test } from "bun:test";
import {
	buildConvertRequestFromOption,
	buildCustomMatcherInputs,
	DEFAULT_PRESET_CATALOG,
	DEFAULT_TOOLBAR_PROFILES,
	detectInputCategory,
	EXTENSION_CATEGORY,
	extractExtension,
	getCompatibleCatalogIdsForCategory,
	matchFormatsForPaths,
} from "./formats";
import type { ConverterState, TargetOption, ToolbarProfile } from "./types";

describe("extractExtension", () => {
	test("extracts compound extensions before simple extensions", () => {
		expect(extractExtension("backup.tar.gz")).toBe("tar.gz");
		expect(extractExtension("C:\\Users\\Dev\\archive.TAR.BZ2")).toBe("tar.bz2");
		expect(extractExtension("/home/user/novel.kepub.epub")).toBe("kepub.epub");
		expect(extractExtension("PHOTO.HEIC")).toBe("heic");
		expect(extractExtension(".png")).toBe("png");
	});

	test("handles folders and extensionless paths cleanly", () => {
		expect(extractExtension("C:\\Users\\Dev\\MyFolder\\")).toBe("");
		expect(extractExtension("/tmp/output.v2/")).toBe("");
		expect(extractExtension("C:\\Users\\Dev\\folder.with.dots\\README")).toBe("");
		expect(extractExtension("")).toBe("");
	});
});

describe("EXTENSION_CATEGORY & DEFAULT_TOOLBAR_PROFILES coverage", () => {
	test("covers 270+ Filee extensions and two-sided default profiles", () => {
		expect(Object.keys(EXTENSION_CATEGORY).length).toBeGreaterThanOrEqual(270);
		expect(EXTENSION_CATEGORY["tar.gz"]).toEqual({ formatId: "tgz", category: "archive" });
		expect(EXTENSION_CATEGORY["kepub.epub"]).toEqual({ formatId: "kepub", category: "ebook" });
		expect(EXTENSION_CATEGORY["hwpx"]).toEqual({ formatId: "hwpx", category: "hwp" });
		expect(EXTENSION_CATEGORY["geojson"]).toEqual({ formatId: "geojson", category: "geospatial" });
		expect(DEFAULT_TOOLBAR_PROFILES.length).toBeGreaterThanOrEqual(19);
	});
});

describe("matchFormatsForPaths", () => {
	test("returns two-sided donut for homogeneous image drops including crop on back", () => {
		const result = matchFormatsForPaths(["a.png", "b.jpg"]);
		expect(result.detectedCategory).toBe("image");

		const primaryFormats = result.primary.map((opt) => opt.format);
		expect(primaryFormats).toContain("png");
		expect(primaryFormats).toContain("jpg");
		expect(primaryFormats).toContain("webp");
		expect(primaryFormats).toContain("gif");
		expect(primaryFormats).toContain("pdf");

		const cropOption = result.secondary.find((opt) => opt.actionKind === "crop");
		expect(cropOption).toBeDefined();
		expect(cropOption?.presetId).toBe("tool-crop");
	});

	test("annotates requiredEngine for heavy optional targets", () => {
		const videoDonut = matchFormatsForPaths(["clip.mp4"]);
		expect(videoDonut.detectedCategory).toBe("video");
		const videoAll = [...videoDonut.primary, ...videoDonut.secondary];
		expect(videoAll.find((o) => o.format === "gif")?.requiredEngine).toBe("ffmpeg");
		expect(videoAll.find((o) => o.format === "mp3")?.requiredEngine).toBe("ffmpeg");
		expect(videoAll.find((o) => o.presetId === "caption-video")?.requiredEngine).toBe("whisper");

		const imageDonut = matchFormatsForPaths(["photo.png"]);
		expect(imageDonut.primary.find((o) => o.format === "gif")?.requiredEngine).toBeUndefined();

		const docDonut = matchFormatsForPaths(["legacy.doc"]);
		expect(docDonut.detectedCategory).toBe("document");
		expect(docDonut.primary.find((o) => o.format === "pdf")?.requiredEngine).toBe("libreoffice");

		const docxDonut = matchFormatsForPaths(["modern.docx"]);
		expect(docxDonut.primary.find((o) => o.format === "pdf")?.requiredEngine).toBeUndefined();

		const ebookDonut = matchFormatsForPaths(["book.epub"]);
		expect(ebookDonut.detectedCategory).toBe("ebook");
		expect(ebookDonut.primary.find((o) => o.format === "azw3")?.requiredEngine).toBe("calibre");

		expect(DEFAULT_PRESET_CATALOG["searchable-pdf"]?.requiredEngine).toBe("tesseract");
		expect(DEFAULT_PRESET_CATALOG["tool-upscale"]?.requiredEngine).toBe("upscayl-bin");
		expect(DEFAULT_PRESET_CATALOG["pdf-a"]?.requiredEngine).toBe("ghostscript");
		expect(DEFAULT_PRESET_CATALOG["to-eps"]?.requiredEngine).toBe("ghostscript");

		const rstDonut = matchFormatsForPaths(["notes.rst"]);
		expect(rstDonut.primary.find((o) => o.format === "pdf")?.requiredEngine).toBe("pandoc");
	});

	test("computes intersection and archive fallback for mixed multi-file drops", () => {
		const result = matchFormatsForPaths(["photo.png", "report.docx"]);
		expect(result.detectedCategory).toBe("mixed");
		expect(result.primary.length).toBeGreaterThan(0);

		const all = [...result.primary, ...result.secondary];
		const allFormats = all.map((o) => o.format);
		const allPresets = all.map((o) => o.presetId);

		expect(allPresets.includes("zip-all") || allPresets.includes("to-pdf")).toBe(true);
		expect(allFormats).toContain("pdf");
		expect(allFormats).toContain("zip");
		expect(allFormats).toContain("7z");
		expect(allFormats).toContain("tar");
		expect(allFormats).not.toContain("txt");
		expect(allFormats).not.toContain("docx");

		const disjoint = matchFormatsForPaths(["song.mp3", "model.stl"]);
		expect(disjoint.detectedCategory).toBe("mixed");
		expect(disjoint.primary.length).toBeGreaterThan(0);
		expect(disjoint.primary.map((o) => o.format)).toContain("zip");
		expect(disjoint.primary.map((o) => o.format)).toContain("7z");
		expect(disjoint.primary.map((o) => o.format)).toContain("tar");
	});

	test("respects custom ToolbarProfile overrides when passed", () => {
		const customProfiles: ToolbarProfile[] = [
			{
				id: "images",
				category: "image",
				label: "Custom Images",
				primaryIds: ["custom-webp-95", "to-avif", "to-png"],
				secondaryIds: ["zip-all", "tool-crop", "tool-upscale"],
			},
		];
		const extraPresets: Record<string, TargetOption> = {
			"custom-webp-95": {
				format: "webp",
				label: "WEBP 95",
				category: "image",
				presetId: "custom-webp-95",
				quality: 95,
			},
		};

		const result = matchFormatsForPaths(["photo.png"], customProfiles, extraPresets);
		expect(result.detectedCategory).toBe("image");
		expect(result.primary.map((o) => o.presetId)).toEqual(["custom-webp-95", "to-avif", "to-png"]);
		expect(result.primary[0]?.quality).toBe(95);
		expect(result.secondary.map((o) => o.presetId)).toEqual(["zip-all", "tool-crop", "tool-upscale"]);
		expect(result.secondary.find((o) => o.presetId === "tool-upscale")?.requiredEngine).toBe("upscayl-bin");
	});

	test("handles empty path array and folder paths gracefully", () => {
		const emptyResult = matchFormatsForPaths([]);
		expect(emptyResult.detectedCategory).toBe("mixed");
		expect(emptyResult.primary.length).toBeGreaterThan(0);
		expect(emptyResult.primary.map((o) => o.format)).toContain("zip");

		const folderResult = matchFormatsForPaths(["C:\\Users\\Dev\\Projects\\"]);
		expect(folderResult.detectedCategory).toBe("folder");
		expect(folderResult.primary.map((o) => o.format)).toContain("zip");
		expect(folderResult.primary.map((o) => o.format)).toContain("iso");
	});
});

describe("ConverterState helpers & ConvertRequest builder", () => {
	test("maps ConverterState profiles and presets into matcher inputs and ConvertRequest", () => {
		const state: ConverterState = {
			profiles: [
				{
					id: "images",
					category: "image",
					label: "Images",
					primary_ids: ["custom-webp-75", "to-jpg"],
					secondary_ids: ["zip-all"],
				},
			],
			presets: [
				{
					id: "custom-webp-75",
					name: "WebP 75",
					target_format: "webp",
					quality: 75,
					pages: null,
					split_every: null,
					split_parts: null,
					conflict: "skip",
					keep_dates: true,
					zip: true,
					iso_filesystem: "udf201",
					iso_label: "IGNORED_NON_ISO",
				},
				{
					id: "to-jpg",
					name: "JPG HQ",
					target_format: "jpg",
					quality: 96,
					pages: null,
					split_every: null,
					split_parts: null,
					conflict: "overwrite",
					keep_dates: false,
					zip: false,
					iso_filesystem: null,
					iso_label: null,
				},
			],
			recent: [],
			watch_rules: [],
		};

		const { profiles, extraPresets, presetsById } = buildCustomMatcherInputs(state);
		const sides = matchFormatsForPaths(["photo.png"], profiles, extraPresets);

		expect(sides.primary.map((o) => o.presetId)).toEqual(["custom-webp-75", "to-jpg"]);
		expect(sides.primary[0]?.label).toBe("WebP 75");
		expect(sides.primary[0]?.quality).toBe(75);

		const customReq = buildConvertRequestFromOption({
			jobId: "job-c",
			inputs: ["C:\\Temp\\photo.png"],
			option: sides.primary[0],
			outputDir: null,
			presetsById,
		});
		expect(customReq.preset).toBeNull();
		expect(customReq.to).toBe("webp");
		expect(customReq.quality).toBe(75);
		expect(customReq.conflict).toBe("skip");
		expect(customReq.overwrite).toBeNull();
		expect(customReq.keep_dates).toBe(true);
		expect(customReq.zip).toBe(true);
		expect(customReq.iso_filesystem).toBeNull();

		const builtInReq = buildConvertRequestFromOption({
			jobId: "job-b",
			inputs: ["C:\\Temp\\photo.png"],
			option: sides.primary[1],
			outputDir: "C:\\Out",
			presetsById,
		});
		expect(builtInReq.preset).toBe("to-jpg");
		expect(builtInReq.quality).toBe(96);
		expect(builtInReq.conflict).toBe("overwrite");
		expect(builtInReq.overwrite).toBe(true);
		expect(builtInReq.output_dir).toBe("C:\\Out");
	});

	test("handles PDF split and ISO fields plus category detection helpers", () => {
		const isoPresetMap = new Map([
			[
				"to-iso",
				{
					id: "to-iso",
					name: "ISO UDF",
					target_format: "iso",
					quality: null,
					pages: null,
					split_every: null,
					split_parts: null,
					conflict: "rename",
					keep_dates: true,
					zip: false,
					iso_filesystem: "udf201",
					iso_label: "BACKUP_DISC",
				},
			],
		]);
		const isoReq = buildConvertRequestFromOption({
			jobId: "job-iso",
			inputs: ["C:\\Folder\\"],
			option: DEFAULT_PRESET_CATALOG["to-iso"],
			outputDir: null,
			presetsById: isoPresetMap,
		});
		expect(isoReq.iso_filesystem).toBe("udf201");
		expect(isoReq.iso_label).toBe("BACKUP_DISC");
		expect(isoReq.conflict).toBe("rename");
		expect(isoReq.overwrite).toBeNull();

		expect(detectInputCategory("png")).toBe("image");
		expect(detectInputCategory("C:\\Temp\\clip.mp4")).toBe("video");
		expect(detectInputCategory("C:\\Folder\\")).toBe("folder");

		const imageCompat = getCompatibleCatalogIdsForCategory("image");
		expect(imageCompat).toContain("to-webp");
		expect(imageCompat).toContain("tool-crop");
		expect(imageCompat).not.toContain("to-mp3");
	});
});
