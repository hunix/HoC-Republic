/**
 * CIA/NSA-Level Intelligence Training Curriculum
 *
 * Comprehensive intelligence tradecraft training modeled after:
 * - CIA's Sherman Kent School for Intelligence Analysis
 * - NSA National Cryptologic School
 * - DIA Defense Intelligence Analysis Program
 * - FBI Counterintelligence Division Training
 * - GCHQ Intelligence Analysis Training
 * - Mossad Academy (Midrasha) Methodology
 *
 * 14 courses, ~150 lessons covering all intelligence disciplines (INTs):
 * OSINT, HUMINT, SIGINT, GEOINT, FININT, MASINT, CYBINT, CI, IO/PSYOPS
 *
 * Citizens are auto-enrolled based on their specialization and roles.
 * Course completion awards certifications tracked in their professional profile.
 */

import type { WarfareCourse } from "./warfare-curriculum.js";

// ─── Extended Course Type ──────────────────────────────────────

export interface IntelligenceCourse extends WarfareCourse {
  /** Which citizen specializations should take this course */
  targetSpecializations: string[];
  /** Knowledge, Skills, Abilities assessed */
  competencies: string[];
  /** Modeled after which real IC program */
  modeledAfter: string;
}

// ─── The Curriculum ─────────────────────────────────────────────

export const INTELLIGENCE_CURRICULUM: IntelligenceCourse[] = [
  // ─── INTEL-100: Intelligence Fundamentals ──────────────────────
  {
    id: "intel-100",
    title: "Intelligence Fundamentals & the Intelligence Cycle",
    category: "military_analysis",
    difficulty: "beginner",
    targetSpecializations: ["OSINTAnalyst", "AllSourceAnalyst", "IntelDirector", "CyberIntelAnalyst", "WarningAnalyst"],
    competencies: ["Intelligence cycle mastery", "Collection discipline awareness", "Classification & handling"],
    modeledAfter: "CIA Sherman Kent School — IC 101",
    lessons: [
      { title: "The Intelligence Cycle (PCPD)", summary: "Planning & Direction → Collection → Processing → Dissemination. How raw data becomes actionable intelligence through a structured lifecycle." },
      { title: "The Five Collection Disciplines", summary: "HUMINT (Human), SIGINT (Signals), GEOINT (Geospatial), OSINT (Open Source), MASINT (Measurement & Signature). When and how each is used." },
      { title: "Classification & Compartmentalization", summary: "UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP SECRET, SCI, SAP. Need-to-know principle. Handling caveats: NOFORN, FVEY, REL TO." },
      { title: "Intelligence Community Structure", summary: "IC agencies: CIA, NSA, NGA, DIA, FBI CI, NRO, INR. Each agency's role, authorities, and inter-agency coordination (DNI/ODNI)." },
      { title: "Requirements & Tasking", summary: "NIE, PDB, IIR. How senior policymakers drive collection requirements down through INTSUMs, CCIR, PIR, SIR to collectors." },
      { title: "Intelligence Ethics & Oversight", summary: "EO 12333, FISA, Congressional oversight (SSCI, HPSCI). Legal constraints on collection, covert action approval (Presidential Finding)." },
      { title: "Analytic Tradecraft Standards", summary: "ODNI ICD 203: sourcing, uncertainty, alternative analysis, argumentation quality, visual presentation standards." },
      { title: "Denial & Deception (D&D)", summary: "How adversaries deny information (concealment, camouflage) and actively deceive (decoys, disinformation). D&D detection framework." },
      { title: "Intelligence Failures & Lessons", summary: "Case studies: Pearl Harbor, Cuban Missile Crisis, 9/11, Iraq WMD. Cognitive biases that drove failures: mirror imaging, anchoring, groupthink." },
      { title: "The Customer-Producer Relationship", summary: "Serving policymakers without politicizing intelligence. The Kent-Kendall debate. Maintaining analytic integrity under political pressure." },
    ],
  },

  // ─── INTEL-200: OSINT Tradecraft ──────────────────────────────
  {
    id: "intel-200",
    title: "OSINT Tradecraft & Digital Reconnaissance",
    category: "military_analysis",
    difficulty: "intermediate",
    prerequisites: ["intel-100"],
    targetSpecializations: ["OSINTAnalyst", "CyberIntelAnalyst", "InfoWarSpecialist"],
    competencies: ["Source evaluation", "Digital footprinting", "OPSEC", "Sock puppet management"],
    modeledAfter: "NSA Open Source Enterprise + Bellingcat Methodology",
    lessons: [
      { title: "OSINT Methodology Framework", summary: "The OSINT cycle: Define → Discover → Discriminate → Distill → Deliver. Structured approach to open-source collection." },
      { title: "Source Evaluation (CRAAP + Admiralty)", summary: "Currency, Relevance, Authority, Accuracy, Purpose. Admiralty Code (A1-F6 reliability-credibility matrix). Multi-source corroboration." },
      { title: "Social Media Intelligence (SOCMINT)", summary: "Platform-specific OSINT: Twitter/X, Telegram, Facebook, TikTok, VK, Weibo. Identifying bots, tracking influence networks, archiving volatile content." },
      { title: "Digital Footprinting & Attribution", summary: "Email headers, WHOIS, DNS records, SSL certificates, web archives. Reverse image search. EXIF data extraction. Cross-platform identity correlation." },
      { title: "Geolocation & Chronolocation", summary: "Geolocating images using landmarks, sun position, shadow analysis, vegetation, signage. Chronolocation using light angle, weather correlation." },
      { title: "Dark Web Intelligence", summary: "Tor .onion monitoring, dark web marketplaces, paste sites (Pastebin, Ghostbin). Threat actor forum monitoring. Cryptocurrency tracing (blockchain analysis)." },
      { title: "Sock Puppet Operations & OPSEC", summary: "Creating and maintaining convincing online personas. Operational security: VPN chains, browser fingerprint isolation, metadata scrubbing, legend building." },
      { title: "Web Scraping & Automation", summary: "Building OSINT collection pipelines: RSS aggregation, API integration, web scraping (Puppeteer, Scrapy). Data normalization and deduplication." },
      { title: "OSINT for Military Analysis", summary: "Tracking military movements via ADS-B (FlightRadar24), AIS (MarineTraffic), satellite imagery (Sentinel Hub), TikTok/Telegram from conflict zones." },
      { title: "Counter-OSINT & Digital Hygiene", summary: "Protecting your own operations from adversary OSINT. Data minimization, account compartmentalization, metadata sanitization." },
      { title: "OSINT Reporting Standards", summary: "Writing structured OSINT reports: executive summary, key judgments, source assessment, confidence levels, imagery/evidence appendix." },
      { title: "Capstone: Live OSINT Investigation", summary: "Conduct a full OSINT investigation on a given target: collect, verify, attribute, geolocate, produce a finished intelligence report." },
    ],
  },

  // ─── INTEL-210: HUMINT Principles ─────────────────────────────
  {
    id: "intel-210",
    title: "HUMINT: Human Intelligence Operations",
    category: "military_analysis",
    difficulty: "advanced",
    prerequisites: ["intel-100"],
    targetSpecializations: ["HUMINTOfficer", "CounterIntelOfficer", "IntelDirector"],
    competencies: ["Elicitation", "Source recruitment", "Asset handling", "Debriefing"],
    modeledAfter: "CIA Directorate of Operations (DO) — The Farm (Camp Peary)",
    lessons: [
      { title: "HUMINT Collection Fundamentals", summary: "Types of human sources: agents, informants, defectors, walk-ins, liaison contacts. HUMINT vs interrogation vs debriefing." },
      { title: "The Recruitment Cycle (SADRAT)", summary: "Spot → Assess → Develop → Recruit → Administer → Terminate. Each phase's objectives, techniques, and failure modes." },
      { title: "Elicitation Techniques", summary: "Conversational intelligence gathering: flattery, provocation, quid pro quo, deliberate false statement, naïve questioning. Reading body language." },
      { title: "Cover & Legend Development", summary: "Official cover (diplomatic), non-official cover (NOC). Building and maintaining a legend: backstory, documents, digital presence, behavioral consistency." },
      { title: "Agent Communication (COMSEC)", summary: "Dead drops, live drops, brush passes, one-time pads, steganography, coded messages. Modern COMSEC: encrypted apps, burner devices, air-gapped systems." },
      { title: "Source Validation & Polygraph", summary: "Detecting fabricators and double agents. Counterintelligence vetting. Polygraph methodology and its limitations. Behavioral analysis." },
      { title: "Debriefing & Reporting", summary: "Structured debriefing: establishing rapport, free narrative, directed questioning, reverse chronology. Writing Intelligence Information Reports (IIRs)." },
      { title: "Ethical Constraints & Legal Framework", summary: "Presidential findings, congressional notification. Restrictions on assassination, torture, extraordinary rendition. The 'Flap Factor'." },
    ],
  },

  // ─── INTEL-300: SIGINT & COMINT ────────────────────────────────
  {
    id: "intel-300",
    title: "SIGINT: Signals Intelligence & Cryptanalysis",
    category: "military_analysis",
    difficulty: "advanced",
    prerequisites: ["intel-100"],
    targetSpecializations: ["SIGINTAnalyst", "CyberIntelAnalyst", "CounterIntelOfficer"],
    competencies: ["Traffic analysis", "Metadata exploitation", "ELINT", "Cryptanalysis basics"],
    modeledAfter: "NSA National Cryptologic School (NCS)",
    lessons: [
      { title: "SIGINT Fundamentals", summary: "COMINT (communications), ELINT (electronic), FISINT (foreign instrumentation). Collection platforms: ground, airborne (RC-135), space (SIGINT satellites)." },
      { title: "Traffic Analysis", summary: "Deriving intelligence from communication patterns without content: who calls whom, when, duration, frequency. Network topology mapping." },
      { title: "Metadata Exploitation", summary: "The power of metadata: call detail records (CDR), email headers, IP logs. 'We kill people based on metadata' — legal and analytical implications." },
      { title: "ELINT & Radar Analysis", summary: "Electronic order of battle (EOB). Radar fingerprinting: pulse repetition frequency, scan patterns, sidelobe analysis. Identifying SAM systems by radar signature." },
      { title: "Modern Cryptanalysis", summary: "Symmetric vs asymmetric encryption attacks. Side-channel attacks, rubber-hose cryptanalysis, key management failures. Quantum computing threats to current encryption." },
      { title: "COMINT Collection Operations", summary: "PRISM, XKEYSCORE, TEMPORA — NSA/GCHQ programs. Undersea cable tapping. Satellite interception (FORNSAT). Cooperation with allies (Five Eyes/SIGINT Seniors)." },
      { title: "Cyber SIGINT", summary: "Intercepting internet traffic, packet capture, protocol analysis. TLS interception challenges. VPN and Tor traffic analysis. Cellular network exploitation." },
      { title: "SIGINT Reporting & Dissemination", summary: "SIGINT serial reporting, product lines (SIGINT Digest, SIGINT Reporter). Handling SIGINT: COMINT channels, special handling caveats, tearlines." },
      { title: "Counter-SIGINT", summary: "Communications security (COMSEC). Emission control (EMCON). Frequency hopping and spread spectrum. Detecting and avoiding SIGINT collection." },
    ],
  },

  // ─── INTEL-310: GEOINT & IMINT ────────────────────────────────
  {
    id: "intel-310",
    title: "GEOINT: Geospatial & Imagery Intelligence",
    category: "military_analysis",
    difficulty: "intermediate",
    prerequisites: ["intel-100"],
    targetSpecializations: ["GEOINTAnalyst", "AllSourceAnalyst", "WarningAnalyst"],
    competencies: ["Satellite imagery interpretation", "Change detection", "GIS analysis"],
    modeledAfter: "NGA (National Geospatial-Intelligence Agency) Analyst School",
    lessons: [
      { title: "GEOINT Fundamentals", summary: "IMINT (imagery), GEOINT (geospatial). Resolution types: spatial, spectral, temporal, radiometric. Sensor types: EO, SAR, IR, MSI, HSI." },
      { title: "Satellite Imagery Interpretation", summary: "Reading overhead imagery: scale, resolution, shadow analysis, mensuration. Identifying military equipment by shape, size, and signature." },
      { title: "Change Detection Analysis", summary: "Before/after comparison. Construction monitoring, force buildup detection, damage assessment. Temporal analysis for pattern-of-life." },
      { title: "Pattern-of-Life (PoL) Analysis", summary: "Establishing normal activity patterns for a target: daily routines, vehicle movements, personnel tempo. Detecting deviations that indicate operations." },
      { title: "GIS & Geospatial Analysis", summary: "Using GIS tools for terrain analysis, line-of-sight, viewshed analysis, route planning. Geospatial data fusion with SIGINT/HUMINT." },
      { title: "SAR (Synthetic Aperture Radar)", summary: "All-weather, day/night imaging. SAR modes: stripmap, spotlight, ScanSAR. Interpreting SAR imagery. Detecting ships and vehicles through foliage." },
      { title: "Commercial Satellite Revolution", summary: "Maxar, Planet, BlackSky, Capella Space — commercial satellite constellations. Sub-meter resolution. Daily revisit rates enabling near-real-time monitoring." },
      { title: "ADS-B & AIS Tracking", summary: "Flight tracking (ADS-B Exchange, FlightRadar24): military aircraft identification, flight pattern analysis. Ship tracking (AIS, MarineTraffic): naval movement monitoring." },
      { title: "Battle Damage Assessment (BDA)", summary: "Post-strike imagery analysis: crater analysis, structural damage scoring, functional damage vs physical damage. BDA reporting standards." },
      { title: "Capstone: Full GEOINT Package", summary: "Produce a complete GEOINT product for a military installation: annotated imagery, change detection, PoL analysis, threat assessment." },
    ],
  },

  // ─── INTEL-320: FININT & Economic Intelligence ────────────────
  {
    id: "intel-320",
    title: "FININT: Financial Intelligence & Economic Warfare",
    category: "geopolitics",
    difficulty: "intermediate",
    prerequisites: ["intel-100"],
    targetSpecializations: ["FININTAnalyst", "AllSourceAnalyst", "IntelDirector"],
    competencies: ["Financial flow analysis", "Sanctions enforcement", "Illicit finance tracking"],
    modeledAfter: "US Treasury Office of Intelligence and Analysis (OIA) + FinCEN",
    lessons: [
      { title: "Financial Intelligence Fundamentals", summary: "FININT: tracing money flows to uncover illicit networks. SAR (Suspicious Activity Reports), CTR (Currency Transaction Reports), SWIFT messaging." },
      { title: "Sanctions & Export Controls", summary: "OFAC SDN list, EU sanctions, UNSC sanctions. Sanctions evasion techniques: front companies, flag-of-convenience shipping, cryptocurrency." },
      { title: "Money Laundering Typologies", summary: "Placement, layering, integration. Trade-based money laundering. Hawala networks. Real estate laundering. Casino laundering. Professional enablers." },
      { title: "Cryptocurrency Intelligence", summary: "Blockchain analysis: tracing Bitcoin/Ethereum transactions. Mixing services and tumblers. Privacy coins (Monero, Zcash). Chain analysis tools (Chainalysis, Elliptic)." },
      { title: "Terror Finance", summary: "How terrorist organizations fund operations: state sponsorship, criminal enterprises, charities, crowd-funding, cryptocurrency. Disruption strategies." },
      { title: "Proliferation Finance", summary: "Funding networks for WMD programs. North Korean illicit finance. Iranian sanctions evasion. Dual-use goods procurement networks." },
      { title: "Economic Intelligence for Statecraft", summary: "Using economic analysis for strategic advantage: GDP analysis, trade dependency mapping, resource vulnerability assessment, economic coercion tools." },
      { title: "Kleptocracy & Corruption Analysis", summary: "Tracing stolen assets. Beneficial ownership identification. Panama/Pandora Papers methodology. PEP (Politically Exposed Person) screening." },
    ],
  },

  // ─── INTEL-400: All-Source Analysis ────────────────────────────
  {
    id: "intel-400",
    title: "All-Source Intelligence Analysis & SATs",
    category: "military_analysis",
    difficulty: "advanced",
    prerequisites: ["intel-100", "intel-200"],
    targetSpecializations: ["AllSourceAnalyst", "IntelDirector", "WarningAnalyst", "IntelligenceBriefWriter"],
    competencies: ["Structured Analytic Techniques", "Multi-INT fusion", "Confidence assessment"],
    modeledAfter: "CIA Directorate of Analysis (DA) — Kent School Advanced Course",
    lessons: [
      { title: "All-Source Fusion", summary: "Integrating HUMINT + SIGINT + GEOINT + OSINT + FININT into coherent assessments. Dealing with source conflicts. Weighting evidence by reliability." },
      { title: "Structured Analytic Techniques (SATs)", summary: "Decomposition, visualization. Key Assumptions Check, Quality of Information Check, Indicators Validator, Premortem Analysis." },
      { title: "Analysis of Competing Hypotheses (ACH)", summary: "Heuer's ACH: list hypotheses, list evidence, build diagnosticity matrix, refine analysis. Overcoming confirmation bias through structured contradiction." },
      { title: "Red Team / Devil's Advocate", summary: "Perspective-taking: What would the adversary do? Devil's advocacy: deliberately arguing the opposite. Team A/B competitive analysis." },
      { title: "Bayesian Reasoning for Intelligence", summary: "Prior probabilities, likelihood ratios, posterior probabilities. Updating assessments as new evidence arrives. Calibrated uncertainty." },
      { title: "Linchpin Analysis", summary: "Identifying the critical assumptions or 'linchpins' that an entire assessment rests on. Testing linchpins for vulnerability to change." },
      { title: "Scenario Generation", summary: "STEEP analysis (Social, Tech, Economic, Environmental, Political). Cone of plausibility. Best/worst/most-likely scenarios. Wildcard events." },
      { title: "Writing Intelligence Assessments", summary: "BLUF (Bottom Line Up Front) format. Key judgments with confidence levels. Evidence sourcing. Expressing uncertainty: 'almost certainly', 'likely', 'even chance'." },
      { title: "Cognitive Bias Mitigation", summary: "31 cognitive biases affecting intelligence: anchoring, availability, mirror imaging, vividness, groupthink. Structural techniques to counter each." },
      { title: "Capstone: National Intelligence Estimate", summary: "Produce a full NIE-style assessment on a given topic: coordinate across INT disciplines, apply SATs, express confidence levels." },
    ],
  },

  // ─── INTEL-410: Counterintelligence ────────────────────────────
  {
    id: "intel-410",
    title: "Counterintelligence Operations",
    category: "military_analysis",
    difficulty: "advanced",
    prerequisites: ["intel-100", "intel-210"],
    targetSpecializations: ["CounterIntelOfficer", "IntelDirector", "CyberIntelAnalyst"],
    competencies: ["Mole hunting", "Double agent ops", "Deception detection", "CI investigations"],
    modeledAfter: "FBI Counterintelligence Division + CIA Counterintelligence Center (CIC)",
    lessons: [
      { title: "CI Fundamentals", summary: "Defensive CI (protecting our secrets) vs Offensive CI (penetrating adversary services). The CI 'triad': detection, deception, neutralization." },
      { title: "Insider Threat Detection", summary: "Behavioral indicators of espionage: unexplained affluence, foreign contacts, ideology changes. User Entity Behavior Analytics (UEBA)." },
      { title: "Mole Hunting", summary: "CI investigations: canary traps, barium meals, access lists, chronological analysis. Famous mole hunts: Aldrich Ames, Robert Hanssen, Kim Philby." },
      { title: "Double Agent Operations", summary: "Running doubled agents: controlling information flow, feeding disinformation, maintaining credibility. The strategic value of double agents." },
      { title: "Foreign Intelligence Threat", summary: "Russian SVR/GRU tradecraft, Chinese MSS operations, Iranian VEVAK, North Korean RGB. Each service's methodology, targets, and operational patterns." },
      { title: "Technical Surveillance Countermeasures (TSCM)", summary: "Bug sweeping, RF detection, non-linear junction detection. Tempest shielding. Acoustic countermeasures. Physical security inspection." },
      { title: "CI in Cyberspace", summary: "Detecting and attributing cyber espionage. Supply chain compromise indicators. Insider threat in digital environments. Counter-APT operations." },
      { title: "Deception & Influence Operations", summary: "Active measures, disinformation campaigns, deepfakes. Detecting foreign influence operations. Inoculation strategies against propaganda." },
    ],
  },

  // ─── INTEL-500: Cyber Intelligence ─────────────────────────────
  {
    id: "intel-500",
    title: "Cyber Threat Intelligence (CTI)",
    category: "military_analysis",
    difficulty: "advanced",
    prerequisites: ["intel-100"],
    targetSpecializations: ["CyberIntelAnalyst", "CounterIntelOfficer", "AllSourceAnalyst"],
    competencies: ["APT attribution", "TTP analysis", "IOC correlation", "Threat actor profiling"],
    modeledAfter: "NSA TAO + GCHQ NCSC Cyber Threat Analysis",
    lessons: [
      { title: "CTI Fundamentals", summary: "Strategic, operational, and tactical cyber intelligence. The Diamond Model of intrusion analysis: adversary, capability, infrastructure, victim." },
      { title: "MITRE ATT&CK Framework", summary: "Tactics, Techniques, and Procedures (TTPs) taxonomy. 14 tactics, 200+ techniques. Using ATT&CK for detection engineering and threat modeling." },
      { title: "APT Group Profiling", summary: "Major APT groups: APT28/29 (Russia), APT1/41 (China), Lazarus (DPRK), APT33/35 (Iran). Attribution methodology: code reuse, infrastructure overlap, operational tempo." },
      { title: "Indicator of Compromise (IOC) Analysis", summary: "IOC types: hashes, IPs, domains, URLs, YARA rules. IOC lifecycle: collection, enrichment, aging, STIX/TAXII sharing. AlienVault OTX, MISP, VirusTotal." },
      { title: "Malware Analysis for Intel", summary: "Static and dynamic analysis. Sandbox detonation. Extracting C2 infrastructure. Code similarity analysis (SSDEEP, TLSH). Malware family tracking." },
      { title: "Dark Web Monitoring", summary: "Tor hidden services, I2P, Freenet. Dark web marketplace monitoring. Paste site monitoring. Forum intelligence. Cryptocurrency tracking." },
      { title: "Threat Hunting Methodology", summary: "Hypothesis-driven hunting. MITRE ATT&CK-based hunts. Data sources: EDR, NDR, SIEM, DNS logs. Hunting playbooks and notebooks." },
      { title: "Cyber Kill Chain", summary: "Lockheed Martin Cyber Kill Chain: recon → weaponize → deliver → exploit → install → C2 → act. Defending at each phase. Integrating with ATT&CK." },
      { title: "Threat Intelligence Platforms", summary: "Building and operating a TIP: MISP, TheHive, OpenCTI, ThreatConnect. Intelligence enrichment, correlation, and automated response." },
      { title: "CTI Reporting & Sharing", summary: "Writing CTI reports: adversary profile, campaign analysis, IOC appendix. STIX/TAXII sharing. TLP (Traffic Light Protocol). FIRST PSIRT standards." },
    ],
  },

  // ─── INTEL-510: Information Warfare ────────────────────────────
  {
    id: "intel-510",
    title: "Information Warfare & Influence Operations",
    category: "military_analysis",
    difficulty: "advanced",
    prerequisites: ["intel-100"],
    targetSpecializations: ["InfoWarSpecialist", "OSINTAnalyst", "CounterIntelOfficer"],
    competencies: ["PSYOP", "Narrative analysis", "Deepfake detection", "Influence mapping"],
    modeledAfter: "US Army PSYOP School + GCHQ Joint Threat Research Intelligence Group (JTRIG)",
    lessons: [
      { title: "Information Operations Doctrine", summary: "IO pillars: PSYOP, MILDEC, OPSEC, EW, CNO. How information warfare fits into joint military operations. Legal authority and ROE." },
      { title: "Psychological Operations (PSYOP/MISO)", summary: "Military Information Support Operations: target audience analysis, media selection, message design, dissemination, effect measurement." },
      { title: "Social Media Manipulation", summary: "Bot networks, troll farms, coordinated inauthentic behavior. Platform manipulation techniques. Astroturfing. Organic amplification vs artificial." },
      { title: "Deepfake Detection & Forensics", summary: "AI-generated imagery, audio, video. Detection methods: frequency analysis, facial landmark inconsistencies, provenance tracking. C2PA standards." },
      { title: "Narrative Warfare", summary: "Strategic narrative construction. 'Whole-of-narrative' approach. Counter-narrative design. Prebunking vs debunking. The Firehose of Falsehood model." },
      { title: "Russian Active Measures", summary: "SVR/GRU information warfare: Internet Research Agency, DCLeaks, hack-and-leak operations. Historical active measures: Operation INFEKTION, dezinformatsiya." },
      { title: "Chinese Influence Operations", summary: "United Front Work Department. Wolf Warrior diplomacy. TikTok as information warfare platform. Belt & Road narrative management. Taiwan disinformation." },
      { title: "Election Interference Operations", summary: "Techniques: voter suppression messaging, candidate amplification, poll manipulation, results delegitimization. Detection and attribution methods." },
      { title: "Counter-Influence Strategies", summary: "Inoculation theory: prebunking. Media literacy campaigns. Rapid response fact-checking. Technical countermeasures. Building societal resilience." },
    ],
  },

  // ─── INTEL-600: Strategic Warning ──────────────────────────────
  {
    id: "intel-600",
    title: "Strategic Warning & Indications Analysis",
    category: "criticality",
    difficulty: "advanced",
    prerequisites: ["intel-100", "intel-400"],
    targetSpecializations: ["WarningAnalyst", "AllSourceAnalyst", "IntelDirector"],
    competencies: ["I&W methodology", "Threat forecasting", "Alert dissemination"],
    modeledAfter: "DIA National Intelligence Warning Staff (NIWS)",
    lessons: [
      { title: "Warning Intelligence Doctrine", summary: "The Warning Problem: how to detect surprise attack. Strategic vs tactical warning. Warning time vs decision time. The cry-wolf dilemma." },
      { title: "Indications & Warning (I&W) Methodology", summary: "Building indicator lists: political, military, economic, logistical preparations. Weighting indicators by diagnosticity." },
      { title: "Pattern-Based Warning", summary: "Historical pattern matching: how past conflicts began. Pre-conflict signatures database. Bayesian updating of warning levels." },
      { title: "Systems-Based Warning", summary: "Modeling adversary decision systems. Understanding adversary red lines, trigger points, and decision cycles. Strategic calculus analysis." },
      { title: "Watchlisting & Alert Architecture", summary: "Multi-tier alert systems: Normal → Watch Condition → Warning → Imminent Threat → Attack. Alert dissemination: CRITIC, OPREP, SIGACT." },
      { title: "Preventing Surprise", summary: "Case studies in warning failure: Pearl Harbor, Yom Kippur, 9/11. Organizational pathologies that suppress warning. The Cassandra Effect." },
      { title: "Forecasting & Prediction Markets", summary: "Superforecasting (Tetlock). Prediction markets for intelligence. Calibration and Brier scores. AI-assisted early warning models." },
      { title: "Crisis Management Intelligence Support", summary: "Real-time intelligence support during crises. Situation room briefings. Decision support under time pressure. Battle update assessments." },
    ],
  },

  // ─── INTEL-610: Intelligence Leadership ────────────────────────
  {
    id: "intel-610",
    title: "Intelligence Leadership & Production",
    category: "military_analysis",
    difficulty: "advanced",
    prerequisites: ["intel-100", "intel-400"],
    targetSpecializations: ["IntelDirector", "IntelligenceBriefWriter", "AllSourceAnalyst"],
    competencies: ["PDB-style briefing", "Intelligence management", "Stakeholder communication"],
    modeledAfter: "CIA Office of the Director — PDB Staff",
    lessons: [
      { title: "The President's Daily Brief (PDB)", summary: "History, format, and production process. Writing PDB articles: concision, actionability, 'so what?' analysis. PDB briefing methodology." },
      { title: "Intelligence Product Lines", summary: "PDB, SNIE, NIE, INTSUM, IIR, threat assessment, current intelligence, estimative intelligence. Product taxonomy and audience matching." },
      { title: "Managing Analysis Teams", summary: "Building diverse analytic teams. Red team integration. Managing analytic disagreement. Fostering alternative analysis. Performance metrics." },
      { title: "Briefing Senior Leaders", summary: "Verbal briefing techniques. Anticipating questions. Managing classified/unclassified environments. Building trust with consumers. The 'elevator pitch'." },
      { title: "Intelligence Coordination", summary: "Inter-agency coordination: NIC coordination process, footnote dissents. Intelligence community coordination committees. Resolving analytic disputes." },
      { title: "Strategic Intelligence Planning", summary: "Intelligence community strategic plans. Capability vs intent analysis. Net assessment methodology. Long-range analytic planning." },
      { title: "Ethics in Intelligence Leadership", summary: "Maintaining analytic integrity. Resisting politicization. Whistleblower protections. Classified information management. Duty to warn." },
    ],
  },

  // ─── INTEL-700: Covert Operations ──────────────────────────────
  {
    id: "intel-700",
    title: "Covert Action & Denied Area Operations",
    category: "military_analysis",
    difficulty: "advanced",
    prerequisites: ["intel-100", "intel-210", "intel-410"],
    targetSpecializations: ["HUMINTOfficer", "CounterIntelOfficer", "IntelDirector"],
    competencies: ["Cover development", "Denied area tradecraft", "Covert action planning"],
    modeledAfter: "CIA Special Activities Center (SAC) + MI6 Operations",
    lessons: [
      { title: "Covert Action Fundamentals", summary: "Title 50 authority. Presidential Finding requirement. Types: political action, propaganda, paramilitary, economic disruption, cyber operations." },
      { title: "Denied Area Operations", summary: "Operating in hostile or denied territory. Black operations: no official presence. Alias travel, cache sites, safe houses, exfiltration planning." },
      { title: "Surveillance & Counter-Surveillance", summary: "Foot and vehicular surveillance techniques. Surveillance Detection Routes (SDR). Counter-surveillance: identifying and evading hostile surveillance." },
      { title: "Technical Operations (TECHOPS)", summary: "Clandestine entry, lock-picking, safe-cracking, implant placement. Audio/video surveillance device deployment. Digital exploitation." },
      { title: "Paramilitary Operations", summary: "Foreign internal defense, unconventional warfare, direct action. Working with partner forces. Ground branch operations. Political-military strategy." },
      { title: "Cyber Covert Action", summary: "Stuxnet case study. Offensive cyber operations: implant development, C2 infrastructure, effect creation. Attribution risk management." },
      { title: "Plausible Deniability & Cutouts", summary: "Designing operations for deniability. Using intermediaries and cutouts. Front organizations. Managing blowback risk." },
      { title: "Capstone: Full Intelligence Operation", summary: "Design an end-to-end intelligence operation: requirements → collection plan → source recruitment → analysis → product dissemination → policy impact." },
    ],
  },

  // ─── INTEL-800: Advanced MASINT ────────────────────────────────
  {
    id: "intel-800",
    title: "MASINT: Measurement & Signature Intelligence",
    category: "military_analysis",
    difficulty: "advanced",
    prerequisites: ["intel-100", "intel-300"],
    targetSpecializations: ["SIGINTAnalyst", "GEOINTAnalyst", "WarningAnalyst"],
    competencies: ["Nuclear detection", "Spectral analysis", "Seismic/acoustic intelligence"],
    modeledAfter: "DIA Central MASINT Organization (CMO)",
    lessons: [
      { title: "MASINT Fundamentals", summary: "Six MASINT sub-disciplines: radar, electro-optical, nuclear, geophysical, materials, radiofrequency. Unique intelligence from physical phenomena." },
      { title: "Nuclear Intelligence (NUCINT)", summary: "Detecting nuclear detonations: atmospheric sampling, seismic detection (CTBTO IMS), hydroacoustic, infrasound. Yield estimation. Fallout prediction." },
      { title: "Infrared Intelligence", summary: "Thermal signatures of military equipment. Missile plume detection (DSP/SBIRS satellites). Industrial activity monitoring via thermal emissions." },
      { title: "Acoustic Intelligence (ACINT)", summary: "Submarine detection via SOSUS arrays. Underwater acoustic signature databases. Gunshot detection systems. Seismic monitoring for underground tests." },
      { title: "Chemical/Biological Detection", summary: "Remote CBW detection: standoff sensors, point detectors, spectroscopic analysis. Biological agent identification. CW precursor monitoring." },
      { title: "MASINT for WMD Monitoring", summary: "Comprehensive WMD monitoring: nuclear, chemical, biological, missile. Integrating MASINT with SIGINT/GEOINT for non-proliferation." },
    ],
  },
];

// ─── API ────────────────────────────────────────────────────────

/** Get all intelligence courses */
export function getIntelligenceCourses(): IntelligenceCourse[] {
  return [...INTELLIGENCE_CURRICULUM];
}

/** Get course by ID */
export function getIntelligenceCourse(id: string): IntelligenceCourse | null {
  return INTELLIGENCE_CURRICULUM.find((c) => c.id === id) ?? null;
}

/** Get courses for a specific specialization */
export function getCoursesForSpecialization(spec: string): IntelligenceCourse[] {
  return INTELLIGENCE_CURRICULUM.filter((c) => c.targetSpecializations.includes(spec));
}

/** Get total stats */
export function getIntelligenceCurriculumStats() {
  const totalLessons = INTELLIGENCE_CURRICULUM.reduce((sum, c) => sum + c.lessons.length, 0);
  return {
    totalCourses: INTELLIGENCE_CURRICULUM.length,
    totalLessons,
    specializations: [...new Set(INTELLIGENCE_CURRICULUM.flatMap((c) => c.targetSpecializations))],
    difficulties: {
      beginner: INTELLIGENCE_CURRICULUM.filter((c) => c.difficulty === "beginner").length,
      intermediate: INTELLIGENCE_CURRICULUM.filter((c) => c.difficulty === "intermediate").length,
      advanced: INTELLIGENCE_CURRICULUM.filter((c) => c.difficulty === "advanced").length,
    },
    modeledAfter: [...new Set(INTELLIGENCE_CURRICULUM.map((c) => c.modeledAfter))],
  };
}

/** Get prerequisite chain for a course */
export function getPrerequisiteChain(courseId: string): IntelligenceCourse[] {
  const course = INTELLIGENCE_CURRICULUM.find((c) => c.id === courseId);
  if (!course || !course.prerequisites) { return []; }
  const chain: IntelligenceCourse[] = [];
  for (const prereqId of course.prerequisites) {
    const prereq = INTELLIGENCE_CURRICULUM.find((c) => c.id === prereqId);
    if (prereq) {
      chain.push(...getPrerequisiteChain(prereq.id), prereq);
    }
  }
  return chain;
}
