/**
 * Arabic text shown by the prayer features. Kept apart from the logic so it
 * can be swapped for a translation layer later.
 */
import type { PrayerKey } from "./prayerSchedule";

export const PRAYER_NAMES_AR: Record<PrayerKey, string> = {
	Fajr: "الفجر",
	Dhuhr: "الظهر",
	Asr: "العصر",
	Maghrib: "المغرب",
	Isha: "العشاء"
};

export const PRAYER_REMINDERS: Record<PrayerKey, string> = {
	Fajr: "الصلاة خير من النوم.. ركعتا الفجر خير من الدنيا وما فيها، ابدأ يومك بنور الله وتوفيقه.",
	Dhuhr: "حي على الفلاح.. مشاغل الدنيا تنتظر، ولقاء الله لا ينتظر. قف بين يدي ربك ترتاح نفسك.",
	Asr: "حافظوا على الصلوات والصلاة الوسطى.. لا تبع آخرتك بلحظة انشغال، كل عمل ينتظر إلا الصلاة.",
	Maghrib: "أرحنا بها يا بلال.. انقضى نهارك فتوّجه بطاعة ربك، إن الصلاة كانت على المؤمنين كتاباً موقوتاً.",
	Isha: "ختام يومك نور وبركة.. من صلّى العشاء في جماعة فكأنما قام نصف الليل، لا تؤجل صلاتك."
};

export const PRAYER_STATUS_AR = {
	nextPrayer: "الصلاة القادمة",
	remaining: "متبقي",
	autoLocation: "تحديد تلقائي",
	refresh: "تحديث المواقيت",
	title: "مواقيت الصلاة",
	athanPlaying: "أذان",
	stop: "إيقاف",
	stopTitle: "إيقاف الأذان",
	errorLocation: "تعذّر تحديد موقعك. اختر المدينة من الإعدادات.",
	errorNetwork: "تعذّر تحديث المواقيت. تحقق من الاتصال.",
	errorInvalid: "وصلت بيانات غير مفهومة. أعد المحاولة.",
	stale: "المواقيت قديمة، جارٍ إعادة المحاولة"
} as const;
