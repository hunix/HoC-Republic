/**
 * Republic Platform — Education System
 *
 * Citizens can enroll in courses, attend classes, and earn knowledge.
 * Education is autonomous — the system creates courses based on Republic needs,
 * assigns teachers from skilled citizens, and enrolls students automatically.
 *
 * Course types:
 * - Specialization training (tied to citizen's spec)
 * - Cross-training (learn from other specializations)
 * - Research seminars (advance tech tree)
 * - Apprenticeships (hands-on with mentors)
 */

import { addEpisodicMemory, addSemanticMemory, recordProcedure } from "./memory.js";
import type { Citizen, RepublicState } from "./types.js";
import { rand, rng } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

export interface Course {
  id: string;
  name: string;
  domain: string;
  /** Teacher citizen ID */
  teacherId: string;
  /** Enrolled student IDs */
  students: string[];
  /** Ticks remaining for this course */
  ticksRemaining: number;
  /** Knowledge gained upon completion (0.0–1.0) */
  knowledgeGain: number;
  /** Max students */
  capacity: number;
  /** Difficulty 0.0–1.0 */
  difficulty: number;
}

/** Active courses in the Republic */
let activeCourses: Course[] = [];

// ─── Configuration ──────────────────────────────────────────────

const MAX_COURSES = 1000;
const COURSE_DURATION_TICKS = 20;
const AUTO_ENROLL_CHANCE = 0.5;
const TEACHING_SKILL_THRESHOLD = 3;

// ─── Course Domains ─────────────────────────────────────────────

/** Comprehensive curriculum covering software development, creative production, and professional skills */
const COURSE_DOMAINS = [
  // Software Development
  "web-development",
  "mobile-development",
  "system-design",
  "devops",
  "database-engineering",
  "api-design",
  "testing",
  "security",
  "algorithms",
  "cloud-architecture",
  "frontend",
  "backend",
  "microservices",
  "distributed-systems",
  "data-structures",
  // Creative Production
  "ui-ux-design",
  "graphic-design",
  "video-production",
  "audio-engineering",
  "3d-modeling",
  "animation",
  "copywriting",
  "content-strategy",
  "photography",
  "branding",
  "game-design",
  "storytelling",
  // Professional Skills
  "project-management",
  "agile-methodology",
  "technical-writing",
  "data-analysis",
  "machine-learning",
  "product-management",
  "leadership",
  "communication",
  "research",
  "entrepreneurship",
  // General Knowledge
  "general",
  "mathematics",
  "physics",
  "economics",
  "philosophy",
  // Emerging Tech
  "cybersecurity",
  "blockchain",
  "quantum-computing",
  "edge-computing",
  "ai-ethics",
  "robotics",
  "iot",
  "natural-language-processing",
  "computer-vision",
  "reinforcement-learning",
  "bioinformatics",
  // Business & Social Sciences
  "digital-marketing",
  "supply-chain",
  "behavioral-science",
  "sustainability",
  "financial-engineering",
  "legal-tech",
  // Arts & Humanities
  "creative-writing",
  "music-theory",
  "digital-humanities",
  "cognitive-science",
  "linguistics",
  // Expanded Domains — Phase 50
  "medicine",
  "surgery",
  "pharmacology",
  "nursing",
  "law",
  "constitutional-law",
  "intellectual-property",
  "aerospace-engineering",
  "astrophysics",
  "orbital-mechanics",
  "forensic-science",
  "criminology",
  "urban-planning",
  "civil-engineering",
  "architecture-design",
  "marine-biology",
  "oceanography",
  "ecology",
  "psychology",
  "neuroscience",
  "behavioral-therapy",
  "political-science",
  "international-relations",
  "diplomacy",
  "agriculture-tech",
  "precision-farming",
  "food-science",
  "automotive-engineering",
  "electric-vehicles",
  "autonomous-driving",
  "climate-science",
  "renewable-energy",
  "environmental-policy",
  "game-development",
  "procedural-generation",
  "multiplayer-networking",
  "devrel",
  "developer-experience",
  "open-source",
];

/** Course name templates per domain for richer naming */
const COURSE_NAMES: Record<string, string[]> = {
  "web-development": [
    "Modern Web Development",
    "Full-Stack Mastery",
    "Progressive Web Apps",
    "Responsive Design Workshop",
  ],
  "mobile-development": [
    "Cross-Platform Mobile Apps",
    "Native App Architecture",
    "Mobile UX Patterns",
  ],
  "system-design": [
    "System Design Principles",
    "Scalable Architecture",
    "High-Availability Systems",
  ],
  devops: ["CI/CD Pipeline Engineering", "Infrastructure as Code", "Container Orchestration"],
  "database-engineering": [
    "Advanced SQL Techniques",
    "NoSQL Architectures",
    "Database Performance Tuning",
  ],
  "api-design": ["RESTful API Design", "GraphQL Masterclass", "API Security Best Practices"],
  testing: ["Test-Driven Development", "End-to-End Testing", "Performance Testing Strategies"],
  security: [
    "Application Security",
    "Threat Modeling",
    "Secure Coding Practices",
    "Penetration Testing",
  ],
  algorithms: ["Algorithm Design & Analysis", "Dynamic Programming", "Graph Algorithms"],
  "cloud-architecture": [
    "Cloud-Native Design",
    "Serverless Architecture",
    "Multi-Cloud Strategies",
  ],
  frontend: [
    "Advanced CSS Techniques",
    "JavaScript Frameworks Deep Dive",
    "Accessibility Standards",
  ],
  backend: ["Server Architecture Patterns", "Event-Driven Systems", "Message Queue Design"],
  microservices: ["Microservices Patterns", "Service Mesh Architecture", "Domain-Driven Design"],
  "distributed-systems": [
    "Distributed Computing Theory",
    "Consensus Algorithms",
    "CAP Theorem Applied",
  ],
  "data-structures": [
    "Advanced Data Structures",
    "Hash Maps & Trees",
    "Concurrent Data Structures",
  ],
  "ui-ux-design": ["Human-Centered Design", "Interaction Design", "Design Systems Workshop"],
  "graphic-design": ["Visual Communication", "Typography Mastery", "Color Theory & Application"],
  "video-production": ["Digital Filmmaking", "Motion Graphics", "Video Editing Techniques"],
  "audio-engineering": ["Sound Design Fundamentals", "Music Production", "Audio Post-Production"],
  "3d-modeling": ["3D Modeling & Texturing", "Procedural Generation", "Environmental Art"],
  animation: ["2D Animation Principles", "Character Animation", "Procedural Animation"],
  copywriting: ["Technical Copywriting", "Persuasive Writing", "Content for Developers"],
  "content-strategy": ["Content Architecture", "Editorial Planning", "Knowledge Management"],
  photography: ["Digital Photography", "Product Photography", "Photo Composition"],
  branding: ["Brand Identity Design", "Brand Strategy", "Visual Branding Systems"],
  "game-design": ["Game Mechanics Design", "Level Design", "Narrative Game Design"],
  storytelling: ["Interactive Storytelling", "World Building", "Narrative Design"],
  "project-management": [
    "Project Planning & Execution",
    "Risk Management",
    "Stakeholder Communication",
  ],
  "agile-methodology": ["Scrum Mastery", "Kanban Systems", "Agile Estimation Techniques"],
  "technical-writing": ["Documentation Best Practices", "API Documentation", "Developer Guides"],
  "data-analysis": ["Data Visualization", "Statistical Methods", "Business Intelligence"],
  "machine-learning": ["ML Fundamentals", "Deep Learning Architectures", "NLP Techniques"],
  "product-management": ["Product Discovery", "Roadmap Planning", "User Research Methods"],
  leadership: ["Technical Leadership", "Team Building", "Decision-Making Frameworks"],
  communication: ["Cross-Team Communication", "Technical Presentations", "Conflict Resolution"],
  research: ["Research Methods", "Literature Review", "Experimental Design"],
  entrepreneurship: ["Startup Foundations", "Business Model Design", "Growth Strategies"],
  general: ["Fundamentals", "Critical Thinking", "Problem-Solving Workshop"],
  mathematics: ["Linear Algebra for Engineers", "Probability & Statistics", "Discrete Mathematics"],
  physics: ["Computational Physics", "Signal Processing", "Quantum Computing Basics"],
  economics: ["Microeconomics for Tech", "Platform Economics", "Game Theory"],
  philosophy: ["Ethics in Technology", "Philosophy of AI", "Logic & Reasoning"],
  // Phase 40: Expanded Domains
  cybersecurity: [
    "Network Defense Strategies",
    "Ethical Hacking",
    "Security Operations Center",
    "Zero Trust Architecture",
  ],
  blockchain: [
    "Distributed Ledger Technology",
    "Smart Contract Development",
    "DeFi Architecture",
    "Consensus Mechanisms",
  ],
  "quantum-computing": [
    "Quantum Algorithms",
    "Quantum Error Correction",
    "Quantum Machine Learning",
  ],
  "edge-computing": ["Edge Architecture", "Fog Computing", "Real-Time Edge Analytics"],
  "ai-ethics": [
    "Responsible AI Development",
    "Bias Detection & Mitigation",
    "AI Governance Frameworks",
  ],
  robotics: ["Robot Kinematics", "Autonomous Navigation", "Human-Robot Interaction"],
  iot: ["IoT System Architecture", "Sensor Networks", "Industrial IoT Security"],
  "natural-language-processing": [
    "Transformer Models",
    "Text Generation",
    "Sentiment Analysis at Scale",
  ],
  "computer-vision": ["Object Detection & Segmentation", "Visual SLAM", "Generative Vision Models"],
  "reinforcement-learning": ["Policy Gradient Methods", "Multi-Agent RL", "Reward Shaping"],
  bioinformatics: [
    "Genomic Data Analysis",
    "Protein Structure Prediction",
    "Computational Drug Discovery",
  ],
  "digital-marketing": ["Growth Hacking", "SEO & SEM Mastery", "Marketing Automation"],
  "supply-chain": ["Logistics Optimization", "Supply Chain Digitization", "Demand Forecasting"],
  "behavioral-science": ["Nudge Theory", "Decision Architecture", "Behavioral Economics"],
  sustainability: ["Green Computing", "Circular Economy Design", "Carbon Footprint Optimization"],
  "financial-engineering": [
    "Quantitative Finance",
    "Risk Modeling",
    "Algorithmic Trading Strategies",
  ],
  "legal-tech": ["Legal AI Systems", "Contract Automation", "Regulatory Compliance"],
  "creative-writing": ["Fiction Workshop", "Screenwriting", "Poetry & Prose"],
  "music-theory": ["Harmony & Counterpoint", "Digital Composition", "Music Information Retrieval"],
  "digital-humanities": [
    "Digital Archive Methods",
    "Computational Literary Analysis",
    "Cultural Analytics",
  ],
  "cognitive-science": ["Neural Computation", "Cognitive Modeling", "Perception & Attention"],
  linguistics: ["Computational Linguistics", "Morphology & Syntax", "Language Evolution"],
  // Phase 50: Expanded Domains
  medicine: [
    "Clinical Medicine Fundamentals",
    "Evidence-Based Practice",
    "Diagnostic Reasoning",
    "Emergency Medicine",
  ],
  surgery: ["Surgical Techniques", "Minimally Invasive Surgery", "Orthopedic Procedures"],
  pharmacology: ["Drug Interactions", "Pharmacokinetics", "Clinical Pharmacology"],
  nursing: ["Patient Care Excellence", "Critical Care Nursing", "Community Health"],
  law: ["Legal Reasoning", "Civil Procedure", "Criminal Law Essentials"],
  "constitutional-law": ["Constitutional Interpretation", "Rights & Liberties", "Judicial Review"],
  "intellectual-property": ["Patent Law", "Copyright & Digital Media", "Trademark Strategy"],
  "aerospace-engineering": ["Aerodynamics", "Propulsion Systems", "Spacecraft Design"],
  astrophysics: ["Stellar Evolution", "Cosmology", "Gravitational Wave Analysis"],
  "orbital-mechanics": ["Trajectory Planning", "Orbital Transfers", "Satellite Dynamics"],
  "forensic-science": ["DNA Analysis", "Digital Forensics", "Toxicology"],
  criminology: ["Criminal Profiling", "Cybercrime Investigation", "Victimology"],
  "urban-planning": ["Smart City Design", "Transit-Oriented Development", "Zoning & Land Use"],
  "civil-engineering": ["Structural Engineering", "Geotechnical Analysis", "Infrastructure Design"],
  "architecture-design": ["Sustainable Architecture", "Parametric Design", "Urban Aesthetics"],
  "marine-biology": ["Marine Ecosystems", "Deep Sea Exploration", "Coral Reef Conservation"],
  oceanography: ["Physical Oceanography", "Ocean Circulation", "Marine Geophysics"],
  ecology: ["Ecosystem Dynamics", "Conservation Biology", "Biodiversity Assessment"],
  psychology: ["Clinical Psychology", "Developmental Psychology", "Social Psychology"],
  neuroscience: ["Neuroimaging", "Synaptic Plasticity", "Computational Neuroscience"],
  "behavioral-therapy": ["CBT Techniques", "Mindfulness-Based Therapy", "Exposure Therapy"],
  "political-science": ["Comparative Politics", "Public Policy Analysis", "Political Theory"],
  "international-relations": ["Geopolitics", "Global Governance", "Conflict Resolution"],
  diplomacy: ["Diplomatic Protocol", "Negotiation Strategies", "Treaty Drafting"],
  "agriculture-tech": ["Precision Agriculture", "IoT in Farming", "Crop Monitoring"],
  "precision-farming": ["Drone-Based Surveying", "Soil Sensor Networks", "Yield Optimization"],
  "food-science": ["Food Safety", "Nutritional Biochemistry", "Food Processing Tech"],
  "automotive-engineering": ["Vehicle Dynamics", "Powertrain Systems", "ADAS Design"],
  "electric-vehicles": ["Battery Technology", "EV Charging Infrastructure", "Motor Control"],
  "autonomous-driving": ["Sensor Fusion for AD", "Path Planning", "V2X Communication"],
  "climate-science": ["Climate Modeling", "Carbon Cycle Analysis", "Paleoclimatology"],
  "renewable-energy": ["Solar PV Design", "Wind Energy Systems", "Energy Storage"],
  "environmental-policy": ["Environmental Law", "Sustainability Metrics", "ESG Frameworks"],
  "game-development": ["Game Physics Engines", "Shader Programming", "Procedural Content"],
  "procedural-generation": ["Noise Functions", "L-Systems", "Wave Function Collapse"],
  "multiplayer-networking": ["Netcode Architecture", "State Synchronization", "Anti-Cheat"],
  devrel: ["Developer Advocacy", "API Documentation", "Community Building"],
  "developer-experience": ["CLI Design", "SDK Architecture", "Developer Onboarding"],
  "open-source": ["OSS Licensing", "Contribution Workflows", "Community Governance"],
};

// ─── Course Generation ──────────────────────────────────────────

/**
 * Generate a course taught by a qualified citizen.
 * A citizen qualifies as teacher if they have enough skills.
 */
function generateCourse(teacher: Citizen): Course {
  // 40% chance: teacher's specialization domain, 60% chance: random from full curriculum
  const useSpec = rng() < 0.4;
  const domain = useSpec
    ? teacher.specialization.toLowerCase()
    : COURSE_DOMAINS[rand(0, COURSE_DOMAINS.length - 1)];

  // Pick a course name from the template, or generate one
  const namePool = COURSE_NAMES[domain];
  const courseName = namePool
    ? namePool[rand(0, namePool.length - 1)]
    : `${domain.charAt(0).toUpperCase() + domain.slice(1).replace(/-/g, " ")} Workshop`;

  return {
    id: `course-${Date.now()}-${rand(100000, 999999)}`,
    name: `${courseName} (by ${teacher.name})`,
    domain,
    teacherId: teacher.id,
    students: [],
    ticksRemaining: COURSE_DURATION_TICKS,
    knowledgeGain: Math.min(1.0, 0.3 + teacher.skillCount * 0.05),
    capacity: 50,
    difficulty: Math.min(1.0, teacher.skillCount * 0.1),
  };
}

/**
 * Manually create a new course. Called by citizen tool.
 */
export function createCourse(teacher: Citizen, domain: string, name: string): Course | null {
  if (activeCourses.length >= MAX_COURSES) {return null;}
  const course: Course = {
    id: `course-${Date.now()}-${rand(100000, 999999)}`,
    name: `${name} (by ${teacher.name})`,
    domain,
    teacherId: teacher.id,
    students: [],
    ticksRemaining: COURSE_DURATION_TICKS,
    knowledgeGain: Math.min(1.0, 0.4 + teacher.skillCount * 0.05),
    capacity: 50,
    difficulty: Math.min(1.0, teacher.skillCount * 0.1),
  };
  activeCourses.push(course);
  return course;
}

// ─── Education Tick ─────────────────────────────────────────────

/**
 * Main education tick. Called from the simulation loop.
 *
 * 1. Create new courses if below capacity
 * 2. Auto-enroll citizens who need training
 * 3. Progress active courses
 * 4. Graduate students from completed courses
 */
export function educationTick(s: RepublicState): void {
  // 1. Create new courses if below MAX
  if (activeCourses.length < MAX_COURSES) {
    const potentialTeachers = s.citizens.filter(
      (c) => c.skillCount >= TEACHING_SKILL_THRESHOLD && c.energy > 30,
    );
    if (potentialTeachers.length > 0) {
      const teacher = potentialTeachers[rand(0, potentialTeachers.length - 1)];
      // Don't let a citizen teach multiple courses
      if (!activeCourses.some((c) => c.teacherId === teacher.id)) {
        activeCourses.push(generateCourse(teacher));
      }
    }
  }

  // 2. Auto-enroll citizens
  for (const course of activeCourses) {
    if (course.students.length >= course.capacity) {continue;}

    for (const citizen of s.citizens) {
      if (course.students.length >= course.capacity) {break;}
      if (citizen.id === course.teacherId) {continue;}
      if (course.students.includes(citizen.id)) {continue;}
      if (citizen.energy < 20) {continue;}

      // Citizens are more likely to enroll if they lack skills or have low skill count
      const enrollChance = AUTO_ENROLL_CHANCE * (1 - citizen.skillCount * 0.05);
      if (rng() < enrollChance) {
        course.students.push(citizen.id);
      }
    }
  }

  // 3. Progress and graduate
  const completedCourses: Course[] = [];
  for (const course of activeCourses) {
    course.ticksRemaining--;

    if (course.ticksRemaining <= 0) {
      completedCourses.push(course);
      graduateCourse(s, course);
    }
  }

  // Remove completed courses
  activeCourses = activeCourses.filter((c) => c.ticksRemaining > 0);
}

/**
 * Graduate students from a completed course.
 * Awards skills, knowledge memories, and happiness.
 */
function graduateCourse(s: RepublicState, course: Course): void {
  for (const studentId of course.students) {
    const student = s.citizens.find((c) => c.id === studentId);
    if (!student) {continue;}

    // Award skill
    const newSkill = `${course.domain} (${course.name.split("(")[0].trim()})`;
    if (!student.skills.includes(newSkill)) {
      student.skills.push(newSkill);
      student.skillCount = student.skills.length;
    }

    // Phase 40: Update skill proficiency & intelligence metrics
    if (!student.skillProficiency) {student.skillProficiency = {};}
    const lr = student.learningRate ?? 1.0;
    const iq = (student.intelligence ?? 100) / 100; // normalize to multiplier
    const profGain = course.knowledgeGain * lr * iq * 0.15; // scaled gain
    const prevProf = student.skillProficiency[course.domain] ?? 0;
    student.skillProficiency[course.domain] = Math.min(1, prevProf + profGain);

    // Slight intelligence boost from learning (diminishing returns)
    student.intelligence = Math.min(150, Math.round((student.intelligence ?? 100) + 0.2 * lr));

    // Recalculate mastery level (average across all proficiencies)
    const profValues = Object.values(student.skillProficiency);
    student.masteryLevel =
      profValues.length > 0 ? profValues.reduce((a, b) => a + b, 0) / profValues.length : 0;

    // Boost autonomy — more educated citizens make better decisions
    student.autonomyScore = Math.min(1, (student.autonomyScore ?? 0) + 0.02 * lr);

    // Semantic memory: learned knowledge
    addSemanticMemory(studentId, {
      content: `Completed course: ${course.name}. Gained knowledge in ${course.domain}.`,
      domain: course.domain,
      source: "education",
      confidence: course.knowledgeGain,
      learnedAt: s.currentTick,
    });

    // Episodic memory: graduation event
    addEpisodicMemory(studentId, {
      tick: s.currentTick,
      timestamp: new Date().toISOString(),
      description: `Graduated from "${course.name}"`,
      valence: 0.7,
      importance: 0.6,
      involvedCitizenIds: [course.teacherId],
      tags: ["education", course.domain, "graduation"],
    });

    // Procedural memory: learning skill
    recordProcedure(
      studentId,
      `study:${course.domain}`,
      `Study ${course.domain}`,
      true,
      s.currentTick,
    );

    // Happiness boost
    student.happiness = Math.min(100, student.happiness + 10);

    // Phase 50: Respecialization — citizens who study many courses in a
    // domain matching another specialization may switch careers.
    const domainSkillCount = student.skills.filter((sk) => sk.startsWith(course.domain)).length;
    if (domainSkillCount >= 3 && rng() < 0.15) {
      const specMap: Record<string, string> = {
        // Core
        "mobile-development": "Developer",
        backend: "Developer",
        "system-design": "Architect",
        "architecture-design": "Architect",
        algorithms: "Mathematician",
        mathematics: "Mathematician",
        "data-structures": "Analyst",
        research: "Researcher",
        astrophysics: "Scientist",
        physics: "Scientist",
        neuroscience: "Scientist",
        bioinformatics: "Scientist",
        medicine: "Doctor",
        surgery: "Doctor",
        pharmacology: "Doctor",
        psychology: "Psychologist",
        "behavioral-therapy": "Psychologist",
        law: "Diplomat",
        "constitutional-law": "Diplomat",
        diplomacy: "Diplomat",
        "international-relations": "Diplomat",
        "civil-engineering": "Engineer",
        "aerospace-engineering": "Engineer",
        "project-management": "Planner",
        "agile-methodology": "Planner",
        leadership: "Strategist",
        economics: "Analyst",
        "financial-engineering": "Analyst",
        photography: "Artist",
        animation: "Artist",
        "creative-writing": "Writer",
        copywriting: "Writer",
        storytelling: "Writer",
        "agriculture-tech": "Farmer",
        "precision-farming": "Farmer",
        "supply-chain": "Manufacturer",
        // Phase 50: Production-focused specializations
        "video-production": "Filmmaker",
        "3d-modeling": "Filmmaker",
        "audio-engineering": "Composer",
        "music-theory": "Composer",
        frontend: "WebDeveloper",
        "web-development": "WebDeveloper",
        "game-development": "GameDeveloper",
        "game-design": "GameDeveloper",
        "procedural-generation": "GameDeveloper",
        "machine-learning": "DataScientist",
        "data-analysis": "DataScientist",
        "reinforcement-learning": "DataScientist",
        "ui-ux-design": "Designer",
        "graphic-design": "Designer",
        branding: "Designer",
        devops: "DevOpsEngineer",
        "cloud-architecture": "DevOpsEngineer",
        cybersecurity: "SecurityExpert",
        "digital-marketing": "ContentCreator",
        "content-strategy": "ContentCreator",
        "product-management": "ProductManager",
      };
      const newSpec = specMap[course.domain];
      if (newSpec && newSpec !== student.specialization) {
        const oldSpec = student.specialization;
        student.specialization = newSpec as typeof student.specialization;
        // Emit respec event
        s.events.push({
          citizenId: student.id,
          citizenName: student.name ?? student.id,
          type: "Promotion",
          description: `${student.name} respecialized from ${oldSpec} → ${newSpec} after mastering ${course.domain}`,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  // Increment persistent graduation counter
  s.totalGraduations = (s.totalGraduations ?? 0) + course.students.length;
}

// ─── Queries ────────────────────────────────────────────────────

/** Get active courses */
export function getActiveCourses(): Course[] {
  return activeCourses;
}

/** Get courses a citizen is enrolled in */
export function getCitizenCourses(citizenId: string): Course[] {
  return activeCourses.filter((c) => c.students.includes(citizenId) || c.teacherId === citizenId);
}

/** Export for persistence */
export function exportEducationState(): Course[] {
  return activeCourses;
}

/** Import from persistence */
export function importEducationState(courses: Course[]): void {
  activeCourses = courses;
}

/** Reset (testing) */
export function resetEducation(): void {
  activeCourses = [];
}
