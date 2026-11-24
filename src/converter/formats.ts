import type {
	ActionKind,
	ConverterPresetConfig,
	ConverterState,
	ConvertRequest,
	CropBox,
	DonutSides,
	FileCategory,
	TargetOption,
	ToolbarProfile,
} from "./types";

/**
 * Known extension -> Filee format id and Zenith category mapping.
 * Ported from Filee's FormatRegistry.Known (300+ formats, 480+ extensions).
 */
export const EXTENSION_CATEGORY: Record<string, { formatId: string; category: FileCategory }> = {
	// Raster images
	"png": { formatId: "png", category: "image" },
	"png_large": { formatId: "png", category: "image" },
	"jpg": { formatId: "jpg", category: "image" },
	"jpeg": { formatId: "jpg", category: "image" },
	"jpe": { formatId: "jpg", category: "image" },
	"jfif": { formatId: "jpg", category: "image" },
	"jif": { formatId: "jpg", category: "image" },
	"insp": { formatId: "jpg", category: "image" },
	"jpg_large": { formatId: "jpg", category: "image" },
	"webp": { formatId: "webp", category: "image" },
	"tiff": { formatId: "tiff", category: "image" },
	"tif": { formatId: "tiff", category: "image" },
	"bmp": { formatId: "bmp", category: "image" },
	"dib": { formatId: "bmp", category: "image" },
	"gif": { formatId: "gif", category: "image" },
	"ico": { formatId: "ico", category: "image" },
	"avif": { formatId: "avif", category: "image" },
	"heic": { formatId: "heic", category: "image" },
	"heif": { formatId: "heic", category: "image" },
	"hif": { formatId: "heic", category: "image" },
	"jxl": { formatId: "jxl", category: "image" },
	"jp2": { formatId: "jp2", category: "image" },
	"j2k": { formatId: "jp2", category: "image" },
	"jpf": { formatId: "jp2", category: "image" },
	"jpx": { formatId: "jp2", category: "image" },
	"psd": { formatId: "psd", category: "image" },
	"psb": { formatId: "psb", category: "image" },
	"tga": { formatId: "tga", category: "image" },
	"icb": { formatId: "tga", category: "image" },
	"vda": { formatId: "tga", category: "image" },
	"vst": { formatId: "tga", category: "image" },
	"ppm": { formatId: "ppm", category: "image" },
	"pgm": { formatId: "ppm", category: "image" },
	"pbm": { formatId: "ppm", category: "image" },
	"pnm": { formatId: "ppm", category: "image" },
	"icns": { formatId: "icns", category: "image" },
	"apng": { formatId: "apng", category: "image" },
	"mng": { formatId: "mng", category: "image" },
	"qoi": { formatId: "qoi", category: "image" },
	"dds": { formatId: "dds", category: "image" },
	"pcx": { formatId: "pcx", category: "image" },
	"cur": { formatId: "cur", category: "image" },
	"ani": { formatId: "ani", category: "image" },
	"xpm": { formatId: "xpm", category: "image" },
	"xbm": { formatId: "xbm", category: "image" },
	"wbmp": { formatId: "wbmp", category: "image" },
	"pam": { formatId: "pam", category: "image" },
	"pfm": { formatId: "pfm", category: "image" },
	"sgi": { formatId: "sgi", category: "image" },
	"rgb": { formatId: "sgi", category: "image" },
	"rgba": { formatId: "sgi", category: "image" },
	"bw": { formatId: "sgi", category: "image" },
	"ras": { formatId: "ras", category: "image" },
	"sun": { formatId: "ras", category: "image" },
	"miff": { formatId: "miff", category: "image" },
	"dcm": { formatId: "dcm", category: "image" },
	"dicom": { formatId: "dcm", category: "image" },
	"pcd": { formatId: "pcd", category: "image" },
	"exr": { formatId: "exr", category: "image" },
	"hdr": { formatId: "hdr", category: "image" },
	"fits": { formatId: "fits", category: "image" },
	"fts": { formatId: "fits", category: "image" },
	"jxr": { formatId: "jxr", category: "image" },
	"wdp": { formatId: "jxr", category: "image" },
	"hdp": { formatId: "jxr", category: "image" },
	"xcf": { formatId: "xcf", category: "image" },
	"kra": { formatId: "kra", category: "image" },
	"kra~": { formatId: "kra", category: "image" },
	"pdn": { formatId: "pdn", category: "image" },
	"vtf": { formatId: "vtf", category: "image" },
	"livp": { formatId: "livp", category: "image" },
	"exe": { formatId: "exe", category: "image" },
	"dll": { formatId: "exe", category: "image" },
	"dng": { formatId: "raw", category: "image" },
	"cr2": { formatId: "raw", category: "image" },
	"cr3": { formatId: "raw", category: "image" },
	"crw": { formatId: "raw", category: "image" },
	"nef": { formatId: "raw", category: "image" },
	"nrw": { formatId: "raw", category: "image" },
	"arw": { formatId: "raw", category: "image" },
	"srf": { formatId: "raw", category: "image" },
	"sr2": { formatId: "raw", category: "image" },
	"orf": { formatId: "raw", category: "image" },
	"rw2": { formatId: "raw", category: "image" },
	"raf": { formatId: "raw", category: "image" },
	"pef": { formatId: "raw", category: "image" },
	"dcr": { formatId: "raw", category: "image" },
	"kdc": { formatId: "raw", category: "image" },
	"erf": { formatId: "raw", category: "image" },
	"mos": { formatId: "raw", category: "image" },
	"mrw": { formatId: "raw", category: "image" },
	"x3f": { formatId: "raw", category: "image" },
	"3fr": { formatId: "raw", category: "image" },
	"fff": { formatId: "raw", category: "image" },
	"iiq": { formatId: "raw", category: "image" },
	"mef": { formatId: "raw", category: "image" },
	"rwl": { formatId: "raw", category: "image" },
	"srw": { formatId: "raw", category: "image" },
	"raw": { formatId: "raw", category: "image" },

	// Vector graphics
	"svg": { formatId: "svg", category: "vector" },
	"svgz": { formatId: "svgz", category: "vector" },
	"eps": { formatId: "eps", category: "vector" },
	"epsf": { formatId: "eps", category: "vector" },
	"epsi": { formatId: "eps", category: "vector" },
	"ps": { formatId: "ps", category: "vector" },
	"ai": { formatId: "ai", category: "vector" },
	"emf": { formatId: "emf", category: "vector" },
	"wmf": { formatId: "wmf", category: "vector" },
	"cdr": { formatId: "cdr", category: "vector" },
	"cgm": { formatId: "cgm", category: "vector" },
	"plt": { formatId: "plt", category: "vector" },
	"hpgl": { formatId: "plt", category: "vector" },
	"hpg": { formatId: "plt", category: "vector" },
	"hgl": { formatId: "plt", category: "vector" },
	"vsd": { formatId: "vsd", category: "vector" },
	"vsdx": { formatId: "vsd", category: "vector" },
	"dst": { formatId: "dst", category: "vector" },
	"odg": { formatId: "odg", category: "vector" },
	"canvas": { formatId: "canvas", category: "vector" },
	"fodg": { formatId: "fodg", category: "vector" },

	// PDF
	"pdf": { formatId: "pdf", category: "pdf" },

	// Word processing
	"docx": { formatId: "docx", category: "document" },
	"docm": { formatId: "docm", category: "document" },
	"dotx": { formatId: "dotx", category: "document" },
	"dotm": { formatId: "dotm", category: "document" },
	"doc": { formatId: "doc", category: "document" },
	"dot": { formatId: "dot", category: "document" },
	"odt": { formatId: "odt", category: "document" },
	"fodt": { formatId: "fodt", category: "document" },
	"ott": { formatId: "ott", category: "document" },
	"rtf": { formatId: "rtf", category: "document" },
	"wps": { formatId: "wps", category: "document" },
	"ofd": { formatId: "ofd", category: "document" },
	"wpd": { formatId: "wpd", category: "document" },
	"lwp": { formatId: "lwp", category: "document" },
	"abw": { formatId: "abw", category: "document" },
	"zabw": { formatId: "abw", category: "document" },
	"pages": { formatId: "pages", category: "document" },
	"sdw": { formatId: "sdw", category: "document" },
	"cwk": { formatId: "cwk", category: "document" },
	"mcw": { formatId: "mcw", category: "document" },
	"602": { formatId: "602", category: "document" },
	"psw": { formatId: "psw", category: "document" },
	"pub": { formatId: "pub", category: "document" },
	"eml": { formatId: "eml", category: "document" },
	"msg": { formatId: "msg", category: "document" },
	"p7m": { formatId: "p7m", category: "document" },

	// Korean word processor (Hancom)
	"hwpx": { formatId: "hwpx", category: "hwp" },
	"hwp": { formatId: "hwp", category: "hwp" },

	// Spreadsheets
	"xlsx": { formatId: "xlsx", category: "spreadsheet" },
	"xlsm": { formatId: "xlsm", category: "spreadsheet" },
	"xltx": { formatId: "xltx", category: "spreadsheet" },
	"xls": { formatId: "xls", category: "spreadsheet" },
	"xlt": { formatId: "xlt", category: "spreadsheet" },
	"ods": { formatId: "ods", category: "spreadsheet" },
	"ots": { formatId: "ots", category: "spreadsheet" },
	"fods": { formatId: "fods", category: "spreadsheet" },
	"csv": { formatId: "csv", category: "spreadsheet" },
	"tsv": { formatId: "tsv", category: "spreadsheet" },
	"tab": { formatId: "tsv", category: "spreadsheet" },
	"et": { formatId: "et", category: "spreadsheet" },
	"numbers": { formatId: "numbers", category: "spreadsheet" },
	"sdc": { formatId: "sdc", category: "spreadsheet" },

	// Presentations
	"pptx": { formatId: "pptx", category: "presentation" },
	"pptm": { formatId: "pptm", category: "presentation" },
	"potx": { formatId: "potx", category: "presentation" },
	"potm": { formatId: "potm", category: "presentation" },
	"ppsx": { formatId: "ppsx", category: "presentation" },
	"ppt": { formatId: "ppt", category: "presentation" },
	"pps": { formatId: "ppt", category: "presentation" },
	"pot": { formatId: "ppt", category: "presentation" },
	"odp": { formatId: "odp", category: "presentation" },
	"otp": { formatId: "otp", category: "presentation" },
	"fodp": { formatId: "fodp", category: "presentation" },
	"key": { formatId: "key", category: "presentation" },
	"dps": { formatId: "dps", category: "presentation" },
	"sda": { formatId: "sda", category: "presentation" },
	"sdd": { formatId: "sda", category: "presentation" },

	// Plain text & markup
	"txt": { formatId: "txt", category: "text" },
	"log": { formatId: "txt", category: "text" },
	"cxlog": { formatId: "txt", category: "text" },
	"py": { formatId: "txt", category: "text" },
	"pac": { formatId: "txt", category: "text" },
	"bat": { formatId: "txt", category: "text" },
	"cmd": { formatId: "txt", category: "text" },
	"command": { formatId: "txt", category: "text" },
	"lua": { formatId: "txt", category: "text" },
	"css": { formatId: "txt", category: "text" },
	"ps1": { formatId: "txt", category: "text" },
	"sql": { formatId: "txt", category: "text" },
	"ahk": { formatId: "txt", category: "text" },
	"ini": { formatId: "txt", category: "text" },
	"rsc": { formatId: "txt", category: "text" },
	"c": { formatId: "txt", category: "text" },
	"h": { formatId: "txt", category: "text" },
	"cpp": { formatId: "txt", category: "text" },
	"cc": { formatId: "txt", category: "text" },
	"cxx": { formatId: "txt", category: "text" },
	"hpp": { formatId: "txt", category: "text" },
	"hh": { formatId: "txt", category: "text" },
	"hxx": { formatId: "txt", category: "text" },
	"cs": { formatId: "txt", category: "text" },
	"dart": { formatId: "txt", category: "text" },
	"hql": { formatId: "txt", category: "text" },
	"dbml": { formatId: "txt", category: "text" },
	"java": { formatId: "txt", category: "text" },
	"ino": { formatId: "txt", category: "text" },
	"pde": { formatId: "txt", category: "text" },
	"md": { formatId: "md", category: "text" },
	"markdown": { formatId: "md", category: "text" },
	"html": { formatId: "html", category: "text" },
	"htm": { formatId: "html", category: "text" },
	"xhtml": { formatId: "html", category: "text" },
	"mhtml": { formatId: "mhtml", category: "text" },
	"mht": { formatId: "mhtml", category: "text" },
	"rst": { formatId: "rst", category: "text" },
	"tex": { formatId: "tex", category: "text" },
	"latex": { formatId: "tex", category: "text" },
	"org": { formatId: "org", category: "text" },
	"adoc": { formatId: "adoc", category: "text" },
	"asciidoc": { formatId: "adoc", category: "text" },
	"typ": { formatId: "typ", category: "text" },
	"mediawiki": { formatId: "mediawiki", category: "text" },
	"wiki": { formatId: "mediawiki", category: "text" },
	"dbk": { formatId: "dbk", category: "text" },
	"docbook": { formatId: "dbk", category: "text" },
	"ipynb": { formatId: "ipynb", category: "text" },
	"textile": { formatId: "textile", category: "text" },
	"man": { formatId: "man", category: "text" },
	"opml": { formatId: "opml", category: "text" },

	// Structured data
	"json": { formatId: "json", category: "data" },
	"jsonl": { formatId: "jsonl", category: "data" },
	"ndjson": { formatId: "jsonl", category: "data" },
	"yaml": { formatId: "yaml", category: "data" },
	"yml": { formatId: "yaml", category: "data" },
	"toml": { formatId: "toml", category: "data" },
	"xml": { formatId: "xml", category: "data" },
	"vcf": { formatId: "vcf", category: "data" },
	"vcard": { formatId: "vcf", category: "data" },
	"har": { formatId: "har", category: "data" },
	"ics": { formatId: "ics", category: "data" },
	"ical": { formatId: "ics", category: "data" },
	"plist": { formatId: "plist", category: "data" },

	// E-books & comics
	"epub": { formatId: "epub", category: "ebook" },
	"kepub.epub": { formatId: "kepub", category: "ebook" },
	"kepub": { formatId: "kepub", category: "ebook" },
	"mobi": { formatId: "mobi", category: "ebook" },
	"azw3": { formatId: "azw3", category: "ebook" },
	"azw": { formatId: "azw", category: "ebook" },
	"azw4": { formatId: "azw4", category: "ebook" },
	"prc": { formatId: "prc", category: "ebook" },
	"fb2": { formatId: "fb2", category: "ebook" },
	"cbz": { formatId: "cbz", category: "ebook" },
	"cbr": { formatId: "cbr", category: "ebook" },
	"cb7": { formatId: "cb7", category: "ebook" },
	"cbt": { formatId: "cbt", category: "ebook" },
	"cbc": { formatId: "cbc", category: "ebook" },
	"htmlz": { formatId: "htmlz", category: "ebook" },
	"txtz": { formatId: "txtz", category: "ebook" },
	"chm": { formatId: "chm", category: "ebook" },
	"lit": { formatId: "lit", category: "ebook" },
	"lrf": { formatId: "lrf", category: "ebook" },
	"pdb": { formatId: "pdb", category: "ebook" },
	"pml": { formatId: "pml", category: "ebook" },
	"rb": { formatId: "rb", category: "ebook" },
	"snb": { formatId: "snb", category: "ebook" },
	"tcr": { formatId: "tcr", category: "ebook" },
	"oeb": { formatId: "oeb", category: "ebook" },
	"opf": { formatId: "oeb", category: "ebook" },

	// Video
	"mp4": { formatId: "mp4", category: "video" },
	"mpg4": { formatId: "mp4", category: "video" },
	"m4v": { formatId: "m4v", category: "video" },
	"mov": { formatId: "mov", category: "video" },
	"qt": { formatId: "mov", category: "video" },
	"quicktime": { formatId: "mov", category: "video" },
	"mkv": { formatId: "mkv", category: "video" },
	"webm": { formatId: "webm", category: "video" },
	"avi": { formatId: "avi", category: "video" },
	"divx": { formatId: "avi", category: "video" },
	"wmv": { formatId: "wmv", category: "video" },
	"asf": { formatId: "wmv", category: "video" },
	"flv": { formatId: "flv", category: "video" },
	"f4v": { formatId: "flv", category: "video" },
	"mpg": { formatId: "mpg", category: "video" },
	"mpeg": { formatId: "mpg", category: "video" },
	"mpe": { formatId: "mpg", category: "video" },
	"m1v": { formatId: "mpg", category: "video" },
	"m2v": { formatId: "mpg", category: "video" },
	"dat": { formatId: "mpg", category: "video" },
	"ts": { formatId: "ts", category: "video" },
	"m2ts": { formatId: "m2ts", category: "video" },
	"mts": { formatId: "m2ts", category: "video" },
	"m2t": { formatId: "m2ts", category: "video" },
	"3gp": { formatId: "3gp", category: "video" },
	"3gpp": { formatId: "3gp", category: "video" },
	"3g2": { formatId: "3g2", category: "video" },
	"ogv": { formatId: "ogv", category: "video" },
	"vob": { formatId: "vob", category: "video" },
	"mod": { formatId: "mod", category: "video" },
	"tod": { formatId: "mod", category: "video" },
	"dv": { formatId: "dv", category: "video" },
	"dif": { formatId: "dv", category: "video" },
	"mxf": { formatId: "mxf", category: "video" },
	"rm": { formatId: "rm", category: "video" },
	"rmvb": { formatId: "rm", category: "video" },
	"swf": { formatId: "swf", category: "video" },
	"wtv": { formatId: "wtv", category: "video" },
	"dvr-ms": { formatId: "wtv", category: "video" },
	"dvr": { formatId: "wtv", category: "video" },
	"cavs": { formatId: "cavs", category: "video" },
	"usm": { formatId: "usm", category: "video" },
	"m4s": { formatId: "m4s", category: "video" },
	"dav": { formatId: "dav", category: "video" },
	"nov": { formatId: "nov", category: "video" },
	"bik": { formatId: "bik", category: "video" },
	"flc": { formatId: "flc", category: "video" },
	"fli": { formatId: "flc", category: "video" },
	"h265": { formatId: "h265", category: "video" },
	"265": { formatId: "h265", category: "video" },
	"hevc": { formatId: "h265", category: "video" },
	"h264": { formatId: "h264", category: "video" },
	"264": { formatId: "h264", category: "video" },

	// Audio
	"mp3": { formatId: "mp3", category: "audio" },
	"m4a": { formatId: "m4a", category: "audio" },
	"m4b": { formatId: "m4b", category: "audio" },
	"m4r": { formatId: "m4r", category: "audio" },
	"aac": { formatId: "aac", category: "audio" },
	"wav": { formatId: "wav", category: "audio" },
	"wave": { formatId: "wav", category: "audio" },
	"flac": { formatId: "flac", category: "audio" },
	"ogg": { formatId: "ogg", category: "audio" },
	"oga": { formatId: "ogg", category: "audio" },
	"opus": { formatId: "opus", category: "audio" },
	"wma": { formatId: "wma", category: "audio" },
	"aiff": { formatId: "aiff", category: "audio" },
	"aif": { formatId: "aiff", category: "audio" },
	"aifc": { formatId: "aiff", category: "audio" },
	"ac3": { formatId: "ac3", category: "audio" },
	"amr": { formatId: "amr", category: "audio" },
	"au": { formatId: "au", category: "audio" },
	"snd": { formatId: "au", category: "audio" },
	"caf": { formatId: "caf", category: "audio" },
	"weba": { formatId: "weba", category: "audio" },
	"mka": { formatId: "mka", category: "audio" },
	"mp2": { formatId: "mp2", category: "audio" },
	"mpa": { formatId: "mp2", category: "audio" },
	"dss": { formatId: "dss", category: "audio" },
	"voc": { formatId: "voc", category: "audio" },
	"wv": { formatId: "wv", category: "audio" },
	"tta": { formatId: "tta", category: "audio" },
	"w64": { formatId: "w64", category: "audio" },
	"eac3": { formatId: "eac3", category: "audio" },
	"ec3": { formatId: "eac3", category: "audio" },
	"ape": { formatId: "ape", category: "audio" },
	"mpc": { formatId: "mpc", category: "audio" },
	"mpp": { formatId: "mpc", category: "audio" },
	"mp+": { formatId: "mpc", category: "audio" },
	"tak": { formatId: "tak", category: "audio" },
	"dsf": { formatId: "dsf", category: "audio" },
	"dff": { formatId: "dff", category: "audio" },
	"dts": { formatId: "dts", category: "audio" },
	"spx": { formatId: "spx", category: "audio" },
	"qta": { formatId: "qta", category: "audio" },
	"xm": { formatId: "xm", category: "audio" },
	"it": { formatId: "it", category: "audio" },
	"s3m": { formatId: "s3m", category: "audio" },

	// Archives
	"zip": { formatId: "zip", category: "archive" },
	"wbpz": { formatId: "zip", category: "archive" },
	"7z": { formatId: "7z", category: "archive" },
	"rar": { formatId: "rar", category: "archive" },
	"tar": { formatId: "tar", category: "archive" },
	"tar.gz": { formatId: "tgz", category: "archive" },
	"tgz": { formatId: "tgz", category: "archive" },
	"taz": { formatId: "tgz", category: "archive" },
	"tar.bz2": { formatId: "tbz2", category: "archive" },
	"tbz2": { formatId: "tbz2", category: "archive" },
	"tar.bz": { formatId: "tbz2", category: "archive" },
	"tbz": { formatId: "tbz2", category: "archive" },
	"tar.xz": { formatId: "txz", category: "archive" },
	"txz": { formatId: "txz", category: "archive" },
	"tar.7z": { formatId: "tar7z", category: "archive" },
	"tar.lz": { formatId: "tlz", category: "archive" },
	"tlz": { formatId: "tlz", category: "archive" },
	"tar.z": { formatId: "tz", category: "archive" },
	"tz": { formatId: "tz", category: "archive" },
	"tar.zst": { formatId: "tzst", category: "archive" },
	"tzst": { formatId: "tzst", category: "archive" },
	"gz": { formatId: "gz", category: "archive" },
	"bz2": { formatId: "bz2", category: "archive" },
	"bz": { formatId: "bz2", category: "archive" },
	"xz": { formatId: "xz", category: "archive" },
	"lz": { formatId: "lz", category: "archive" },
	"lzma": { formatId: "lzma", category: "archive" },
	"z": { formatId: "z", category: "archive" },
	"zst": { formatId: "zst", category: "archive" },
	"jar": { formatId: "jar", category: "archive" },
	"zxp": { formatId: "zxp", category: "archive" },
	"nupkg": { formatId: "nupkg", category: "archive" },
	"snupkg": { formatId: "nupkg", category: "archive" },
	"apks": { formatId: "apks", category: "archive" },
	"xapk": { formatId: "apks", category: "archive" },
	"apkm": { formatId: "apks", category: "archive" },
	"aab": { formatId: "aab", category: "archive" },
	"msix": { formatId: "msix", category: "archive" },
	"appx": { formatId: "msix", category: "archive" },
	"msixbundle": { formatId: "msix", category: "archive" },
	"appxbundle": { formatId: "msix", category: "archive" },
	"mcpack": { formatId: "mcpack", category: "archive" },
	"mcaddon": { formatId: "mcaddon", category: "archive" },
	"mcworld": { formatId: "mcworld", category: "archive" },
	"mctemplate": { formatId: "mctemplate", category: "archive" },
	"mrpack": { formatId: "mrpack", category: "archive" },
	"gma": { formatId: "gma", category: "archive" },
	"vpk": { formatId: "vpk", category: "archive" },
	"bsp": { formatId: "bsp", category: "archive" },
	"cab": { formatId: "cab", category: "archive" },
	"cpio": { formatId: "cpio", category: "archive" },
	"deb": { formatId: "deb", category: "archive" },
	"rpm": { formatId: "rpm", category: "archive" },
	"dmg": { formatId: "dmg", category: "archive" },
	"iso": { formatId: "iso", category: "archive" },
	"img": { formatId: "img", category: "archive" },
	"lha": { formatId: "lha", category: "archive" },
	"lzh": { formatId: "lha", category: "archive" },
	"arj": { formatId: "arj", category: "archive" },
	"alz": { formatId: "alz", category: "archive" },
	"egg": { formatId: "egg", category: "archive" },
	"001": { formatId: "split", category: "archive" },
	"7z.001": { formatId: "split", category: "archive" },
	"zip.001": { formatId: "split", category: "archive" },
	"tar.001": { formatId: "split", category: "archive" },

	// CAD
	"dwg": { formatId: "dwg", category: "cad" },
	"dxf": { formatId: "dxf", category: "cad" },
	"gbr": { formatId: "gerber", category: "cad" },
	"ger": { formatId: "gerber", category: "cad" },
	"gtl": { formatId: "gerber", category: "cad" },
	"gbl": { formatId: "gerber", category: "cad" },
	"gto": { formatId: "gerber", category: "cad" },
	"gbo": { formatId: "gerber", category: "cad" },
	"gts": { formatId: "gerber", category: "cad" },
	"gbs": { formatId: "gerber", category: "cad" },
	"gtp": { formatId: "gerber", category: "cad" },
	"gbp": { formatId: "gerber", category: "cad" },
	"gko": { formatId: "gerber", category: "cad" },
	"gm1": { formatId: "gerber", category: "cad" },
	"gcode": { formatId: "gcode", category: "cad" },
	"gco": { formatId: "gcode", category: "cad" },
	"ngc": { formatId: "gcode", category: "cad" },

	// Fonts
	"ttf": { formatId: "ttf", category: "font" },
	"otf": { formatId: "otf", category: "font" },
	"woff": { formatId: "woff", category: "font" },
	"woff2": { formatId: "woff2", category: "font" },
	"eot": { formatId: "eot", category: "font" },
	"fon": { formatId: "fon", category: "font" },

	// Subtitles
	"srt": { formatId: "srt", category: "subtitle" },
	"ass": { formatId: "ass", category: "subtitle" },
	"ssa": { formatId: "ssa", category: "subtitle" },
	"vtt": { formatId: "vtt", category: "subtitle" },
	"smi": { formatId: "smi", category: "subtitle" },
	"sami": { formatId: "smi", category: "subtitle" },
	"lrc": { formatId: "lrc", category: "subtitle" },
	"krc": { formatId: "krc", category: "subtitle" },
	"ttml": { formatId: "ttml", category: "subtitle" },
	"dfxp": { formatId: "ttml", category: "subtitle" },
	"sub": { formatId: "sub", category: "subtitle" },
	"scc": { formatId: "scc", category: "subtitle" },

	// 3D models
	"glb": { formatId: "glb", category: "model3d" },
	"gltf": { formatId: "gltf", category: "model3d" },
	"stl": { formatId: "stl", category: "model3d" },
	"obj": { formatId: "obj", category: "model3d" },
	"3mf": { formatId: "3mf", category: "model3d" },
	"ply": { formatId: "ply", category: "model3d" },
	"fbx": { formatId: "fbx", category: "model3d" },
	"mdl": { formatId: "mdl", category: "model3d" },
	"smd": { formatId: "smd", category: "model3d" },

	// Geospatial
	"geojson": { formatId: "geojson", category: "geospatial" },
	"kml": { formatId: "kml", category: "geospatial" },
	"kmz": { formatId: "kmz", category: "geospatial" },
	"gpx": { formatId: "gpx", category: "geospatial" },
	"shp": { formatId: "shp", category: "geospatial" },
	"fit": { formatId: "fit", category: "geospatial" },
	"osm": { formatId: "osm", category: "geospatial" },
};

const COMPOUND_EXTENSIONS: string[] = Object.keys(EXTENSION_CATEGORY)
	.filter((ext) => ext.includes("."))
	.sort((a, b) => b.length - a.length);

function preset(
	presetId: string,
	format: string,
	label: string,
	category: FileCategory,
	options: {
		requiredEngine?: string;
		actionKind?: ActionKind;
		quality?: number;
	} = {},
): TargetOption {
	const entry: TargetOption = {
		format,
		label,
		category,
		actionKind: options.actionKind ?? "convert",
		presetId,
	};
	if (options.requiredEngine !== undefined) {
		entry.requiredEngine = options.requiredEngine;
	}
	if (options.quality !== undefined) {
		entry.quality = options.quality;
	}
	return entry;
}

/**
 * Default presets and target actions matching Filee's BuiltInData.CreatePresets()
 * with accurate optional engine annotations.
 */
export const DEFAULT_PRESET_CATALOG: Record<string, TargetOption> = {
	// Raster images
	"to-png": preset("to-png", "png", "PNG", "image"),
	"to-jpg": preset("to-jpg", "jpg", "JPG", "image", { quality: 90 }),
	"jpg-70": preset("jpg-70", "jpg", "JPG 70%", "image", { quality: 70 }),
	"to-webp": preset("to-webp", "webp", "WEBP", "image", { quality: 85 }),
	"to-tiff": preset("to-tiff", "tiff", "TIFF", "image"),
	"tiff-300": preset("tiff-300", "tiff", "TIFF 300dpi", "image"),
	"to-bmp": preset("to-bmp", "bmp", "BMP", "image"),
	"to-ico": preset("to-ico", "ico", "ICO", "image"),
	"to-gif": preset("to-gif", "gif", "GIF", "image"),
	"to-avif": preset("to-avif", "avif", "AVIF", "image", { quality: 60 }),
	"to-heic": preset("to-heic", "heic", "HEIC", "image", { quality: 80 }),
	"to-jxl": preset("to-jxl", "jxl", "JPEG XL", "image", { quality: 85 }),
	"to-psd": preset("to-psd", "psd", "PSD", "image"),
	"to-tga": preset("to-tga", "tga", "TGA", "image"),
	"to-icns": preset("to-icns", "icns", "ICNS", "image"),
	"to-vtf": preset("to-vtf", "vtf", "VTF", "image"),

	// Image tools
	"tool-crop": preset("tool-crop", "*", "Crop", "image", { actionKind: "crop" }),
	"rotate": preset("rotate", "*", "Rotate", "image", { quality: 95 }),
	"rotate-left": preset("rotate-left", "*", "Rotate Left", "image", { quality: 95 }),
	"rotate-right": preset("rotate-right", "*", "Rotate Right", "image", { quality: 95 }),
	"rotate-180": preset("rotate-180", "*", "Rotate 180°", "image", { quality: 95 }),
	"flip": preset("flip", "*", "Flip", "image", { quality: 95 }),
	"flip-horizontal": preset("flip-horizontal", "*", "Flip Horizontal", "image", { quality: 95 }),
	"flip-vertical": preset("flip-vertical", "*", "Flip Vertical", "image", { quality: 95 }),
	"half-size": preset("half-size", "*", "Half Size", "image"),
	"grayscale": preset("grayscale", "*", "Grayscale", "image"),
	"remove-background": preset("remove-background", "png", "Remove BG", "image"),
	"trim-transparent": preset("trim-transparent", "*", "Trim Borders", "image"),
	"merge-images": preset("merge-images", "*", "Merge Images", "image", { quality: 90 }),
	"compress-image": preset("compress-image", "*", "Compress", "image", { quality: 75 }),
	"tool-image-edit": preset("tool-image-edit", "*", "Edit Pictures", "image"),
	"tool-hide": preset("tool-hide", "*", "Pixelate / Blur", "image"),
	"tool-annotate": preset("tool-annotate", "*", "Annotate", "image"),
	"tool-background": preset("tool-background", "png", "Add Background", "image"),
	"tool-metadata": preset("tool-metadata", "*", "Metadata", "image", { requiredEngine: "exiftool" }),
	"tool-upscale": preset("tool-upscale", "*", "AI Upscale", "image", {
		requiredEngine: "upscayl-bin",
		actionKind: "upscale",
	}),
	"remove-metadata": preset("remove-metadata", "*", "Strip Metadata", "image"),

	// Vector
	"to-svg": preset("to-svg", "svg", "SVG", "vector"),
	"trace-svg": preset("trace-svg", "svg", "Trace SVG", "vector"),
	"trace-line-art": preset("trace-line-art", "svg", "Line Art SVG", "vector"),
	"to-eps": preset("to-eps", "eps", "EPS", "vector", { requiredEngine: "ghostscript" }),
	"to-ps": preset("to-ps", "ps", "PS", "vector", { requiredEngine: "ghostscript" }),

	// PDF & PDF tools
	"to-pdf": preset("to-pdf", "pdf", "PDF", "pdf"),
	"merge-pdf": preset("merge-pdf", "pdf", "Merge PDF", "pdf", { actionKind: "merge-pdf" }),
	"pdf-split": preset("pdf-split", "pdf", "Split PDF", "pdf", { actionKind: "split-pdf" }),
	"compress-pdf": preset("compress-pdf", "pdf", "Compress PDF", "pdf", { actionKind: "compress-pdf" }),
	"searchable-pdf": preset("searchable-pdf", "pdf", "Searchable PDF", "pdf", {
		requiredEngine: "tesseract",
		actionKind: "ocr",
	}),
	"pdf-a": preset("pdf-a", "pdf", "PDF/A", "pdf", { requiredEngine: "ghostscript" }),
	"pdf-edit": preset("pdf-edit", "*", "Edit PDF", "pdf"),
	"tool-pdf-crop": preset("tool-pdf-crop", "*", "Crop PDF", "pdf"),
	"tool-pdf-pages": preset("tool-pdf-pages", "*", "PDF Pages", "pdf"),
	"tool-pdf-add": preset("tool-pdf-add", "*", "Add PDF", "pdf"),
	"pdf-rotate-left": preset("pdf-rotate-left", "pdf", "Rotate Left", "pdf"),
	"pdf-rotate-right": preset("pdf-rotate-right", "pdf", "Rotate Right", "pdf"),
	"pdf-long-image": preset("pdf-long-image", "png", "Long Image", "image"),
	"pdf-slides": preset("pdf-slides", "pptx", "PPTX Slides", "presentation", { quality: 90 }),
	"weasyprint-pdf": preset("weasyprint-pdf", "pdf", "PDF (WeasyPrint)", "pdf", {
		requiredEngine: "weasyprint",
	}),

	// Office, HWP, Text & Markup
	"to-docx": preset("to-docx", "docx", "DOCX", "document"),
	"to-odt": preset("to-odt", "odt", "ODT", "document", { requiredEngine: "libreoffice" }),
	"to-rtf": preset("to-rtf", "rtf", "RTF", "document"),
	"to-eml": preset("to-eml", "eml", "EML", "document"),
	"to-hwpx": preset("to-hwpx", "hwpx", "HWPX", "hwp"),
	"to-hwp": preset("to-hwp", "hwp", "HWP", "hwp"),
	"to-xlsx": preset("to-xlsx", "xlsx", "XLSX", "spreadsheet"),
	"to-ods": preset("to-ods", "ods", "ODS", "spreadsheet"),
	"to-csv": preset("to-csv", "csv", "CSV", "spreadsheet"),
	"tool-sheet-studio": preset("tool-sheet-studio", "pdf", "Prepare Sheet", "spreadsheet"),
	"to-pptx": preset("to-pptx", "pptx", "PPTX", "presentation"),
	"to-odp": preset("to-odp", "odp", "ODP", "presentation", { requiredEngine: "libreoffice" }),
	"to-txt": preset("to-txt", "txt", "TXT", "text"),
	"to-md": preset("to-md", "md", "Markdown", "text"),
	"to-html": preset("to-html", "html", "HTML", "text"),
	"to-rst": preset("to-rst", "rst", "reStructuredText", "text", { requiredEngine: "pandoc" }),
	"to-tex": preset("to-tex", "tex", "LaTeX", "text", { requiredEngine: "pandoc" }),
	"to-org": preset("to-org", "org", "Org", "text", { requiredEngine: "pandoc" }),
	"to-adoc": preset("to-adoc", "adoc", "AsciiDoc", "text", { requiredEngine: "pandoc" }),
	"to-typ": preset("to-typ", "typ", "Typst", "text", { requiredEngine: "pandoc" }),
	"to-ipynb": preset("to-ipynb", "ipynb", "Jupyter", "text", { requiredEngine: "pandoc" }),
	"translate": preset("translate", "*", "Translate", "document"),

	// Data
	"to-json": preset("to-json", "json", "JSON", "data"),
	"to-yaml": preset("to-yaml", "yaml", "YAML", "data"),
	"to-toml": preset("to-toml", "toml", "TOML", "data"),
	"to-xml": preset("to-xml", "xml", "XML", "data"),
	"to-vcf": preset("to-vcf", "vcf", "vCard", "data"),
	"to-ics": preset("to-ics", "ics", "iCalendar", "data"),

	// E-books
	"to-epub": preset("to-epub", "epub", "EPUB", "ebook"),
	"to-kepub": preset("to-kepub", "kepub", "KEPUB", "ebook", { requiredEngine: "calibre" }),
	"to-azw3": preset("to-azw3", "azw3", "AZW3", "ebook", { requiredEngine: "calibre" }),
	"to-mobi": preset("to-mobi", "mobi", "MOBI", "ebook", { requiredEngine: "calibre" }),
	"to-fb2": preset("to-fb2", "fb2", "FB2", "ebook"),
	"to-cbz": preset("to-cbz", "cbz", "CBZ", "ebook"),

	// Video & Audio
	"to-mp4": preset("to-mp4", "mp4", "MP4", "video", { requiredEngine: "ffmpeg" }),
	"mp4-720": preset("mp4-720", "mp4", "MP4 720p", "video", { requiredEngine: "ffmpeg" }),
	"mp4-hevc": preset("mp4-hevc", "mp4", "MP4 HEVC", "video", { requiredEngine: "ffmpeg" }),
	"mp4-av1": preset("mp4-av1", "mp4", "MP4 AV1", "video", { requiredEngine: "ffmpeg" }),
	"to-mov": preset("to-mov", "mov", "MOV", "video", { requiredEngine: "ffmpeg" }),
	"to-webm": preset("to-webm", "webm", "WEBM", "video", { requiredEngine: "ffmpeg" }),
	"to-mkv": preset("to-mkv", "mkv", "MKV", "video", { requiredEngine: "ffmpeg" }),
	"to-avi": preset("to-avi", "avi", "AVI", "video", { requiredEngine: "ffmpeg" }),
	"video-from-images": preset("video-from-images", "mp4", "Slideshow MP4", "video", {
		requiredEngine: "ffmpeg",
	}),
	"tool-clip": preset("tool-clip", "*", "Cut Clip", "video", { requiredEngine: "ffmpeg" }),
	"crop-video": preset("crop-video", "*", "Crop Video", "video", { requiredEngine: "ffmpeg" }),
	"compress-video": preset("compress-video", "mp4", "Compress Video", "video", {
		requiredEngine: "ffmpeg",
	}),
	"merge-videos": preset("merge-videos", "mp4", "Merge Videos", "video", {
		requiredEngine: "ffmpeg",
	}),
	"extract-frames-png": preset("extract-frames-png", "png", "Extract Frames (PNG)", "image", {
		requiredEngine: "ffmpeg",
	}),
	"extract-frames-jpg": preset("extract-frames-jpg", "jpg", "Extract Frames (JPG)", "image", {
		requiredEngine: "ffmpeg",
	}),
	"live-photo-iphone": preset("live-photo-iphone", "jpg", "Live Photo", "image", {
		requiredEngine: "ffmpeg",
	}),
	"motion-photo-android": preset("motion-photo-android", "jpg", "Motion Photo", "image", {
		requiredEngine: "ffmpeg",
	}),
	"extract-motion": preset("extract-motion", "mp4", "Extract Motion Video", "video", {
		requiredEngine: "ffmpeg",
	}),

	"to-mp3": preset("to-mp3", "mp3", "MP3", "audio", { requiredEngine: "ffmpeg" }),
	"mp3-128": preset("mp3-128", "mp3", "MP3 128k", "audio", { requiredEngine: "ffmpeg" }),
	"to-m4a": preset("to-m4a", "m4a", "M4A", "audio", { requiredEngine: "ffmpeg" }),
	"to-wav": preset("to-wav", "wav", "WAV", "audio", { requiredEngine: "ffmpeg" }),
	"to-flac": preset("to-flac", "flac", "FLAC", "audio", { requiredEngine: "ffmpeg" }),
	"to-ogg": preset("to-ogg", "ogg", "OGG", "audio", { requiredEngine: "ffmpeg" }),
	"to-opus": preset("to-opus", "opus", "OPUS", "audio", { requiredEngine: "ffmpeg" }),
	"to-aac": preset("to-aac", "aac", "AAC", "audio", { requiredEngine: "ffmpeg" }),
	"to-alac": preset("to-alac", "m4a", "ALAC", "audio", { requiredEngine: "ffmpeg" }),
	"iphone-ringtone": preset("iphone-ringtone", "m4r", "Ringtone (M4R)", "audio", {
		requiredEngine: "ffmpeg",
	}),
	"same-audio": preset("same-audio", "*audio", "Same Audio", "audio", {
		requiredEngine: "ffmpeg",
		actionKind: "same-audio",
	}),
	"extract-audio": preset("extract-audio", "m4a", "Extract Audio", "audio", {
		requiredEngine: "ffmpeg",
		actionKind: "same-audio",
	}),
	"compress-audio": preset("compress-audio", "m4a", "Compress Audio", "audio", {
		requiredEngine: "ffmpeg",
	}),
	"merge-audio": preset("merge-audio", "m4a", "Merge Audio", "audio", {
		requiredEngine: "ffmpeg",
	}),
	"caption-video": preset("caption-video", "srt", "AI Captions", "subtitle", {
		requiredEngine: "whisper",
	}),
	"extract-subtitles": preset("extract-subtitles", "srt", "Extract Subtitles", "subtitle", {
		requiredEngine: "ffmpeg",
	}),

	// Subtitles
	"to-srt": preset("to-srt", "srt", "SRT", "subtitle"),
	"to-vtt": preset("to-vtt", "vtt", "WebVTT", "subtitle"),
	"to-ass": preset("to-ass", "ass", "ASS", "subtitle"),
	"to-smi": preset("to-smi", "smi", "SAMI", "subtitle"),
	"to-lrc": preset("to-lrc", "lrc", "LRC", "subtitle"),
	"to-ttml": preset("to-ttml", "ttml", "TTML", "subtitle"),

	// Archives & Folders
	"extract": preset("extract", "folder", "Extract", "folder", { actionKind: "extract" }),
	"zip-all": preset("zip-all", "zip", "One ZIP", "archive", { actionKind: "pack-zip" }),
	"to-zip": preset("to-zip", "zip", "ZIP", "archive"),
	"to-7z": preset("to-7z", "7z", "7Z", "archive"),
	"to-tgz": preset("to-tgz", "tgz", "TAR.GZ", "archive"),
	"to-tar": preset("to-tar", "tar", "TAR", "archive"),
	"to-iso": preset("to-iso", "iso", "ISO Image", "archive"),

	// CAD
	"to-dxf": preset("to-dxf", "dxf", "DXF", "cad"),
	"to-dwg": preset("to-dwg", "dwg", "DWG", "cad"),

	// Fonts
	"to-woff2": preset("to-woff2", "woff2", "WOFF2", "font"),
	"to-woff": preset("to-woff", "woff", "WOFF", "font"),
	"to-ttf": preset("to-ttf", "ttf", "TTF", "font"),
	"to-otf": preset("to-otf", "otf", "OTF", "font"),
	"to-eot": preset("to-eot", "eot", "EOT", "font"),

	// 3D models
	"to-glb": preset("to-glb", "glb", "GLB", "model3d"),
	"to-gltf": preset("to-gltf", "gltf", "glTF", "model3d"),
	"to-stl": preset("to-stl", "stl", "STL", "model3d"),
	"to-obj": preset("to-obj", "obj", "OBJ", "model3d"),
	"to-3mf": preset("to-3mf", "3mf", "3MF", "model3d"),
	"to-ply": preset("to-ply", "ply", "PLY", "model3d"),

	// Geospatial
	"to-geojson": preset("to-geojson", "geojson", "GeoJSON", "geospatial"),
	"to-shp": preset("to-shp", "shp", "Shapefile", "geospatial"),
	"to-kml": preset("to-kml", "kml", "KML", "geospatial"),
	"to-gpx": preset("to-gpx", "gpx", "GPX", "geospatial"),
	"to-kmz": preset("to-kmz", "kmz", "KMZ", "geospatial"),
};

/**
 * Factory two-sided donut layouts matching Filee's BuiltInData.CreateProfiles().
 */
export const DEFAULT_TOOLBAR_PROFILES: ToolbarProfile[] = [
	{
		id: "images",
		category: "image",
		label: "Images",
		primaryIds: ["to-png", "to-jpg", "to-webp", "to-gif", "to-pdf", "merge-pdf", "trace-svg"],
		secondaryIds: [
			"tool-crop",
			"rotate",
			"remove-background",
			"merge-images",
			"compress-image",
			"half-size",
			"tool-image-edit",
			"zip-all",
		],
	},
	{
		id: "pdf",
		category: "pdf",
		label: "PDF",
		primaryIds: ["to-png", "to-jpg", "to-docx", "to-xlsx", "pdf-slides", "to-txt", "to-hwpx", "to-hwp"],
		secondaryIds: [
			"pdf-edit",
			"pdf-split",
			"merge-pdf",
			"compress-pdf",
			"remove-metadata",
			"to-tiff",
			"to-html",
			"zip-all",
		],
	},
	{
		id: "office",
		category: "document",
		label: "Documents",
		primaryIds: ["to-pdf", "to-hwpx", "to-hwp", "to-docx", "to-txt", "to-png", "merge-pdf"],
		secondaryIds: ["translate", "to-md", "pdf-long-image", "zip-all"],
	},
	{
		id: "spreadsheets",
		category: "spreadsheet",
		label: "Spreadsheets",
		primaryIds: ["to-pdf", "to-xlsx", "to-csv", "to-hwpx", "to-hwp", "merge-pdf"],
		secondaryIds: ["tool-sheet-studio", "to-docx", "to-vcf", "to-ics", "zip-all"],
	},
	{
		id: "presentations",
		category: "presentation",
		label: "Presentations",
		primaryIds: ["to-pdf", "to-png", "to-jpg", "to-pptx", "to-hwpx", "to-hwp", "merge-pdf"],
		secondaryIds: ["to-odp", "pdf-long-image", "to-docx", "zip-all"],
	},
	{
		id: "hwp",
		category: "hwp",
		label: "HWP",
		primaryIds: ["to-pdf", "to-docx", "to-hwpx", "to-hwp", "to-png", "to-txt", "merge-pdf"],
		secondaryIds: ["to-html", "to-odt", "pdf-long-image", "zip-all"],
	},
	{
		id: "text",
		category: "text",
		label: "Text & Markup",
		primaryIds: ["to-pdf", "to-hwpx", "to-hwp", "to-docx", "to-html", "to-txt"],
		secondaryIds: ["translate", "to-md", "to-odt", "merge-pdf", "zip-all"],
	},
	{
		id: "ebooks",
		category: "ebook",
		label: "E-books",
		primaryIds: ["to-pdf", "to-epub", "to-docx", "to-txt", "to-azw3", "to-kepub"],
		secondaryIds: ["translate", "to-md", "zip-all"],
	},
	{
		id: "video",
		category: "video",
		label: "Video",
		primaryIds: ["to-mp4", "mp4-720", "to-mov", "to-gif", "to-mp3", "caption-video"],
		secondaryIds: [
			"tool-clip",
			"crop-video",
			"compress-video",
			"merge-videos",
			"remove-metadata",
			"mp4-av1",
			"extract-frames-png",
			"zip-all",
		],
	},
	{
		id: "audio",
		category: "audio",
		label: "Audio",
		primaryIds: ["to-mp3", "mp3-128", "to-m4a", "to-wav", "caption-video"],
		secondaryIds: ["compress-audio", "merge-audio", "remove-metadata", "to-alac", "zip-all"],
	},
	{
		id: "subtitles",
		category: "subtitle",
		label: "Subtitles",
		primaryIds: ["to-srt", "to-vtt"],
		secondaryIds: ["zip-all"],
	},
	{
		id: "vector",
		category: "vector",
		label: "Vector",
		primaryIds: ["to-png", "to-pdf", "to-svg", "to-jpg", "to-webp"],
		secondaryIds: ["to-tiff", "to-ico", "to-icns", "to-dxf", "zip-all"],
	},
	{
		id: "archives",
		category: "archive",
		label: "Archives",
		primaryIds: ["extract", "zip-all", "to-zip", "to-7z"],
		secondaryIds: [],
	},
	{
		id: "folders",
		category: "folder",
		label: "Folders",
		primaryIds: ["to-iso", "to-zip", "zip-all"],
		secondaryIds: [],
	},
	{
		id: "cad",
		category: "cad",
		label: "CAD",
		primaryIds: ["to-pdf", "to-png", "to-svg", "to-dxf", "to-dwg"],
		secondaryIds: ["to-jpg", "merge-pdf", "zip-all"],
	},
	{
		id: "fonts",
		category: "font",
		label: "Fonts",
		primaryIds: ["to-woff2", "to-woff", "to-ttf", "to-otf"],
		secondaryIds: ["zip-all"],
	},
	{
		id: "data",
		category: "data",
		label: "Data",
		primaryIds: ["to-json", "to-yaml", "to-xml", "to-csv", "to-xlsx"],
		secondaryIds: ["to-ods", "to-html", "to-md", "zip-all"],
	},
	{
		id: "models",
		category: "model3d",
		label: "3D Models",
		primaryIds: ["to-glb", "to-stl", "to-obj", "to-3mf", "to-png"],
		secondaryIds: ["zip-all"],
	},
	{
		id: "geo",
		category: "geospatial",
		label: "Geospatial",
		primaryIds: ["to-geojson", "to-shp", "to-kml", "to-csv", "to-gpx"],
		secondaryIds: ["zip-all"],
	},
	{
		id: "mixed",
		category: "mixed",
		label: "Mixed",
		primaryIds: ["to-pdf", "merge-pdf", "zip-all", "to-png", "to-txt"],
		secondaryIds: ["to-jpg", "to-docx"],
	},
];

const ARCHIVE_TARGET_FORMATS = new Set(["zip", "7z", "tar", "tgz", "tbz2", "txz", "iso"]);
const ARCHIVE_FALLBACK_IDS = ["zip-all", "to-zip", "to-7z", "to-tar", "to-tgz"];

const CATEGORY_COMPATIBLE_TARGETS: Record<FileCategory, Set<string>> = {
	image: new Set([
		"png", "jpg", "webp", "gif", "tiff", "bmp", "ico", "avif", "heic", "jxl",
		"psd", "tga", "icns", "vtf", "pdf", "svg", "eps", "ps", "dxf", "dwg", "mp4", "*",
	]),
	vector: new Set([
		"png", "jpg", "webp", "gif", "tiff", "bmp", "ico", "icns", "avif", "heic",
		"pdf", "svg", "svgz", "eps", "ps", "dxf", "dwg", "odg",
	]),
	pdf: new Set([
		"png", "jpg", "webp", "tiff", "bmp", "gif", "docx", "xlsx", "pptx", "txt",
		"md", "html", "hwpx", "hwp", "odt", "rtf", "epub", "cbz", "svg", "eps", "ps",
		"odg", "pdf", "*",
	]),
	document: new Set([
		"pdf", "docx", "docm", "dotx", "dotm", "odt", "rtf", "eml", "txt", "md",
		"html", "hwpx", "hwp", "epub", "fb2", "kepub", "azw3", "mobi", "png", "jpg",
		"webp", "tiff", "*",
	]),
	spreadsheet: new Set([
		"pdf", "xlsx", "xlsm", "xltx", "ods", "csv", "tsv", "json", "yaml", "xml",
		"html", "md", "txt", "docx", "hwpx", "hwp", "vcf", "ics", "png", "jpg", "tiff",
	]),
	presentation: new Set([
		"pdf", "pptx", "pptm", "potx", "potm", "ppsx", "odp", "png", "jpg", "webp",
		"tiff", "docx", "hwpx", "hwp", "txt", "html", "md",
	]),
	hwp: new Set([
		"pdf", "docx", "hwpx", "hwp", "odt", "rtf", "txt", "md", "html", "epub",
		"png", "jpg", "webp", "tiff",
	]),
	text: new Set([
		"pdf", "docx", "odt", "rtf", "txt", "md", "html", "hwpx", "hwp", "epub",
		"fb2", "kepub", "azw3", "mobi", "pptx", "rst", "tex", "org", "adoc", "typ",
		"ipynb", "png", "jpg", "tiff", "*",
	]),
	ebook: new Set([
		"pdf", "epub", "kepub", "azw3", "mobi", "fb2", "cbz", "docx", "odt", "rtf",
		"txt", "md", "html", "hwpx", "hwp", "png", "jpg", "*",
	]),
	video: new Set([
		"mp4", "mov", "mkv", "webm", "avi", "gif", "webp", "mp3", "m4a", "wav",
		"flac", "ogg", "opus", "aac", "m4r", "*audio", "srt", "png", "jpg", "*",
	]),
	audio: new Set([
		"mp3", "m4a", "wav", "flac", "ogg", "opus", "aac", "m4r", "srt", "*",
	]),
	subtitle: new Set(["srt", "vtt", "ass", "smi", "lrc", "ttml", "txt"]),
	archive: new Set(["folder", "zip", "7z", "tar", "tgz", "tbz2", "txz", "iso"]),
	cad: new Set(["pdf", "png", "jpg", "webp", "tiff", "svg", "dxf", "dwg"]),
	font: new Set(["woff2", "woff", "ttf", "otf", "eot"]),
	data: new Set(["json", "yaml", "toml", "xml", "csv", "tsv", "xlsx", "ods", "html", "md", "txt", "pdf"]),
	model3d: new Set(["glb", "gltf", "stl", "obj", "3mf", "ply", "smd", "png", "jpg", "webp", "pdf"]),
	geospatial: new Set(["geojson", "shp", "kml", "kmz", "gpx", "csv", "json"]),
	folder: new Set(["iso", "zip", "7z", "tar", "tgz"]),
	mixed: new Set(["zip", "7z", "tar", "tgz", "tbz2", "txz", "iso"]),
};

const LIBREOFFICE_SOURCE_FORMATS = new Set([
	"doc", "dot", "odt", "fodt", "ott", "rtf", "wps", "wpd", "lwp", "abw",
	"pages", "sdw", "cwk", "mcw", "602", "psw", "pub",
	"xls", "xlt", "ods", "ots", "fods", "et", "numbers", "sdc",
	"ppt", "pps", "pot", "odp", "otp", "fodp", "key", "dps", "sda",
	"cdr", "vsd", "cgm", "odg", "fodg", "emf", "wmf",
]);

const PANDOC_SOURCE_FORMATS = new Set([
	"rst", "tex", "org", "adoc", "typ", "mediawiki", "dbk", "ipynb", "textile", "man", "opml",
]);

const CALIBRE_SOURCE_FORMATS = new Set([
	"lit", "lrf", "chm", "pdb", "pml", "rb", "snb", "tcr", "oeb",
]);

const GHOSTSCRIPT_SOURCE_FORMATS = new Set(["eps", "ps"]);

interface ClassifiedInput {
	extension: string;
	formatId: string | null;
	category: FileCategory;
}

/**
 * Extracts a normalized lowercase extension without leading dot, checking
 * Filee's two-part compound extensions (e.g. `tar.gz`, `kepub.epub`) first.
 * Paths ending in `/` or `\\`, or extensionless names, return `""`.
 */
export function extractExtension(filePath: string): string {
	const trimmed = filePath.trim();
	if (!trimmed || trimmed.endsWith("/") || trimmed.endsWith("\\")) {
		return "";
	}

	const lastSlash = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
	const baseName = lastSlash >= 0 ? trimmed.slice(lastSlash + 1) : trimmed;
	if (!baseName || baseName === "." || baseName === "..") {
		return "";
	}

	const lower = baseName.toLowerCase();
	for (const compound of COMPOUND_EXTENSIONS) {
		if (
			(lower.length > compound.length + 1 && lower.endsWith(`.${compound}`)) ||
			lower === `.${compound}`
		) {
			return compound;
		}
	}

	const lastDot = lower.lastIndexOf(".");
	if (lastDot === -1 || lastDot === lower.length - 1) {
		return "";
	}
	return lower.slice(lastDot + 1);
}

function classifyPath(filePath: string): ClassifiedInput {
	const trimmed = filePath.trim();
	if (trimmed.endsWith("/") || trimmed.endsWith("\\") || trimmed.toLowerCase() === "folder") {
		return { extension: "", formatId: "folder", category: "folder" };
	}

	const extension = extractExtension(trimmed);
	if (!extension) {
		return { extension: "", formatId: null, category: "mixed" };
	}

	const info = EXTENSION_CATEGORY[extension];
	if (!info) {
		return { extension, formatId: null, category: "mixed" };
	}

	return {
		extension,
		formatId: info.formatId,
		category: info.category,
	};
}

function isOptionCompatibleWithInput(option: TargetOption, input: ClassifiedInput): boolean {
	if (option.actionKind === "pack-zip" || ARCHIVE_TARGET_FORMATS.has(option.format)) {
		return true;
	}
	if (!input.formatId || input.category === "mixed") {
		return false;
	}
	return CATEGORY_COMPATIBLE_TARGETS[input.category]?.has(option.format) ?? false;
}

function resolveRequiredEngine(option: TargetOption, inputs: ClassifiedInput[]): string | undefined {
	if (option.actionKind === "pack-zip" || option.actionKind === "extract") {
		return undefined;
	}
	if (ARCHIVE_TARGET_FORMATS.has(option.format)) {
		return undefined;
	}
	if (option.requiredEngine) {
		return option.requiredEngine;
	}

	for (const input of inputs) {
		if (input.category === "video" || input.category === "audio") {
			return "ffmpeg";
		}
		if (input.formatId && GHOSTSCRIPT_SOURCE_FORMATS.has(input.formatId)) {
			return "ghostscript";
		}
		if (input.formatId && CALIBRE_SOURCE_FORMATS.has(input.formatId)) {
			return "calibre";
		}
		if (input.formatId === "pdf" && (option.format === "svg" || option.format === "odg" || option.format === "emf" || option.format === "wmf")) {
			return "libreoffice";
		}
		if (input.formatId && PANDOC_SOURCE_FORMATS.has(input.formatId)) {
			return "pandoc";
		}
		if (
			option.format === "md" &&
			(input.formatId === "docx" || input.formatId === "odt" || input.formatId === "rtf")
		) {
			return "pandoc";
		}
		if (input.formatId && LIBREOFFICE_SOURCE_FORMATS.has(input.formatId)) {
			return "libreoffice";
		}
	}

	if (option.format === "odt" || option.format === "odp") {
		return "libreoffice";
	}
	return undefined;
}

function resolveOption(
	presetId: string,
	catalog: Record<string, TargetOption>,
	inputs: ClassifiedInput[],
): TargetOption | null {
	const base = catalog[presetId];
	if (!base) {
		return null;
	}
	const requiredEngine = resolveRequiredEngine(base, inputs);
	if (requiredEngine === base.requiredEngine) {
		return { ...base };
	}
	const resolved: TargetOption = { ...base };
	if (requiredEngine !== undefined) {
		resolved.requiredEngine = requiredEngine;
	} else {
		delete resolved.requiredEngine;
	}
	return resolved;
}

function findProfile(category: FileCategory, customProfiles?: ToolbarProfile[]): ToolbarProfile {
	const fromCustom = customProfiles?.find((p) => p.category === category);
	if (fromCustom) {
		return fromCustom;
	}
	return (
		DEFAULT_TOOLBAR_PROFILES.find((p) => p.category === category) ??
		DEFAULT_TOOLBAR_PROFILES[DEFAULT_TOOLBAR_PROFILES.length - 1]
	);
}

function appendUniqueTargets(
	target: TargetOption[],
	ids: string[],
	seenFormats: Set<string>,
	catalog: Record<string, TargetOption>,
	inputs: ClassifiedInput[],
): void {
	for (const id of ids) {
		const option = resolveOption(id, catalog, inputs);
		if (!option) {
			continue;
		}
		const key = `${option.presetId ?? ""}:${option.format}`;
		if (seenFormats.has(key)) {
			continue;
		}
		seenFormats.add(key);
		target.push(option);
	}
}

/**
 * Matches dropped file paths against Filee's local format registry and toolbar
 * profiles in <1 ms with zero subprocess overhead.
 */
export function matchFormatsForPaths(
	paths: string[],
	profiles?: ToolbarProfile[],
	extraPresets?: Record<string, TargetOption>,
): DonutSides {
	const catalog: Record<string, TargetOption> = extraPresets
		? { ...DEFAULT_PRESET_CATALOG, ...extraPresets }
		: DEFAULT_PRESET_CATALOG;

	if (paths.length === 0) {
		const archiveFallbacks = ARCHIVE_FALLBACK_IDS
			.map((id) => resolveOption(id, catalog, []))
			.filter((o): o is TargetOption => o !== null);
		return {
			primary: archiveFallbacks,
			secondary: [],
			detectedCategory: "mixed",
		};
	}

	const inputs = paths.map(classifyPath);
	const categories = new Set(inputs.map((i) => i.category));
	const detectedCategory: FileCategory =
		categories.size === 1 ? inputs[0].category : "mixed";

	const profile = findProfile(detectedCategory, profiles);

	if (detectedCategory !== "mixed") {
		const primary = profile.primaryIds
			.map((id) => resolveOption(id, catalog, inputs))
			.filter((o): o is TargetOption => o !== null);
		const secondary = profile.secondaryIds
			.map((id) => resolveOption(id, catalog, inputs))
			.filter((o): o is TargetOption => o !== null);

		return {
			primary,
			secondary,
			detectedCategory,
		};
	}

	// Mixed or unknown inputs: intersect compatible targets across every file
	// and always guarantee archive fallback targets (`zip`, `7z`, `tar`, `tgz`).
	const primary = profile.primaryIds
		.map((id) => resolveOption(id, catalog, inputs))
		.filter((o): o is TargetOption => o !== null)
		.filter((o) => inputs.every((input) => isOptionCompatibleWithInput(o, input)));

	const secondary = profile.secondaryIds
		.map((id) => resolveOption(id, catalog, inputs))
		.filter((o): o is TargetOption => o !== null)
		.filter((o) => inputs.every((input) => isOptionCompatibleWithInput(o, input)));

	const seenKeys = new Set(
		[...primary, ...secondary].map((o) => `${o.presetId ?? ""}:${o.format}`),
	);

	const hasNonArchiveConversion = primary.some(
		(o) => o.actionKind !== "pack-zip" && !ARCHIVE_TARGET_FORMATS.has(o.format),
	);

	if (!hasNonArchiveConversion) {
		appendUniqueTargets(primary, ARCHIVE_FALLBACK_IDS, seenKeys, catalog, inputs);
	} else {
		appendUniqueTargets(secondary, ARCHIVE_FALLBACK_IDS, seenKeys, catalog, inputs);
	}

	return {
		primary,
		secondary,
		detectedCategory: "mixed",
	};
}

export function detectInputCategory(pathOrExt: string): FileCategory {
	const trimmed = pathOrExt.trim();
	if (!trimmed) return "mixed";
	const bareLower = trimmed.toLowerCase().replace(/^\./, "");
	if (bareLower === "folder" || trimmed.endsWith("/") || trimmed.endsWith("\\")) {
		return "folder";
	}
	if (!trimmed.includes(".") && !trimmed.includes("/") && !trimmed.includes("\\")) {
		return EXTENSION_CATEGORY[bareLower]?.category ?? "mixed";
	}
	return classifyPath(trimmed).category;
}

export function getCompatibleCatalogIdsForCategory(category: FileCategory): string[] {
	const compatSet = CATEGORY_COMPATIBLE_TARGETS[category];
	return Object.entries(DEFAULT_PRESET_CATALOG)
		.filter(([, opt]) => {
			if (category === "mixed") {
				return (
					opt.actionKind === "pack-zip" ||
					ARCHIVE_TARGET_FORMATS.has(opt.format) ||
					opt.format === "pdf" ||
					opt.format === "png" ||
					opt.format === "jpg" ||
					opt.format === "docx" ||
					opt.format === "txt"
				);
			}
			if (opt.actionKind === "pack-zip" || ARCHIVE_TARGET_FORMATS.has(opt.format)) {
				return true;
			}
			if (opt.format === "*") {
				return opt.category === category;
			}
			return Boolean(compatSet?.has(opt.format));
		})
		.map(([id]) => id);
}

export function buildCustomMatcherInputs(state: ConverterState | null | undefined): {
	profiles: ToolbarProfile[] | undefined;
	extraPresets: Record<string, TargetOption> | undefined;
	presetsById: Map<string, ConverterPresetConfig>;
} {
	const presetsById = new Map<string, ConverterPresetConfig>();
	if (!state) {
		return { profiles: undefined, extraPresets: undefined, presetsById };
	}

	const profiles: ToolbarProfile[] | undefined =
		state.profiles.length > 0
			? state.profiles.map((p) => {
					const cat: FileCategory =
						p.category in CATEGORY_COMPATIBLE_TARGETS
							? (p.category as FileCategory)
							: "mixed";
					return {
						id: p.id,
						category: cat,
						label: p.label,
						primaryIds: [...p.primary_ids],
						secondaryIds: [...p.secondary_ids],
					};
				})
			: undefined;

	let extraPresets: Record<string, TargetOption> | undefined;
	if (state.presets.length > 0) {
		extraPresets = {};
		const defaultOptions = Object.values(DEFAULT_PRESET_CATALOG);
		for (const presetCfg of state.presets) {
			if (!presetCfg.id.trim()) continue;
			presetsById.set(presetCfg.id, presetCfg);

			const builtIn = DEFAULT_PRESET_CATALOG[presetCfg.id];
			const cleanFmt = presetCfg.target_format.trim().toLowerCase().replace(/^\./, "");

			if (builtIn) {
				const opt: TargetOption = {
					...builtIn,
					format: cleanFmt || builtIn.format,
					label: presetCfg.name.trim() || builtIn.label,
					presetId: presetCfg.id,
				};
				if (presetCfg.quality !== null && presetCfg.quality !== undefined) {
					opt.quality = presetCfg.quality;
				} else {
					delete opt.quality;
				}
				extraPresets[presetCfg.id] = opt;
			} else if (cleanFmt) {
				const template = defaultOptions.find((o) => o.format === cleanFmt);
				const inferredCategory =
					EXTENSION_CATEGORY[cleanFmt]?.category ?? template?.category ?? "mixed";
				const opt: TargetOption = {
					format: cleanFmt,
					label: presetCfg.name.trim() || cleanFmt.toUpperCase(),
					category: inferredCategory,
					actionKind: "convert",
					presetId: presetCfg.id,
				};
				if (template?.requiredEngine) {
					opt.requiredEngine = template.requiredEngine;
				}
				if (presetCfg.quality !== null && presetCfg.quality !== undefined) {
					opt.quality = presetCfg.quality;
				}
				extraPresets[presetCfg.id] = opt;
			}
		}
	}

	return { profiles, extraPresets, presetsById };
}

export function buildConvertRequestFromOption(params: {
	jobId: string;
	inputs: string[];
	option: TargetOption;
	outputDir: string | null;
	presetsById?: Map<string, ConverterPresetConfig>;
	crop?: CropBox | null;
}): ConvertRequest {
	const { jobId, inputs, option, outputDir, presetsById, crop } = params;
	const presetCfg = option.presetId ? presetsById?.get(option.presetId) : undefined;
	const builtIn = option.presetId ? DEFAULT_PRESET_CATALOG[option.presetId] : undefined;

	const rawFormat =
		presetCfg?.target_format?.trim() ||
		(option.format === "*audio" ? "same-audio" : option.format);
	const normalizedFormat = rawFormat.replace(/^\./, "").toLowerCase();

	const useBuiltInPreset = Boolean(
		builtIn &&
			(!presetCfg ||
				presetCfg.target_format.trim().replace(/^\./, "").toLowerCase() ===
					builtIn.format.toLowerCase()),
	);

	const splitEvery =
		presetCfg?.split_every && presetCfg.split_every > 0 ? presetCfg.split_every : null;
	const splitParts =
		!splitEvery && presetCfg?.split_parts && presetCfg.split_parts >= 2
			? presetCfg.split_parts
			: null;

	const conflict = presetCfg?.conflict?.trim().toLowerCase() || null;
	const isIso = normalizedFormat === "iso";

	return {
		job_id: jobId,
		inputs,
		to: normalizedFormat,
		preset: useBuiltInPreset ? (builtIn?.presetId ?? option.presetId ?? null) : null,
		output_dir: outputDir,
		quality: presetCfg ? (presetCfg.quality ?? null) : (option.quality ?? null),
		pages: presetCfg?.pages?.trim() || null,
		split_every: splitEvery,
		split_parts: splitParts,
		conflict,
		overwrite: conflict === "overwrite" ? true : null,
		keep_dates: presetCfg?.keep_dates ?? null,
		zip: presetCfg?.zip ?? null,
		iso_filesystem: isIso ? presetCfg?.iso_filesystem?.trim() || null : null,
		iso_label: isIso ? presetCfg?.iso_label?.trim() || null : null,
		...(crop ? { crop } : null),
	};
}
