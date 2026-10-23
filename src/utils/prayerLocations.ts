export interface CityItem {
	name: string;
	nameAr: string;
}

export interface CountryItem {
	country: string;
	countryAr: string;
	cities: CityItem[];
}

export const POPULAR_PRAYER_COUNTRIES: readonly CountryItem[] = [
	{
		country: "Saudi Arabia",
		countryAr: "المملكة العربية السعودية",
		cities: [
			{ name: "Riyadh", nameAr: "الرياض" },
			{ name: "Makkah", nameAr: "مكة المكرمة" },
			{ name: "Madinah", nameAr: "المدينة المنورة" },
			{ name: "Jeddah", nameAr: "جدة" },
			{ name: "Dammam", nameAr: "الدمام" },
			{ name: "Taif", nameAr: "الطائف" },
			{ name: "Tabuk", nameAr: "تبوك" },
			{ name: "Buraidah", nameAr: "بريدة" },
			{ name: "Al Khobar", nameAr: "الخبر" },
			{ name: "Abha", nameAr: "أبها" },
			{ name: "Hail", nameAr: "حائل" },
			{ name: "Najran", nameAr: "نجران" },
			{ name: "Jizan", nameAr: "جازان" },
			{ name: "Yanbu", nameAr: "ينبع" }
		]
	},
	{
		country: "Egypt",
		countryAr: "جمهورية مصر العربية",
		cities: [
			{ name: "Cairo", nameAr: "القاهرة" },
			{ name: "Alexandria", nameAr: "الإسكندرية" },
			{ name: "Giza", nameAr: "الجيزة" },
			{ name: "Mansoura", nameAr: "المنصورة" },
			{ name: "Tanta", nameAr: "طنطا" },
			{ name: "Port Said", nameAr: "بور سعيد" },
			{ name: "Suez", nameAr: "السويس" },
			{ name: "Luxor", nameAr: "الأقصر" },
			{ name: "Aswan", nameAr: "أسوان" },
			{ name: "Zagazig", nameAr: "الزقازيق" },
			{ name: "Ismailia", nameAr: "الإسماعيلية" },
			{ name: "Asyut", nameAr: "أسيوط" },
			{ name: "Faiyum", nameAr: "الفيوم" }
		]
	},
	{
		country: "United Arab Emirates",
		countryAr: "الإمارات العربية المتحدة",
		cities: [
			{ name: "Dubai", nameAr: "دبي" },
			{ name: "Abu Dhabi", nameAr: "أبو ظبي" },
			{ name: "Sharjah", nameAr: "الشارقة" },
			{ name: "Ajman", nameAr: "عجمان" },
			{ name: "Ras Al Khaimah", nameAr: "رأس الخيمة" },
			{ name: "Fujairah", nameAr: "الفجيرة" },
			{ name: "Umm Al Quwain", nameAr: "أم القيوين" },
			{ name: "Al Ain", nameAr: "العين" }
		]
	},
	{
		country: "Kuwait",
		countryAr: "دولة الكويت",
		cities: [
			{ name: "Kuwait City", nameAr: "مدينة الكويت" },
			{ name: "Hawalli", nameAr: "حولي" },
			{ name: "Al Ahmadi", nameAr: "الأحمدي" },
			{ name: "Salmiya", nameAr: "السالمية" },
			{ name: "Farwaniya", nameAr: "الفروانية" },
			{ name: "Jahra", nameAr: "الجهراء" }
		]
	},
	{
		country: "Qatar",
		countryAr: "دولة قطر",
		cities: [
			{ name: "Doha", nameAr: "الدوحة" },
			{ name: "Al Rayyan", nameAr: "الريان" },
			{ name: "Al Wakrah", nameAr: "الوكرة" },
			{ name: "Al Khor", nameAr: "الخور" },
			{ name: "Umm Salal", nameAr: "أم صلال" }
		]
	},
	{
		country: "Bahrain",
		countryAr: "مملكة البحرين",
		cities: [
			{ name: "Manama", nameAr: "المنامة" },
			{ name: "Riffa", nameAr: "الرفاع" },
			{ name: "Muharraq", nameAr: "المحرق" },
			{ name: "Hamad Town", nameAr: "مدينة حمد" },
			{ name: "Isa Town", nameAr: "مدينة عيسى" }
		]
	},
	{
		country: "Oman",
		countryAr: "سلطنة عُمان",
		cities: [
			{ name: "Muscat", nameAr: "مسقط" },
			{ name: "Salalah", nameAr: "صلالة" },
			{ name: "Sohar", nameAr: "صحار" },
			{ name: "Nizwa", nameAr: "نزوى" },
			{ name: "Sur", nameAr: "صور" },
			{ name: "Seeb", nameAr: "السيب" }
		]
	},
	{
		country: "Jordan",
		countryAr: "المملكة الأردنية الهاشمية",
		cities: [
			{ name: "Amman", nameAr: "عمان" },
			{ name: "Zarqa", nameAr: "الزرقاء" },
			{ name: "Irbid", nameAr: "إربد" },
			{ name: "Aqaba", nameAr: "العقبة" },
			{ name: "Salt", nameAr: "السلط" },
			{ name: "Madaba", nameAr: "مادبا" }
		]
	},
	{
		country: "Palestine",
		countryAr: "دولة فلسطين",
		cities: [
			{ name: "Jerusalem", nameAr: "القدس الشريف" },
			{ name: "Gaza", nameAr: "غزة" },
			{ name: "Ramallah", nameAr: "رام الله" },
			{ name: "Nablus", nameAr: "نابلس" },
			{ name: "Hebron", nameAr: "الخليل" },
			{ name: "Jenin", nameAr: "جنين" },
			{ name: "Bethlehem", nameAr: "بيت لحم" }
		]
	},
	{
		country: "Morocco",
		countryAr: "المملكة المغربية",
		cities: [
			{ name: "Casablanca", nameAr: "الدار البيضاء" },
			{ name: "Rabat", nameAr: "الرباط" },
			{ name: "Marrakech", nameAr: "مراكش" },
			{ name: "Fes", nameAr: "فاس" },
			{ name: "Tangier", nameAr: "طنجة" },
			{ name: "Agadir", nameAr: "أكادير" },
			{ name: "Meknes", nameAr: "مكناس" }
		]
	},
	{
		country: "Algeria",
		countryAr: "الجمهورية الجزائرية",
		cities: [
			{ name: "Algiers", nameAr: "الجزائر العاصمة" },
			{ name: "Oran", nameAr: "وهران" },
			{ name: "Constantine", nameAr: "قسنطينة" },
			{ name: "Annaba", nameAr: "عنابة" },
			{ name: "Blida", nameAr: "البليدة" },
			{ name: "Setif", nameAr: "سطيف" }
		]
	},
	{
		country: "Tunisia",
		countryAr: "الجمهورية التونسية",
		cities: [
			{ name: "Tunis", nameAr: "تونس العاصمة" },
			{ name: "Sfax", nameAr: "صفاقس" },
			{ name: "Sousse", nameAr: "سوسة" },
			{ name: "Kairouan", nameAr: "القيروان" },
			{ name: "Bizerte", nameAr: "بنزرت" }
		]
	},
	{
		country: "Iraq",
		countryAr: "جمهورية العراق",
		cities: [
			{ name: "Baghdad", nameAr: "بغداد" },
			{ name: "Basra", nameAr: "البصرة" },
			{ name: "Mosul", nameAr: "الموصل" },
			{ name: "Erbil", nameAr: "أربيل" },
			{ name: "Najaf", nameAr: "النجف" },
			{ name: "Karbala", nameAr: "كربلاء" }
		]
	},
	{
		country: "Turkey",
		countryAr: "الجمهورية التركية",
		cities: [
			{ name: "Istanbul", nameAr: "إسطنبول" },
			{ name: "Ankara", nameAr: "أنقرة" },
			{ name: "Izmir", nameAr: "إزمير" },
			{ name: "Bursa", nameAr: "بورصة" },
			{ name: "Antalya", nameAr: "أنطاليا" },
			{ name: "Konya", nameAr: "قونية" }
		]
	},
	{
		country: "Syria",
		countryAr: "الجمهورية العربية السورية",
		cities: [
			{ name: "Damascus", nameAr: "دمشق" },
			{ name: "Aleppo", nameAr: "حلب" },
			{ name: "Homs", nameAr: "حمص" },
			{ name: "Latakia", nameAr: "اللاذقية" }
		]
	},
	{
		country: "Lebanon",
		countryAr: "الجمهورية اللبنانية",
		cities: [
			{ name: "Beirut", nameAr: "بيروت" },
			{ name: "Tripoli", nameAr: "طرابلس" },
			{ name: "Sidon", nameAr: "صيدا" }
		]
	},
	{
		country: "Yemen",
		countryAr: "الجمهورية اليمنية",
		cities: [
			{ name: "Sana'a", nameAr: "صنعاء" },
			{ name: "Aden", nameAr: "عدن" },
			{ name: "Taiz", nameAr: "تعز" },
			{ name: "Mukalla", nameAr: "المكلا" }
		]
	},
	{
		country: "Libya",
		countryAr: "دولة ليبيا",
		cities: [
			{ name: "Tripoli", nameAr: "طرابلس الغرب" },
			{ name: "Benghazi", nameAr: "بنغازي" },
			{ name: "Misrata", nameAr: "مصراتة" }
		]
	},
	{
		country: "Sudan",
		countryAr: "جمهورية السودان",
		cities: [
			{ name: "Khartoum", nameAr: "الخرطوم" },
			{ name: "Omdurman", nameAr: "أم درمان" },
			{ name: "Port Sudan", nameAr: "بورتسودان" }
		]
	},
	{
		country: "United Kingdom",
		countryAr: "المملكة المتحدة",
		cities: [
			{ name: "London", nameAr: "لندن" },
			{ name: "Birmingham", nameAr: "برمنغهام" },
			{ name: "Manchester", nameAr: "مانشستر" },
			{ name: "Leeds", nameAr: "ليدز" },
			{ name: "Glasgow", nameAr: "غلاسكو" }
		]
	},
	{
		country: "United States",
		countryAr: "الولايات المتحدة الأمريكية",
		cities: [
			{ name: "New York", nameAr: "نيويورك" },
			{ name: "Los Angeles", nameAr: "لوس أنجلوس" },
			{ name: "Chicago", nameAr: "شيكاغو" },
			{ name: "Houston", nameAr: "هيوستن" },
			{ name: "Dallas", nameAr: "دالاس" },
			{ name: "Washington DC", nameAr: "واشنطن" }
		]
	},
	{
		country: "Canada",
		countryAr: "كندا",
		cities: [
			{ name: "Toronto", nameAr: "تورونتو" },
			{ name: "Montreal", nameAr: "مونتريال" },
			{ name: "Vancouver", nameAr: "فانكوفر" },
			{ name: "Calgary", nameAr: "كالغاري" },
			{ name: "Ottawa", nameAr: "أوتاوا" }
		]
	},
	{
		country: "Germany",
		countryAr: "ألمانيا",
		cities: [
			{ name: "Berlin", nameAr: "برلين" },
			{ name: "Munich", nameAr: "ميونخ" },
			{ name: "Frankfurt", nameAr: "فرانكفورت" },
			{ name: "Hamburg", nameAr: "هامبورغ" },
			{ name: "Cologne", nameAr: "كولونيا" }
		]
	},
	{
		country: "France",
		countryAr: "فرنسا",
		cities: [
			{ name: "Paris", nameAr: "باريس" },
			{ name: "Marseille", nameAr: "مارسيليا" },
			{ name: "Lyon", nameAr: "ليون" },
			{ name: "Toulouse", nameAr: "تولوز" }
		]
	},
	{
		country: "Pakistan",
		countryAr: "باكستان",
		cities: [
			{ name: "Karachi", nameAr: "كراتشي" },
			{ name: "Lahore", nameAr: "لاهور" },
			{ name: "Islamabad", nameAr: "إسلام آباد" },
			{ name: "Rawalpindi", nameAr: "راولبندي" }
		]
	},
	{
		country: "Indonesia",
		countryAr: "إندونيسيا",
		cities: [
			{ name: "Jakarta", nameAr: "جاكرتا" },
			{ name: "Surabaya", nameAr: "سورابايا" },
			{ name: "Bandung", nameAr: "باندونغ" },
			{ name: "Medan", nameAr: "ميدان" }
		]
	},
	{
		country: "Malaysia",
		countryAr: "ماليزيا",
		cities: [
			{ name: "Kuala Lumpur", nameAr: "كوالالمبور" },
			{ name: "George Town", nameAr: "جورج تاون" },
			{ name: "Johor Bahru", nameAr: "جوهر بهرو" }
		]
	}
];

export function findCountry(countryName: string): CountryItem | undefined {
	if (!countryName) return undefined;
	const lower = countryName.toLowerCase().trim();
	return POPULAR_PRAYER_COUNTRIES.find(
		(c) =>
			c.country.toLowerCase() === lower ||
			c.countryAr.toLowerCase() === lower ||
			c.country.toLowerCase().includes(lower) ||
			lower.includes(c.country.toLowerCase())
	);
}
