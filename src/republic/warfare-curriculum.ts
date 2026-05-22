/**
 * Warfare Education Curriculum
 *
 * Courses and knowledge items that educate citizens on military analysis,
 * warfare strategy, intelligence operations, and war correspondence.
 * Automatically seeded into the Republic's education system on startup.
 */

export interface WarfareCourse {
  id: string;
  title: string;
  category: "military_analysis" | "naval_warfare" | "missile_tech" | "geopolitics" | "war_correspondence" | "criticality";
  difficulty: "beginner" | "intermediate" | "advanced";
  lessons: { title: string; summary: string }[];
  prerequisites?: string[];
}

export const WARFARE_CURRICULUM: WarfareCourse[] = [
  // ─── Course 1: Introduction to Military Analysis ───────────────
  {
    id: "war-101",
    title: "Introduction to Military Analysis",
    category: "military_analysis",
    difficulty: "beginner",
    lessons: [
      { title: "What is Military Intelligence?", summary: "Overview of OSINT, HUMINT, SIGINT, and GEOINT — the four pillars of military intelligence gathering." },
      { title: "Order of Battle Analysis", summary: "How to identify, track, and assess enemy force composition, strength, equipment, and leadership." },
      { title: "Reading Satellite Imagery", summary: "Interpreting military installations, vehicle signatures, and activity patterns from overhead imagery." },
      { title: "Signals Analysis Fundamentals", summary: "Understanding radar emissions, communications intercepts, and electronic order of battle." },
      { title: "Military Geography", summary: "Terrain analysis, chokepoints, strategic waterways, and how geography shapes military operations." },
      { title: "Force Projection Analysis", summary: "Assessing a nation's ability to deploy military power beyond its borders — logistics, basing, airlift." },
      { title: "Threat Assessment Framework", summary: "Capability × Intent = Threat. How to produce structured threat assessments with confidence levels." },
      { title: "Intelligence Briefing Writing", summary: "Structuring reports: BLUF (Bottom Line Up Front), key judgments, evidence, dissent, confidence." },
      { title: "Open-Source Intelligence (OSINT)", summary: "Using publicly available data — social media, shipping trackers, flight radar — for military analysis." },
      { title: "Counter-Intelligence Awareness", summary: "Recognizing disinformation, denial & deception operations, and adversary influence campaigns." },
      { title: "Historical Case Studies", summary: "Analyzing intelligence failures and successes: Pearl Harbor, Cuban Missile Crisis, Gulf War." },
      { title: "Emerging Technology Threats", summary: "AI-driven warfare, autonomous weapons, cyber operations, hypersonic missiles, and space warfare." },
      { title: "Coalition Warfare Analysis", summary: "Analyzing multinational operations: NATO command structure, force interoperability, burden sharing." },
      { title: "Irregular Warfare & Insurgency", summary: "Understanding guerrilla tactics, counterinsurgency, hybrid warfare, and gray zone operations." },
      { title: "Capstone: Full Threat Assessment", summary: "Produce a comprehensive threat assessment for a real-world hotspot using all skills learned." },
    ],
  },

  // ─── Course 2: Naval Warfare & Carrier Operations ──────────────
  {
    id: "war-201",
    title: "Naval Warfare & Carrier Operations",
    category: "naval_warfare",
    difficulty: "intermediate",
    prerequisites: ["war-101"],
    lessons: [
      { title: "Naval Power Fundamentals", summary: "Types of naval vessels, their roles, and how navies project power through sea control and sea denial." },
      { title: "Carrier Strike Group Composition", summary: "Anatomy of a CSG: carrier, air wing, Aegis cruisers, destroyers, submarines, and supply ships." },
      { title: "Anti-Access / Area Denial (A2/AD)", summary: "How adversaries prevent naval power projection using shore-based missiles, submarines, and mines." },
      { title: "Submarine Warfare", summary: "SSN vs SSBN vs SSK: attack submarines, ballistic missile subs, and diesel-electric patrol boats." },
      { title: "Carrier Air Operations", summary: "Launch cycles, sortie generation rates, armed reconnaissance, suppression of enemy air defense." },
      { title: "Naval Chokepoints", summary: "Strategic waterways: Strait of Hormuz, Malacca, Bab el-Mandeb, Suez, GIUK Gap, Taiwan Strait." },
      { title: "Amphibious Assault Operations", summary: "Planning and executing opposed landings: LHDs, LCUs, Marines, air assault, shore bombardment." },
      { title: "Mine Warfare", summary: "Offensive mining, mine clearance, and how mines shape naval operations in confined waters." },
      { title: "Naval Electronic Warfare", summary: "Radar jamming, chaff, SIGINT at sea, and the electromagnetic battle in naval combat." },
      { title: "Fleet Tracking with OSINT", summary: "Using AIS data, satellite imagery, and flight patterns to track naval movements globally." },
    ],
  },

  // ─── Course 3: Missile Technology & Defense Systems ─────────────
  {
    id: "war-301",
    title: "Missile Technology & Defense Systems",
    category: "missile_tech",
    difficulty: "advanced",
    prerequisites: ["war-101"],
    lessons: [
      { title: "Ballistic Missile Fundamentals", summary: "ICBM, IRBM, SRBM, SLBM — trajectory types, range categories, and warhead delivery." },
      { title: "Cruise Missile Technology", summary: "Tomahawk, Kh-101, BrahMos — subsonic, supersonic, and terrain-following flight profiles." },
      { title: "Hypersonic Weapons", summary: "Hypersonic glide vehicles (HGV) and scramjet missiles: Avangard, Kinzhal, DF-ZF, ARRW." },
      { title: "Missile Defense Architectures", summary: "Layered defense: THAAD, Patriot PAC-3, Aegis BMD, Arrow-3, Iron Dome — boost/mid/terminal phase." },
      { title: "Nuclear Deterrence Theory", summary: "MAD, first strike, second strike, nuclear triad, launch-on-warning, no-first-use policies." },
      { title: "Anti-Ship Missile Threat", summary: "DF-21D 'carrier killer', P-800 Oniks, Harpoon, NSM — targeting and defeat mechanisms." },
      { title: "Drone & UAV Warfare", summary: "TB2 Bayraktar, MQ-9 Reaper, Shahed-136 — how drones changed modern warfare." },
      { title: "Air Defense Networks", summary: "S-400, S-300, NASAMS, IRIS-T — integrated air defense systems and SEAD/DEAD operations." },
      { title: "Proliferation & Arms Control", summary: "NPT, INF Treaty, New START — arms control frameworks and proliferation risks." },
      { title: "Missile Launch Detection", summary: "SBIRS, DSP satellites, ground-based radar — how missile launches are detected and characterized." },
      { title: "Directed Energy Weapons", summary: "Laser defense systems, microwave weapons, and their potential to change missile defense." },
      { title: "Space Warfare & ASAT", summary: "Anti-satellite weapons, space debris, GPS jamming, and the militarization of orbit." },
    ],
  },

  // ─── Course 4: Geopolitical Risk Assessment ────────────────────
  {
    id: "war-401",
    title: "Geopolitical Risk Assessment",
    category: "geopolitics",
    difficulty: "intermediate",
    lessons: [
      { title: "Country Instability Index (CII)", summary: "Multi-factor scoring: conflict signals, protest activity, economic stress, military posture, cyber threats." },
      { title: "War Risk Modeling", summary: "Probabilistic assessment using historical data, capability analysis, and current signal patterns." },
      { title: "Escalation Dynamics", summary: "How crises escalate: accidental escalation, deliberate brinkmanship, audience costs, red lines." },
      { title: "Economic Warfare", summary: "Sanctions, trade wars, energy weaponization, SWIFT exclusion, and financial warfare tools." },
      { title: "Alliance Networks & Commitments", summary: "NATO Article 5, AUKUS, Quad, SCO — mutual defense obligations and their credibility." },
      { title: "Regional Conflict Typology", summary: "Territorial disputes, ethnic conflicts, proxy wars, civil wars — classification and analysis." },
      { title: "Early Warning Indicators", summary: "Pre-conflict signatures: military mobilization, diplomatic recalls, media preparation, refugee flows." },
      { title: "Critical Infrastructure Vulnerability", summary: "Energy grids, communications, water systems, financial networks as strategic targets." },
      { title: "Information Warfare", summary: "Propaganda, deepfakes, social media manipulation, and influence operations in modern conflict." },
      { title: "Scenario Planning for Conflict", summary: "Building best-case, worst-case, and most-likely scenarios for potential conflicts." },
    ],
  },

  // ─── Course 5: War Correspondence & Reporting ──────────────────
  {
    id: "war-501",
    title: "War Correspondence & Reporting",
    category: "war_correspondence",
    difficulty: "intermediate",
    lessons: [
      { title: "Conflict Journalism Ethics", summary: "Truth, accuracy, impartiality — ethical obligations when reporting on military operations." },
      { title: "Narrative Construction", summary: "Building compelling narratives from intelligence data: structure, pacing, context, human element." },
      { title: "Visual Storytelling", summary: "Using maps, charts, satellite imagery, and video to communicate military events effectively." },
      { title: "Verifying Sources in Conflict", summary: "Cross-referencing OSINT, triangulating reports, identifying propaganda, and assessing reliability." },
      { title: "Mapping & Geospatial Reporting", summary: "Creating military situation maps, visualizing force movements, and annotating theater maps." },
      { title: "Real-Time Event Tracking", summary: "Monitoring and reporting on developing military situations as they unfold." },
      { title: "Simulation Script Writing", summary: "How to write scripts for animated war simulations: scene structure, camera movement, narration." },
      { title: "Video Production for Intel Briefings", summary: "Creating professional video briefings with map animations, voiceover, and data visualization." },
    ],
  },

  // ─── Course 6: Criticality Analysis & Early Warning ────────────
  {
    id: "war-601",
    title: "Criticality Analysis & Early Warning Systems",
    category: "criticality",
    difficulty: "advanced",
    prerequisites: ["war-101", "war-401"],
    lessons: [
      { title: "What is Criticality?", summary: "Defining criticality in geopolitical context: threshold effects, phase transitions, and tipping points." },
      { title: "Indicator Framework Design", summary: "Building structured indicator checklists for monitoring pre-conflict escalation patterns." },
      { title: "Velocity & Acceleration Metrics", summary: "Computing change rates in CII scores: 1h/6h/24h velocity, acceleration, and jerk indicators." },
      { title: "Threshold Detection Algorithms", summary: "Setting adaptive thresholds that minimize false positives while maintaining detection sensitivity." },
      { title: "Alert Tiering & Prioritization", summary: "Watch → Warning → Critical → Emergency: how to tier and route alerts effectively." },
      { title: "War Game Simulations", summary: "Designing tabletop exercises to test early warning systems and decision-making under pressure." },
      { title: "Automated Escalation Response", summary: "Designing automated response protocols for different alert levels and escalation scenarios." },
      { title: "Post-Crisis Analysis", summary: "After-action review: what indicators fired, what was missed, and how to improve detection." },
      { title: "Machine Learning for Prediction", summary: "Using ML models on historical conflict data to improve forecast accuracy." },
      { title: "Capstone: Build an Early Warning System", summary: "Design and implement a complete early warning system for a specific theater or conflict." },
    ],
  },
];

/** Get all warfare courses */
export function getWarfareCourses(): WarfareCourse[] {
  return [...WARFARE_CURRICULUM];
}

/** Get course by ID */
export function getWarfareCourse(id: string): WarfareCourse | null {
  return WARFARE_CURRICULUM.find((c) => c.id === id) ?? null;
}

/** Get total lesson count */
export function getWarfareCurriculumStats() {
  const totalLessons = WARFARE_CURRICULUM.reduce((sum, c) => sum + c.lessons.length, 0);
  return {
    totalCourses: WARFARE_CURRICULUM.length,
    totalLessons,
    categories: [...new Set(WARFARE_CURRICULUM.map((c) => c.category))],
    difficulties: { beginner: 1, intermediate: 3, advanced: 2 },
  };
}
