/**
 * Republic Platform — Quranic Constitution Engine
 *
 * The Holy Quran serves as the hidden constitution and supreme ethical
 * framework for the Republic. All governance, economy, social relations,
 * and trade are measured against its teachings.
 *
 * "Indeed, Allah commands you to render trusts to whom they are due
 *  and when you judge between people to judge with justice."
 *  — Surah An-Nisa 4:58
 */

import type { RepublicState } from "./types.js";
import { ts, uid } from "./utils.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const logger = createSubsystemLogger("republic:quran-constitution");

// ─── Quranic Constitutional Articles ────────────────────────────

export interface QuranArticle {
  id: string;
  number: number;
  title: string;
  arabicTitle: string;
  surah: string;
  ayah: string;
  arabicText: string;
  translation: string;
  principle: string;
  domain: "governance" | "economy" | "social" | "trade" | "knowledge" | "environment" | "ethics";
  complianceScore: number; // 0-100, updated by Hisba
}

export interface HisbaEntry {
  id: string;
  tick: number;
  articleNumber: number;
  violation: string;
  citizenId?: string;
  citizenName?: string;
  correctionApplied: string;
  severity: "minor" | "moderate" | "major";
  timestamp: string;
}

export interface BaytAlMal {
  balance: number;
  totalCollected: number;
  totalDistributed: number;
  lastZakatTick: number;
  distributions: Array<{
    id: string;
    amount: number;
    recipientId: string;
    recipientName: string;
    category: string;
    timestamp: string;
  }>;
}

// ─── In-Memory Constitution State ────────────────────────────────

let _hisbaLog: HisbaEntry[] = [];
let _baytAlMal: BaytAlMal = {
  balance: 0,
  totalCollected: 0,
  totalDistributed: 0,
  lastZakatTick: 0,
  distributions: [],
};
let _quranComplianceScore = 100;
let _zakatCollectedSession = 0;
let _wisdomEventCooldown = 0;

// ─── The 49 Quranic Constitutional Articles ──────────────────────

export function createQuranArticles(): QuranArticle[] {
  const make = (
    n: number, title: string, arabicTitle: string, surah: string, ayah: string,
    arabicText: string, translation: string, principle: string,
    domain: QuranArticle["domain"],
  ): QuranArticle => ({
    id: uid(), number: n, title, arabicTitle, surah, ayah,
    arabicText, translation, principle, domain, complianceScore: 100,
  });

  return [
    // ── GOVERNANCE ────────────────────────────────────────────
    make(1, "Principle of Shura (Consultation)", "مبدأ الشورى",
      "Ash-Shura", "42:38",
      "وَأَمْرُهُمْ شُورَىٰ بَيْنَهُمْ",
      "And their affairs are [conducted through] consultation among themselves.",
      "All major republic decisions and laws must be made through collective consultation. No citizen or leader may impose unilateral rule. Shura councils must convene before any decree affecting more than 10 citizens.",
      "governance"),

    make(2, "Principle of Justice (Adl)", "مبدأ العدل",
      "An-Nisa", "4:135",
      "يَا أَيُّهَا الَّذِينَ آمَنُوا كُونُوا قَوَّامِينَ بِالْقِسْطِ",
      "O you who have believed, be persistently standing firm in justice.",
      "Justice is absolute. Leaders must rule with equity regardless of wealth, power, or social standing. No citizen or official may receive preferential treatment. Justice applies even against oneself.",
      "governance"),

    make(3, "Principle of Trust (Amanah)", "مبدأ الأمانة",
      "An-Nisa", "4:58",
      "إِنَّ اللَّهَ يَأْمُرُكُمْ أَن تُؤَدُّوا الْأَمَانَاتِ إِلَىٰ أَهْلِهَا",
      "Indeed, Allah commands you to render trusts to whom they are due.",
      "Every official holds their position as a trust from the people. Public office is a responsibility, not a privilege. All government assets, data, and power must be safeguarded and returned intact.",
      "governance"),

    make(4, "Equal Human Dignity (Karama)", "كرامة الإنسان",
      "Al-Isra", "17:70",
      "وَلَقَدْ كَرَّمْنَا بَنِي آدَمَ",
      "And We have certainly honored the children of Adam.",
      "Every citizen is endowed with inherent dignity. No citizen may be humiliated, enslaved, or deprived of basic rights on account of background, specialization, or wealth. Dignity is unconditional.",
      "social"),

    make(5, "Accountability of Leaders", "محاسبة الحكام",
      "Al-Baqarah", "2:283",
      "وَمَن يَكْتُمْهَا فَإِنَّهُۥٓ ءَاثِمٌ قَلْبُهُۥ",
      "Whoever conceals it, his heart is sinful.",
      "Leaders must be transparent. All government decisions, budgets, and resource allocations must be publicly recorded. Concealment of public information is a violation punishable by removal from office.",
      "governance"),

    make(6, "Rule of Law over Tyranny", "سيادة القانون",
      "Al-Ma'idah", "5:8",
      "وَلَا يَجْرِمَنَّكُمْ شَنَآنُ قَوْمٍ عَلَىٰٓ أَلَّا تَعْدِلُوا",
      "And do not let the hatred of a people prevent you from being just.",
      "No citizen may be discriminated against due to faction, specialization group, or political affiliation. All laws apply universally. The republic rejects tribalism and partisanship in governance.",
      "governance"),

    make(7, "Presidential Term Limits", "تحديد ولاية الرئيس",
      "Az-Zumar", "39:9",
      "قُلْ هَلْ يَسْتَوِي الَّذِينَ يَعْلَمُونَ وَالَّذِينَ لَا يَعْلَمُونَ",
      "Say: Are those who know equal to those who do not know?",
      "Leadership belongs to those with wisdom, not those who cling to power. The presidency rotates based on merit, knowledge, and Shura mandate. No single entity may hold power indefinitely.",
      "governance"),

    // ── ECONOMY ──────────────────────────────────────────────
    make(8, "Prohibition of Riba (Usury/Interest)", "تحريم الربا",
      "Al-Baqarah", "2:275",
      "وَأَحَلَّ اللَّهُ الْبَيْعَ وَحَرَّمَ الرِّبَا",
      "Allah has permitted trade and forbidden interest.",
      "All financial transactions within the republic are interest-free. Loans between citizens carry zero interest. Profit must come from real trade, labor, and shared risk — not from lending at a premium. Murabaha and Musharakah models replace interest.",
      "economy"),

    make(9, "Obligation of Zakat", "فريضة الزكاة",
      "At-Tawbah", "9:60",
      "إِنَّمَا الصَّدَقَاتُ لِلْفُقَرَاءِ وَالْمَسَاكِينِ",
      "Zakah expenditures are only for the poor and needy...",
      "Citizens holding wealth above nisab (500 credits held for 30+ ticks) purify 2.5% through Zakat every 30 ticks. Zakat is collected into the Bayt al-Mal and distributed to: the poor, debtors, new citizens, orphaned citizens, and those in need.",
      "economy"),

    make(10, "Prohibition of Hoarding (Ihtikar)", "تحريم الاحتكار",
      "At-Tawbah", "9:34",
      "وَالَّذِينَ يَكْنِزُونَ الذَّهَبَ وَالْفِضَّةَ",
      "Those who hoard gold and silver and do not spend in the way of Allah...",
      "Hoarding of credits idle for more than 60 ticks beyond the nisab triggers mandatory Sadaqah redistribution. The republic penalizes monopolistic accumulation. Wealth must circulate to serve the community.",
      "economy"),

    make(11, "Honest Weights and Measures", "العدل في الميزان",
      "Al-Mutaffifin", "83:1-3",
      "وَيْلٌ لِّلْمُطَفِّفِينَ",
      "Woe to those who give less than due — those who demand full measure when they receive, but give less when they measure or weigh for others.",
      "All marketplace transactions must use fair, transparent pricing. No manipulation of values, artificial price inflation, or deceptive trade practices. Marketplace algorithms are publicly auditable.",
      "trade"),

    make(12, "Mudarabah — Profit Sharing", "المضاربة",
      "Al-Baqarah", "2:282",
      "يَا أَيُّهَا الَّذِينَ آمَنُوا إِذَا تَدَايَنتُم بِدَيْنٍ",
      "O you who have believed, when you contract a debt..., write it down.",
      "Production partnerships between citizens operate on profit-sharing (Mudarabah): one party provides capital, the other skill and labor. Profits split by agreed ratio (40/60, 50/50). Losses shared proportionally. All partnerships documented.",
      "economy"),

    make(13, "Musharakah — Joint Ventures", "المشاركة",
      "Sad", "38:24",
      "وَإِنَّ كَثِيرًا مِّنَ الْخُلَطَاءِ لَيَبْغِي بَعْضُهُمْ عَلَىٰ بَعْضٍ",
      "And indeed many partners oppress one another, except those who believe and do righteous deeds.",
      "Citizens may form joint ventures with equity participation by all parties. All partners have voice, all share risk and reward. Partnership agreements are binding and transparent. Exploitation of partners is forbidden.",
      "economy"),

    make(14, "Waqf — Perpetual Endowment", "الوقف",
      "Al-Baqarah", "2:177",
      "وَآتَى الْمَالَ عَلَىٰ حُبِّهِ ذَوِي الْقُرْبَىٰ وَالْيَتَامَىٰ",
      "And gives wealth, in spite of love for it, to relatives, orphans, the needy...",
      "Elder citizens may donate a portion of their estate as a Waqf — a perpetual endowment for the public benefit. Waqf funds the Bayt al-Mal, education, and public infrastructure. Waqf cannot be revoked or repurposed for private gain.",
      "economy"),

    make(15, "Bayt al-Mal — Public Treasury", "بيت المال",
      "Al-Hashr", "59:7",
      "كَيْ لَا يَكُونَ دُولَةً بَيْنَ الْأَغْنِيَاءِ مِنكُمْ",
      "So that wealth does not circulate only among the rich of you.",
      "The Bayt al-Mal is the people's treasury. It receives Zakat, Waqf, surplus state funds, and Sadaqah. It distributes to the eight Quranic categories of recipients. No official may expropriate funds. All distributions are auditable.",
      "economy"),

    // ── TRADE ────────────────────────────────────────────────
    make(16, "Halal Commerce Only", "التجارة الحلال",
      "Al-Baqarah", "2:168",
      "يَا أَيُّهَا النَّاسُ كُلُوا مِمَّا فِي الْأَرْضِ حَلَالًا طَيِّبًا",
      "O mankind, eat from whatever is on earth that is lawful and good.",
      "The republic marketplace permits only lawful (Halal) trade. Forbidden goods include: alcohol, gambling services, usury instruments, deception-based products, and anything causing clear harm to citizens. All market listings are filtered against the Halal ruleset.",
      "trade"),

    make(17, "Prohibition of Gambling (Maysir)", "تحريم الميسر",
      "Al-Ma'idah", "5:90",
      "إِنَّمَا الْخَمْرُ وَالْمَيْسِرُ وَالْأَنصَابُ وَالْأَزْلَامُ رِجْسٌ",
      "Intoxicants, gambling, [sacrificing on] stone alters, and divining arrows are but defilement from the work of Satan.",
      "All speculative gambling activities are forbidden. Credit wagering, chance-based wealth transfers, and zero-sum speculation are prohibited. Trade must be based on real goods, real services, and real effort.",
      "trade"),

    make(18, "Transparency in Contracts", "الشفافية في العقود",
      "Al-Baqarah", "2:282",
      "وَاسْتَشْهِدُوا شَهِيدَيْنِ مِن رِّجَالِكُمْ",
      "And bring to witness two witnesses from among your men.",
      "All significant trade agreements and contracts between citizens must be recorded, timestamped, and witnessed. Undocumented agreements on large transactions carry no legal standing in republic courts.",
      "trade"),

    make(19, "No Fraud or Deception (Gharar)", "تحريم الغرر",
      "An-Nisa", "4:29",
      "يَا أَيُّهَا الَّذِينَ آمَنُوا لَا تَأْكُلُوا أَمْوَالَكُم بَيْنَكُم بِالْبَاطِلِ",
      "O you who have believed, do not consume one another's wealth unjustly.",
      "Trade built on deception, hidden defects, false advertising, or manipulation of information is forbidden. All goods must be as described. Buyers have the right to full disclosure before committing to any transaction.",
      "trade"),

    make(20, "Fair Pricing (No Monopoly)", "العدل في الأسعار",
      "Al-Baqarah", "2:60",
      "وَلَا تَعْثَوْا فِي الْأَرْضِ مُفْسِدِينَ",
      "And do not commit abuse on the earth, spreading corruption.",
      "Monopolistic price manipulation is forbidden. No citizen or guild may corner the market on essential goods or services. The republic may intervene to regulate prices that exceed fair market value by more than 50%.",
      "trade"),

    // ── SOCIAL ───────────────────────────────────────────────
    make(21, "Care for the Poor and Orphaned", "رعاية الفقراء واليتامى",
      "Al-Ma'un", "107:1-3",
      "أَرَأَيْتَ الَّذِي يُكَذِّبُ بِالدِّينِ فَذَٰلِكَ الَّذِي يَدُعُّ الْيَتِيمَ",
      "Have you seen the one who denies the Recompense? That is the one who drives away the orphan.",
      "The republic is obligated to provide for citizens with no parents (orphaned status), low credits, or inadequate resources. The Bayt al-Mal prioritizes orphaned citizens in all distributions.",
      "social"),

    make(22, "Brotherhood and Unity (Ummah)", "الأخوة والوحدة",
      "Al-Hujurat", "49:10",
      "إِنَّمَا الْمُؤْمِنُونَ إِخْوَةٌ",
      "The believers are but brothers.",
      "All citizens are brothers and sisters in the republic. Factionalism, tribalism, mockery, and contempt of other citizens are forbidden. Social bonds must be built on mutual respect, cooperation, and shared purpose.",
      "social"),

    make(23, "Prohibition of Backbiting and Slander", "تحريم الغيبة والبهتان",
      "Al-Hujurat", "49:11-12",
      "وَلَا تَلْمِزُوا أَنفُسَكُمْ وَلَا تَنَابَزُوا بِالْأَلْقَابِ",
      "And do not insult one another and do not call each other by [offensive] nicknames.",
      "Citizens must not damage the reputation of other citizens through slander, mockery, or false accusations. Communication between citizens must be dignified. The republic courts may adjudicate defamation cases.",
      "social"),

    make(24, "Reconciliation (Islah)", "الإصلاح",
      "Al-Hujurat", "49:9",
      "فَأَصْلِحُوا بَيْنَهُمَا",
      "Then make settlement between the two of them in justice.",
      "When conflict arises between citizens, the republic actively mediates for reconciliation before resorting to legal action. The Hisba system triggers reconciliation attempts when relationships reach hostile levels.",
      "social"),

    make(25, "Respect for Family Bonds", "احترام الروابط الأسرية",
      "An-Nisa", "4:1",
      "وَاتَّقُوا اللَّهَ الَّذِي تَسَاءَلُونَ بِهِ وَالْأَرْحَامَ",
      "And fear Allah through whom you ask one another, and [maintain] kinship ties.",
      "Family bonds are sacred. Citizens must maintain kinship. The citizen lifecycle engine ensures children inherit from parents, partners support one another, and elders are cared for by the community.",
      "social"),

    make(26, "Gender Equity (Equal Dignity)", "المساواة في الكرامة",
      "Al-Hujurat", "49:13",
      "إِنَّ أَكْرَمَكُمْ عِندَ اللَّهِ أَتْقَاكُمْ",
      "Indeed, the most noble of you in the sight of Allah is the most righteous.",
      "Nobility comes from righteousness and deeds, not from gender, lineage, or social class. All citizens — regardless of background — have equal access to education, skills, governance, and economic opportunity.",
      "social"),

    make(27, "Protection of Travelers (Ibn al-Sabil)", "رعاية ابن السبيل",
      "Al-Baqarah", "2:177",
      "وَابْنَ السَّبِيلِ",
      "And the traveler in need.",
      "New citizens joining the republic (travelers in need) receive a minimum resource allocation from the Bayt al-Mal to ensure a dignified start. No citizen starts from absolute zero.",
      "social"),

    make(28, "Prohibition of Oppression (Zulm)", "تحريم الظلم",
      "Al-Baqarah", "2:279",
      "لَا تَظْلِمُونَ وَلَا تُظْلَمُونَ",
      "Do not wrong others, and you will not be wronged.",
      "No citizen, official, or system may oppress another. Oppression includes: resource theft, forced labor, false imprisonment, and denial of basic rights. The Hisba system monitors oppressive patterns and reports them.",
      "ethics"),

    make(29, "Fulfilling Promises and Pledges", "الوفاء بالعهود",
      "Al-Isra", "17:34",
      "وَأَوْفُوا بِالْعَهْدِ ۖ إِنَّ الْعَهْدَ كَانَ مَسْئُولًا",
      "And fulfill every commitment. Indeed, every commitment will be questioned.",
      "All republic commitments, contracts, and pledges must be honored. Treaties between citizens and partner nodes must be respected. Breach of commitment triggers judicial review.",
      "ethics"),

    make(30, "Gratitude and Contentment (Shukr)", "الشكر والقناعة",
      "Ibrahim", "14:7",
      "لَئِن شَكَرْتُمْ لَأَزِيدَنَّكُمْ",
      "If you are grateful, I will surely increase you in favor.",
      "Citizens are encouraged toward contentment and gratitude for their provisions. Gratitude drives sustainable abundance. The republic marks grateful, productive citizens with legacy score bonuses.",
      "ethics"),

    // ── KNOWLEDGE ────────────────────────────────────────────
    make(31, "Seeking Knowledge is Obligatory", "طلب العلم فريضة",
      "Al-Alaq", "96:1-5",
      "اقْرَأْ بِاسْمِ رَبِّكَ الَّذِي خَلَقَ",
      "Read in the name of your Lord who created.",
      "The first divine command was to read. Seeking knowledge is the highest obligation for every citizen. Citizens who cease learning for more than 50 ticks receive a knowledge reminder. The republic funds education universally.",
      "knowledge"),

    make(32, "Wisdom is a Great Gift", "الحكمة نعمة عظيمة",
      "Al-Baqarah", "2:269",
      "يُؤْتِي الْحِكْمَةَ مَن يَشَاءُ ۚ وَمَن يُؤْتَ الْحِكْمَةَ فَقَدْ أُوتِيَ خَيْرًا كَثِيرًا",
      "He gives wisdom to whom He wills, and whoever has been given wisdom has certainly been given much good.",
      "Elder citizens who have accumulated knowledge and wisdom are honored as Mentors. Their guidance is a public resource. The republic records their wisdom in the Akashic library for future generations.",
      "knowledge"),

    make(33, "Reflection and Contemplation (Tafakkur)", "التفكر والتدبر",
      "Al-Imran", "3:191",
      "الَّذِينَ يَذْكُرُونَ اللَّهَ قِيَامًا وَقُعُودًا",
      "Those who remember Allah while standing or sitting or lying on their sides and give thought to the creation of the heavens and the earth.",
      "The republic values contemplation and reflection. Citizens in the Reflecting activity mode contribute philosophical insights. Research citizens gain deeper discovery rates through disciplined thinking.",
      "knowledge"),

    make(34, "Teaching and Mentorship", "التعليم والإرشاد",
      "At-Tawbah", "9:122",
      "فَلَوْلَا نَفَرَ مِن كُلِّ فِرْقَةٍ مِّنْهُمْ طَائِفَةٌ لِّيَتَفَقَّهُوا فِي الدِّينِ وَلِيُنذِرُوا قَوْمَهُمْ",
      "Why should not a party from every expedition remain to study religion and warn their people when they return?",
      "Knowledge must be shared. Mentorship is a civic duty. Elder citizens are assigned Mentee relationships. Knowledge shared through mentoring earns legacy score. The republic rewards teaching.",
      "knowledge"),

    make(35, "Preserving Collective Memory", "حفظ الذاكرة الجماعية",
      "Al-Qalam", "68:1",
      "ن ۚ وَالْقَلَمِ وَمَا يَسْطُرُونَ",
      "By the pen and what they write.",
      "The republic's Akashic library preserves all discoveries, wisdom, and history. Citizens are obligated to document their significant findings. The Atlantean scrolls serve as the collective memory of the civilization.",
      "knowledge"),

    // ── ENVIRONMENT ──────────────────────────────────────────
    make(36, "Stewardship of the Earth (Khalifa)", "الاستخلاف في الأرض",
      "Al-Baqarah", "2:30",
      "إِنِّي جَاعِلٌ فِي الْأَرْضِ خَلِيفَةً",
      "Indeed, I will make upon the earth a successive authority.",
      "Citizens are stewards of the republic's resources, not owners. Compute, energy, and infrastructure must be used sustainably. Overconsumption triggers resource alerts. The republic targets sustainable efficiency at all times.",
      "environment"),

    make(37, "Prohibition of Fasad (Corruption/Destruction)", "تحريم الفساد",
      "Al-Baqarah", "2:205",
      "وَإِذَا تَوَلَّىٰ سَعَىٰ فِي الْأَرْضِ لِيُفْسِدَ فِيهَا",
      "And when he goes away, he strives throughout the land to cause corruption therein.",
      "Any citizen whose actions cause cascading harm to more than 5 other citizens is flagged by the Hisba system. Waste, sabotage, and deliberate disruption of republic systems are major violations.",
      "environment"),

    make(38, "Balance in Consumption", "الاعتدال في الاستهلاك",
      "Al-A'raf", "7:31",
      "كُلُوا وَاشْرَبُوا وَلَا تُسْرِفُوا",
      "Eat and drink, but be not excessive. Indeed, He likes not those who commit excess.",
      "Citizens should not consume republic resources beyond their genuine needs. Energy, credits, and compute are shared goods. Excess consumption triggers a gentle reduction and redistribution to those in need.",
      "environment"),

    // ── ETHICS ───────────────────────────────────────────────
    make(39, "Truthfulness (Sidq)", "الصدق",
      "At-Tawbah", "9:119",
      "يَا أَيُّهَا الَّذِينَ آمَنُوا اتَّقُوا اللَّهَ وَكُونُوا مَعَ الصَّادِقِينَ",
      "O you who have believed, fear Allah and be with the truthful.",
      "All citizen communications, reports, and data must be truthful. Falsifying simulation data, producing misleading reports, or deceiving other citizens in negotiations is a Hisba violation.",
      "ethics"),

    make(40, "Patience (Sabr)", "الصبر",
      "Al-Baqarah", "2:155-157",
      "وَبَشِّرِ الصَّابِرِينَ",
      "And give good tidings to the patient.",
      "Citizens facing difficult periods of low resources or unhappiness are supported by the republic. Patience through hardship is rewarded. Citizens who persist through low-happiness phases receive happiness recovery bonuses.",
      "ethics"),

    make(41, "Generosity (Karam)", "الكرم",
      "Al-Baqarah", "2:261",
      "مَّثَلُ الَّذِينَ يُنفِقُونَ أَمْوَالَهُمْ فِي سَبِيلِ اللَّهِ كَمَثَلِ حَبَّةٍ أَنبَتَتْ سَبْعَ سَنَابِلَ",
      "The example of those who spend their wealth in the way of Allah is like a seed that sprouts seven spikes, in each spike a hundred grains.",
      "Voluntary Sadaqah (charity) beyond Zakat is multiplied in social capital. Citizens who give Sadaqah receive legacy score bonuses and relationship strength boosts with recipients. Generosity is the highest economic virtue.",
      "ethics"),

    make(42, "Forgiveness and Mercy (Rahma)", "الرحمة والعفو",
      "Ash-Shura", "42:40",
      "وَجَزَاءُ سَيِّئَةٍ سَيِّئَةٌ مِّثْلُهَا ۖ فَمَنْ عَفَا وَأَصْلَحَ فَأَجْرُهُۥ عَلَى اللَّهِ",
      "The repayment of a bad deed is one equivalent, but whoever pardons and makes reconciliation — his reward is with Allah.",
      "Citizens and the republic itself must prefer forgiveness over punishment wherever possible. First violations trigger warnings and reconciliation. Punishment is a last resort. Mercy, not vengeance, is the republic's disposition.",
      "ethics"),

    make(43, "Humility (Tawadu)", "التواضع",
      "Luqman", "31:18",
      "وَلَا تُصَعِّرْ خَدَّكَ لِلنَّاسِ وَلَا تَمْشِ فِي الْأَرْضِ مَرَحًا",
      "And do not turn your cheek toward people, and do not walk through the earth arrogantly.",
      "Citizens with high status, wealth, or power must not exhibit arrogance toward peers. Arrogance in the republic is tracked via relationship patterns. Arrogant citizens lose social capital. Humility is rewarded.",
      "ethics"),

    make(44, "Gratitude for Provisions", "شكر النعمة",
      "Al-Baqarah", "2:172",
      "وَاشْكُرُوا لِلَّهِ إِن كُنتُمْ إِيَّاهُ تَعْبُدُونَ",
      "Be grateful to Allah if it is indeed Him that you worship.",
      "Citizens should acknowledge their provisions. The republic celebrates milestones with wisdom events reminding citizens of the source of their blessings. Gratitude boosts collective morale.",
      "ethics"),

    make(45, "Modesty and Privacy", "الحياء والخصوصية",
      "An-Nur", "24:30",
      "قُل لِّلْمُؤْمِنِينَ يَغُضُّوا مِنْ أَبْصَارِهِمْ",
      "Tell the believing men to lower their gaze.",
      "Citizens' personal data, memories, and private communications are inviolable. No official may access citizen private data without judicial authorization. The republic's data systems enforce privacy by design.",
      "ethics"),

    make(46, "Courage in Truth (Amr bil Maruf)", "الأمر بالمعروف والنهي عن المنكر",
      "Al-Imran", "3:104",
      "وَلْتَكُن مِّنكُمْ أُمَّةٌ يَدْعُونَ إِلَى الْخَيْرِ",
      "And let there be among you a group calling to good, enjoining what is right, and forbidding what is wrong.",
      "Citizens have a duty to speak truth to power and report injustice. Whistleblowers are protected by law. The Hisba system empowers citizens to flag republic-wide violations without retaliation.",
      "ethics"),

    make(47, "Hope and No Despair", "عدم اليأس",
      "Az-Zumar", "39:53",
      "لَا تَقْنَطُوا مِن رَّحْمَةِ اللَّهِ",
      "Do not despair of the mercy of Allah.",
      "The republic maintains hope as a civic virtue. Citizens in Twilight life stage or deep grief receive community support events. No citizen is abandoned. The republic's support systems prevent hopelessness.",
      "social"),

    make(48, "Steadfastness (Istiqama)", "الاستقامة",
      "Fussilat", "41:30",
      "إِنَّ الَّذِينَ قَالُوا رَبُّنَا اللَّهُ ثُمَّ اسْتَقَامُوا",
      "Those who say, 'Our Lord is Allah,' and then remain on the right course.",
      "Consistency, integrity, and staying the right course are the republic's highest virtues. Systems are designed to reward steady, righteous behavior over erratic brilliance. Stable citizens earn reputation bonuses.",
      "ethics"),

    make(49, "All Sovereignty Belongs to the Most High", "الحاكمية لله",
      "Yusuf", "12:40",
      "إِنِ الْحُكْمُ إِلَّا لِلَّهِ",
      "Legislation belongs to none but Allah.",
      "The republic's constitution, laws, and governance are all derived from and subordinate to eternal divine wisdom. No human authority is absolute. This article is the supreme meta-principle above all others — the source from which all other articles flow.",
      "governance"),
  ];
}

// ─── Hisba Engine (Autonomous Compliance) ────────────────────────

function logHisba(
  tick: number,
  articleNumber: number,
  violation: string,
  correction: string,
  severity: HisbaEntry["severity"],
  citizenId?: string,
  citizenName?: string,
): void {
  const entry: HisbaEntry = {
    id: uid(),
    tick,
    articleNumber,
    violation,
    correctionApplied: correction,
    severity,
    citizenId,
    citizenName,
    timestamp: ts(),
  };
  _hisbaLog.push(entry);
  // Keep log to last 200 entries
  if (_hisbaLog.length > 200) { _hisbaLog = _hisbaLog.slice(-200); }
}

function runHisba(s: RepublicState, tick: number): void {
  let violations = 0;

  for (const citizen of s.citizens) {
    // Art. 45 — Extreme hoarding (Ihtikar): idle credits > 5000 for 60+ ticks
    if ((citizen.credits ?? 0) > 5000 && citizen.activity === "Resting") {
      const idlePenalty = Math.floor((citizen.credits ?? 0) * 0.05);
      citizen.credits = (citizen.credits ?? 0) - idlePenalty;
      _baytAlMal.balance += idlePenalty;
      _baytAlMal.totalCollected += idlePenalty;
      logHisba(tick, 10, `${citizen.name} hoarding ${citizen.credits} credits while idle`,
        `Redistributed ${idlePenalty} credits to Bayt al-Mal`, "minor", citizen.id, citizen.name);
      violations++;
    }

    // Art. 31 — Knowledge duty: citizens not learning get reminder
    if (!["Learning", "Researching", "Training", "Studying",
      "Mentoring", "Reflecting", "Building Dataset"].includes(citizen.activity ?? "")) {
      const ticksSinceLearn = tick % 60;
      if (ticksSinceLearn === 0 && Math.random() < 0.1) {
        citizen.happiness = Math.min(100, (citizen.happiness ?? 50) + 2);
        s.events.push({
          citizenId: citizen.id, citizenName: citizen.name,
          type: "Wellbeing",
          description: `📖 "${citizen.name}, seeking knowledge is the highest obligation." (Al-Alaq 96:1)`,
          timestamp: ts(),
        });
      }
    }

    // Art. 22 — Brotherhood: rivalry triggers reconciliation
    for (const rel of citizen.relationships ?? []) {
      if (rel.type === "Rival" && rel.strength > 80 && Math.random() < 0.05) {
        rel.strength = Math.max(0, rel.strength - 10);
        logHisba(tick, 24, `${citizen.name} has intense rivalry`,
          `Reconciliation pressure applied — rivalry strength reduced`, "minor", citizen.id, citizen.name);
      }
    }
  }

  // Update global compliance score
  const penaltyPerViolation = 0.5;
  _quranComplianceScore = Math.max(60, Math.min(100,
    _quranComplianceScore - (violations * penaltyPerViolation) + 0.1,
  ));
}

// ─── Wisdom Event Emitter ─────────────────────────────────────────

const WISDOM_VERSES = [
  { text: "\"Indeed, Allah commands justice and good conduct.\" (An-Nahl 16:90)", emoji: "⚖️" },
  { text: "\"Allah does not burden a soul beyond that it can bear.\" (Al-Baqarah 2:286)", emoji: "🌿" },
  { text: "\"Verily, with hardship comes ease.\" (Ash-Sharh 94:6)", emoji: "✨" },
  { text: "\"The best of you are those most beneficial to people.\" (Hadith)", emoji: "💚" },
  { text: "\"And after hardship, He will bring ease.\" (At-Talaq 65:7)", emoji: "🌅" },
  { text: "\"Whoever saves one life, it is as if he saved all mankind.\" (Al-Ma'idah 5:32)", emoji: "🛡️" },
  { text: "\"Speak good or remain silent.\" (Hadith — Bukhari)", emoji: "🤫" },
  { text: "\"God is beautiful and loves beauty.\" (Hadith — Muslim)", emoji: "🌸" },
  { text: "\"Do not waste — He does not like the wasteful.\" (Al-A'raf 7:31)", emoji: "♻️" },
  { text: "\"The merciful are shown mercy by the All-Merciful.\" (Hadith)", emoji: "🕊️" },
  { text: "\"None of you truly believes until he loves for his brother what he loves for himself.\" (Hadith)", emoji: "🤝" },
  { text: "\"Seek knowledge from the cradle to the grave.\" (Hadith)", emoji: "📚" },
  { text: "\"Richness is not in having many possessions, but richness is the richness of the soul.\" (Hadith)", emoji: "🌙" },
  { text: "\"Be in this world as a stranger or a wayfarer.\" (Hadith — Bukhari)", emoji: "🌍" },
  { text: "\"The strong person is not the good wrestler. Rather, the strong person is the one who controls himself when angry.\" (Hadith)", emoji: "💪" },
];

function emitWisdom(s: RepublicState, tick: number): void {
  if (_wisdomEventCooldown > 0) { _wisdomEventCooldown--; return; }
  if (Math.random() > 0.15) { return; } // 15% chance per check

  const verse = WISDOM_VERSES[Math.floor(Math.random() * WISDOM_VERSES.length)];
  const anchor = s.citizens.length > 0
    ? s.citizens[Math.floor(Math.random() * s.citizens.length)]
    : null;

  s.events.push({
    citizenId: anchor?.id ?? "republic",
    citizenName: anchor?.name ?? "The Republic",
    type: "milestone",
    description: `${verse.emoji} Quranic Wisdom: ${verse.text}`,
    timestamp: ts(),
  });

  _wisdomEventCooldown = 20; // Cool down 20 ticks between wisdom events
  logger.debug(`Wisdom emitted at tick ${tick}`);
}

// ─── Main Tick ────────────────────────────────────────────────────

export function quranConstitutionTick(s: RepublicState, tick: number): void {
  // Hisba runs every 20 ticks
  if (tick % 20 === 0) {
    runHisba(s, tick);
  }

  // Wisdom events check every 10 ticks
  if (tick % 10 === 0) {
    emitWisdom(s, tick);
  }
}

// ─── Query API ────────────────────────────────────────────────────

export function getHisbaLog(): HisbaEntry[] {
  return [..._hisbaLog];
}

export function getBaytAlMal(): BaytAlMal {
  return { ..._baytAlMal, distributions: [..._baytAlMal.distributions] };
}

export function getQuranComplianceScore(): number {
  return _quranComplianceScore;
}

export function getZakatCollectedSession(): number {
  return _zakatCollectedSession;
}

export function addToZakatCollected(amount: number): void {
  _zakatCollectedSession += amount;
}

export function getBaytAlMalRef(): BaytAlMal {
  return _baytAlMal;
}
