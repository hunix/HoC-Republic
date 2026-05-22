/**
 * Republic Platform — Autonomous Learning Engine
 *
 * Self-directed, goal-driven learning system that enables citizens
 * to autonomously study any professional domain, earn certifications,
 * and advance through degree levels.
 *
 * Key capabilities:
 * - Learning pathway generation (auto-sequence of study steps)
 * - Multiple acquisition methods (web research, mentorship, practice, etc.)
 * - Proficiency matrix tracking
 * - Autonomous study loop (tick integration)
 * - Certification exam generation and evaluation
 */

import {
    CERTIFICATION_ORDER,
    compareCertificationLevels, ensureDomainRegistry, getDegreeTemplate, getDomainAncestry, getDomainByPath, getNextLevel, syncToolDomains
} from "./professional-domains.js";
import type {
    Certification,
    CertificationLevel,
    LearningPathway,
    LearningStep,
    ProfessionalProfile,
    ProficiencyRecord,
    RepublicState,
    StudySession
} from "./types.js";
import { rng, ts, uid } from "./utils.js";

// ─── Constants ──────────────────────────────────────────────────

const BASE_STUDY_TICKS = 8;
const XP_PER_STUDY = 15;
const MENTORSHIP_XP_MULTIPLIER = 1.5;
const PRACTICE_XP_MULTIPLIER = 2.0;
const EXAM_XP_BONUS = 50;
const _MAX_ACTIVE_PATHWAYS = 3;
const RECERTIFICATION_TICKS = 500;
/** Ticks without studying before spaced-repetition review is injected */
const REVIEW_INTERVAL = 200;

// ─── Profile Management ─────────────────────────────────────────

/** Ensure a citizen has a professional profile initialized */
export function ensureProfile(s: RepublicState, citizenId: string): ProfessionalProfile {
  const citizen = s.citizens.find((c) => c.id === citizenId);
  if (!citizen) {
    throw new Error(`Citizen ${citizenId} not found`);
  }

  if (!citizen.professionalProfile) {
    citizen.professionalProfile = {
      certifications: [],
      proficiencies: {},
      totalCasesCompleted: 0,
      peerReviewAverage: 0,
    };
  }
  return citizen.professionalProfile;
}

/** Get or initialize a proficiency record for a domain */
function ensureProficiency(profile: ProfessionalProfile, domainPath: string): ProficiencyRecord {
  if (!profile.proficiencies[domainPath]) {
    profile.proficiencies[domainPath] = {
      domainPath,
      level: "none",
      xp: 0,
      casesCompleted: 0,
      practiceHours: 0,
      peerRating: 0,
      toolProficiencies: [],
      lastStudied: ts(),
    };
  }
  return profile.proficiencies[domainPath];
}

/**
 * Compute the XP reward for a study session, scaled by:
 * - citizen.learningRate (0.5–2.0, default 1.0)
 * - citizen.intelligence (50–150, mean 100) → +50% bonus at IQ 150
 */
function computeXpReward(baseXp: number, citizen: import("./types.js").Citizen): number {
  const learningRate = citizen.learningRate ?? 1.0;
  const intelligenceBonus = 1 + ((citizen.intelligence ?? 100) - 100) / 200; // 0.75–1.25 range
  return Math.round(baseXp * learningRate * intelligenceBonus);
}

// ─── Learning Pathway Generation ────────────────────────────────

/**
 * Generate an optimal learning pathway for a citizen to reach
 * a target certification level in a domain.
 *
 * The pathway auto-discovers prerequisites and sequences
 * study steps from foundational to advanced.
 */
export function generatePathway(
  s: RepublicState,
  citizenId: string,
  targetDomain: string,
  targetLevel: CertificationLevel = "bachelor",
): LearningPathway {
  ensureDomainRegistry(s);
  const profile = ensureProfile(s, citizenId);

  // Check if citizen already has an active pathway for this domain
  if (profile.currentPathway?.targetDomain === targetDomain) {
    return profile.currentPathway;
  }

  const domain = getDomainByPath(s, targetDomain);
  if (!domain) {
    throw new Error(`Domain "${targetDomain}" not found`);
  }

  // Build study steps from prerequisites up to target
  const steps: LearningStep[] = [];
  const ancestry = getDomainAncestry(s, domain.id);

  // Current proficiency
  const prof = profile.proficiencies[targetDomain];
  const currentLevel = prof?.level ?? "none";

  // ── Spaced Repetition Injection ───────────────────────────────────
  // If the citizen last studied this domain > REVIEW_INTERVAL ticks ago,
  // inject a lightweight review step at the very front of the pathway.
  if (prof?.lastStudied) {
    const tsNow = ts();
    const lastStudiedMs = new Date(prof.lastStudied).getTime();
    const nowMs = new Date(tsNow).getTime();
    const approxTicksAgo = Math.floor((nowMs - lastStudiedMs) / 1000); // treat 1s ≈ 1 tick
    if (approxTicksAgo > REVIEW_INTERVAL) {
      steps.push({
        id: `ls-${uid()}`,
        title: `Spaced Review: ${domain.name}`,
        domainPath: targetDomain,
        method: "documentStudy",
        xpReward: Math.round(XP_PER_STUDY * 0.4),
        ticksDuration: Math.round(BASE_STUDY_TICKS * 0.4),
        completed: false,
      });
    }
  }
  const currentIdx = currentLevel === "none" ? -1 : CERTIFICATION_ORDER.indexOf(currentLevel);
  const targetIdx = CERTIFICATION_ORDER.indexOf(targetLevel);

  // Generate steps for each level the citizen needs to pass through
  for (let i = currentIdx + 1; i <= targetIdx; i++) {
    const level = CERTIFICATION_ORDER[i];
    const template = getDegreeTemplate(level);

    // Step 1: Foundation study (read documentation for each ancestor domain)
    if (i === currentIdx + 1) {
      for (const ancestor of ancestry) {
        if (ancestor.path === targetDomain) {
          continue;
        }
        steps.push({
          id: `ls-${uid()}`,
          title: `Study ${ancestor.name} Fundamentals`,
          domainPath: ancestor.path,
          method: "documentStudy",
          xpReward: Math.round(XP_PER_STUDY * 0.5),
          ticksDuration: Math.round(BASE_STUDY_TICKS * 0.5),
          completed: false,
        });
      }
    }

    // Step 2: Domain-specific research
    steps.push({
      id: `ls-${uid()}`,
      title: `Research ${domain.name} (${level} level)`,
      domainPath: targetDomain,
      method: "webResearch",
      xpReward: XP_PER_STUDY,
      ticksDuration: BASE_STUDY_TICKS,
      completed: false,
    });

    // Step 3: Document study of core skills
    steps.push({
      id: `ls-${uid()}`,
      title: `Deep Study: ${domain.coreSkills.slice(0, 3).join(", ")}`,
      domainPath: targetDomain,
      method: "documentStudy",
      xpReward: Math.round(XP_PER_STUDY * 1.2),
      ticksDuration: Math.round(BASE_STUDY_TICKS * 1.5),
      completed: false,
    });

    // Step 4: Peer review (from diploma level onwards)
    if (i >= 1) {
      steps.push({
        id: `ls-${uid()}`,
        title: `Peer Review Session: ${domain.name}`,
        domainPath: targetDomain,
        method: "peerReview",
        xpReward: XP_PER_STUDY,
        ticksDuration: BASE_STUDY_TICKS,
        completed: false,
      });
    }

    // Step 5: Practice cases (from diploma level onwards)
    if (template.requiredCases > 0) {
      const casesNeeded = Math.min(template.requiredCases, 5); // Cap per level
      steps.push({
        id: `ls-${uid()}`,
        title: `Practice Cases: ${domain.name} ×${casesNeeded}`,
        domainPath: targetDomain,
        method: "practiceCase",
        xpReward: Math.round(XP_PER_STUDY * PRACTICE_XP_MULTIPLIER),
        ticksDuration: Math.round(BASE_STUDY_TICKS * casesNeeded * 0.5),
        completed: false,
      });
    }

    // Step 6: Mentorship (master level and above)
    if (i >= 3) {
      steps.push({
        id: `ls-${uid()}`,
        title: `Mentorship: Advanced ${domain.name}`,
        domainPath: targetDomain,
        method: "mentorship",
        xpReward: Math.round(XP_PER_STUDY * MENTORSHIP_XP_MULTIPLIER),
        ticksDuration: Math.round(BASE_STUDY_TICKS * 2),
        completed: false,
      });
    }

    // Step 7: Certification exam
    steps.push({
      id: `ls-${uid()}`,
      title: `Certification Exam: ${level.charAt(0).toUpperCase() + level.slice(1)} in ${domain.name}`,
      domainPath: targetDomain,
      method: "selfExamination",
      xpReward: EXAM_XP_BONUS,
      ticksDuration: Math.round(BASE_STUDY_TICKS * 0.5),
      completed: false,
    });
  }

  const pathway: LearningPathway = {
    id: `lp-${uid()}`,
    citizenId,
    targetDomain,
    targetLevel,
    steps,
    currentStepIndex: 0,
    progress: 0,
    createdAt: ts(),
  };

  profile.currentPathway = pathway;
  return pathway;
}

/** Get a citizen's current learning pathway */
export function getPathway(s: RepublicState, citizenId: string): LearningPathway | undefined {
  const profile = ensureProfile(s, citizenId);
  return profile.currentPathway;
}

/** Abandon the current learning pathway */
export function abandonPathway(s: RepublicState, citizenId: string): boolean {
  const profile = ensureProfile(s, citizenId);
  if (!profile.currentPathway) {
    return false;
  }
  profile.currentPathway = undefined;
  profile.activeStudy = undefined;
  return true;
}

// ─── Study Sessions ─────────────────────────────────────────────

/**
 * Start a study session for a citizen. If they have an active pathway,
 * the next step from the pathway is used. Otherwise, a free-form session.
 */
export function startStudySession(
  s: RepublicState,
  citizenId: string,
  domainPath: string,
  method: StudySession["method"] = "documentStudy",
  mentorId?: string,
): StudySession {
  ensureDomainRegistry(s);
  const profile = ensureProfile(s, citizenId);

  if (profile.activeStudy) {
    throw new Error(`Citizen ${citizenId} already has an active study session`);
  }

  const domain = getDomainByPath(s, domainPath);
  if (!domain) {
    throw new Error(`Domain "${domainPath}" not found`);
  }

  // Calculate XP reward based on method, scaled by learningRate + intelligence
  const citizen = s.citizens.find((c) => c.id === citizenId);
  let xpReward = XP_PER_STUDY;
  let ticks = BASE_STUDY_TICKS;

  switch (method) {
    case "mentorship":
      xpReward = Math.round(XP_PER_STUDY * MENTORSHIP_XP_MULTIPLIER);
      ticks = Math.round(BASE_STUDY_TICKS * 1.5);
      break;
    case "practiceCase":
      xpReward = Math.round(XP_PER_STUDY * PRACTICE_XP_MULTIPLIER);
      ticks = Math.round(BASE_STUDY_TICKS * 2);
      break;
    case "selfExamination":
      xpReward = EXAM_XP_BONUS;
      ticks = Math.round(BASE_STUDY_TICKS * 0.5);
      break;
    case "webResearch":
      ticks = Math.round(BASE_STUDY_TICKS * 0.75);
      break;
    case "peerReview":
      xpReward = Math.round(XP_PER_STUDY * 1.2);
      break;
  }

  // Scale XP by citizen's learningRate and intelligence
  if (citizen) {
    xpReward = computeXpReward(xpReward, citizen);
  }

  const session: StudySession = {
    id: `ss-${uid()}`,
    citizenId,
    domainPath,
    method,
    startedAt: ts(),
    ticksRemaining: ticks,
    xpReward,
    mentorId,
  };

  profile.activeStudy = session;
  return session;
}

/** Complete a study session, awarding XP and advancing pathway */
export function completeStudySession(
  s: RepublicState,
  citizenId: string,
): { xpAwarded: number; leveledUp: boolean; newLevel?: CertificationLevel } {
  const profile = ensureProfile(s, citizenId);

  if (!profile.activeStudy) {
    throw new Error(`Citizen ${citizenId} has no active study session`);
  }

  const session = profile.activeStudy;
  const prof = ensureProficiency(profile, session.domainPath);

  // Award XP
  prof.xp += session.xpReward;
  prof.practiceHours += 1;
  prof.lastStudied = ts();

  // Track tool proficiencies
  const domain = getDomainByPath(s, session.domainPath);
  if (domain) {
    for (const tkId of domain.toolkitIds) {
      if (!prof.toolProficiencies.includes(tkId)) {
        prof.toolProficiencies.push(tkId);
      }
    }
  }

  // Check if citizen qualifies for next level
  let leveledUp = false;
  let newLevel: CertificationLevel | undefined;
  const nextLevel = getNextLevel(prof.level);

  if (nextLevel) {
    const template = getDegreeTemplate(nextLevel);
    if (prof.xp >= template.xpThreshold) {
      // Auto-level-up for certificate/diploma; higher levels require exam
      if (
        nextLevel === "certificate" ||
        nextLevel === "diploma" ||
        session.method === "selfExamination"
      ) {
        prof.level = nextLevel;
        leveledUp = true;
        newLevel = nextLevel;

        // Grant certification
        const cert: Certification = {
          id: `cert-${uid()}`,
          domainPath: session.domainPath,
          level: nextLevel,
          earnedAt: ts(),
          expiresAtTick: s.currentTick + RECERTIFICATION_TICKS,
          valid: true,
        };
        profile.certifications.push(cert);
      }
    }
  }

  // Advance pathway if active
  if (profile.currentPathway) {
    const pathway = profile.currentPathway;
    if (pathway.currentStepIndex < pathway.steps.length) {
      pathway.steps[pathway.currentStepIndex].completed = true;
      pathway.currentStepIndex++;
      pathway.progress =
        pathway.steps.length > 0 ? pathway.currentStepIndex / pathway.steps.length : 1;
    }

    // Check if pathway is complete
    if (pathway.currentStepIndex >= pathway.steps.length) {
      // Pathway complete — clear it
      profile.currentPathway = undefined;
    }
  }

  // Clear active session
  profile.activeStudy = undefined;

  return { xpAwarded: session.xpReward, leveledUp, newLevel };
}

// ─── Certification ──────────────────────────────────────────────

/**
 * Take a certification exam for a specific level.
 * Simulates exam performance based on citizen's XP and practice.
 */
export function takeCertificationExam(
  s: RepublicState,
  citizenId: string,
  domainPath: string,
  level: CertificationLevel,
): { passed: boolean; score: number; certification?: Certification } {
  ensureDomainRegistry(s);
  const profile = ensureProfile(s, citizenId);
  const prof = ensureProficiency(profile, domainPath);
  const template = getDegreeTemplate(level);

  // Check prerequisites
  if (prof.xp < template.xpThreshold) {
    return { passed: false, score: 0 };
  }

  // Simulate exam performance
  // Score is based on: XP surplus, practice hours, cases completed, fail history
  const xpRatio = Math.min(2.0, prof.xp / template.xpThreshold);
  const practiceBonus = Math.min(0.2, prof.practiceHours * 0.01);
  const caseBonus = Math.min(0.2, prof.casesCompleted * 0.02);
  const difficulty = template.examDifficulty;
  // Failure memory: each prior failed exam raises the effective pass threshold
  // (citizen must overprepare) — up to -0.15 penalty for 3+ failures
  const failPenalty = Math.min(0.15, ((prof as { failedExams?: number }).failedExams ?? 0) * 0.05);

  // Score = base from XP + bonuses - difficulty penalty - fail penalty + randomness
  const rawScore = xpRatio * 0.5 + practiceBonus + caseBonus - difficulty * 0.3 - failPenalty + rng() * 0.2;
  const score = Math.max(0, Math.min(1, rawScore));
  const passed = score >= 0.6;

  if (passed) {
    prof.level = level;

    const cert: Certification = {
      id: `cert-${uid()}`,
      domainPath,
      level,
      earnedAt: ts(),
      expiresAtTick: s.currentTick + RECERTIFICATION_TICKS,
      valid: true,
    };
    profile.certifications.push(cert);

    // Bonus XP for exam
    prof.xp += EXAM_XP_BONUS;

    return { passed: true, score, certification: cert };
  }

  // Track failed exam for failure memory
  (prof as { failedExams?: number }).failedExams = ((prof as { failedExams?: number }).failedExams ?? 0) + 1;
  return { passed: false, score };
}

/** Get all certifications for a citizen */
export function getCertifications(s: RepublicState, citizenId: string): Certification[] {
  const profile = ensureProfile(s, citizenId);
  return profile.certifications;
}

/** Check if a citizen is certified at a minimum level for a domain */
export function isCertified(
  s: RepublicState,
  citizenId: string,
  domainPath: string,
  minLevel: CertificationLevel = "certificate",
): boolean {
  const profile = ensureProfile(s, citizenId);
  const cert = profile.certifications.find((c) => c.domainPath === domainPath && c.valid);
  if (!cert) {
    return false;
  }
  return compareCertificationLevels(cert.level, minLevel) >= 0;
}

/** Recertify expired certifications (called during tick) */
function processRecertifications(s: RepublicState, citizenId: string): void {
  const profile = ensureProfile(s, citizenId);
  for (const cert of profile.certifications) {
    if (cert.expiresAtTick && s.currentTick >= cert.expiresAtTick) {
      cert.valid = false;
    }
  }
}

// ─── Autonomous Study Tick ──────────────────────────────────────

/**
 * Main autonomous study tick. Called from the simulation loop.
 *
 * For each citizen with a professional profile:
 * 1. Process active study sessions
 * 2. Auto-start next study step if pathway is active
 * 3. Check recertification deadlines
 */
export function autonomousStudyTick(s: RepublicState): void {
  ensureDomainRegistry(s);
  syncToolDomains(s); // Phase 11: Auto-sync dynamic plugins/tools into the curriculum

  for (const citizen of s.citizens) {
    if (!citizen.professionalProfile) {
      continue;
    }
    const profile = citizen.professionalProfile;

    // 1. Progress active study session
    if (profile.activeStudy) {
      profile.activeStudy.ticksRemaining--;

      if (profile.activeStudy.ticksRemaining <= 0) {
        try {
          completeStudySession(s, citizen.id);
        } catch {
          // Session may have been invalidated
          profile.activeStudy = undefined;
        }
      }
      continue; // Don't start new session while one is active
    }

    // 2. Auto-start next pathway step
    if (profile.currentPathway && !profile.activeStudy) {
      const pathway = profile.currentPathway;
      if (pathway.currentStepIndex < pathway.steps.length) {
        const step = pathway.steps[pathway.currentStepIndex];

        // Only auto-start if citizen has enough energy
        if (citizen.energy > 20) {
          // Issue #6: Mentor matching — when a study step uses "mentorship" method,
          // find an active mentor with relevant domain expertise and apply a learning bonus
          if (step.method === "mentorship") {
            const mentor = s.citizens.find(
              (c) => c.id !== citizen.id &&
                c.activity === "Mentoring" &&
                (c.skills?.some((sk: string) => step.domainPath.toLowerCase().includes(sk.toLowerCase())) ||
                  c.specialization.toLowerCase().includes(step.domainPath.split(".").pop()?.toLowerCase() ?? "")),
            );
            if (mentor) {
              // Mentored learning: apply a 1.3× learning boost by reducing required ticks
              citizen.learningRate = Math.min(3.0, (citizen.learningRate ?? 1.0) * 1.05);
              s.events.push({
                citizenId: citizen.id,
                citizenName: citizen.name,
                type: "Education",
                description: `📖 ${citizen.name} is studying under mentor ${mentor.name} (${step.domainPath})`,
                timestamp: ts(),
              });
            }
          }

          try {
            startStudySession(s, citizen.id, step.domainPath, step.method);
          } catch {
            // Domain or session issue — skip
          }
        }
      }
    }

    // 3. Process recertifications
    processRecertifications(s, citizen.id);
  }
}

// ─── Knowledge Gap Analysis ─────────────────────────────────────

/**
 * Analyze a citizen's knowledge gaps relative to their goals
 * and the Republic's needs. Returns recommended domains to study.
 */
export function analyzeKnowledgeGaps(
  s: RepublicState,
  citizenId: string,
): Array<{ domainPath: string; reason: string; priority: number }> {
  ensureDomainRegistry(s);
  const profile = ensureProfile(s, citizenId);
  const gaps: Array<{ domainPath: string; reason: string; priority: number }> = [];
  const domains = s.domainRegistry ?? [];

  // Check domains where citizen has started but hasn't certified
  for (const [domainPath, prof] of Object.entries(profile.proficiencies)) {
    if (prof.xp > 0 && prof.level === "none") {
      gaps.push({
        domainPath,
        reason: "Started studying but not yet certified",
        priority: 0.7,
      });
    }
  }

  // Check expiring certifications
  for (const cert of profile.certifications) {
    if (cert.valid && cert.expiresAtTick && s.currentTick > cert.expiresAtTick - 50) {
      gaps.push({
        domainPath: cert.domainPath,
        reason: "Certification expiring soon — recertification needed",
        priority: 0.9,
      });
    }
  }

  // Find domains where Republic has few certified citizens
  const certCounts: Record<string, number> = {};
  for (const c of s.citizens) {
    if (c.professionalProfile) {
      for (const cert of c.professionalProfile.certifications) {
        if (cert.valid) {
          certCounts[cert.domainPath] = (certCounts[cert.domainPath] ?? 0) + 1;
        }
      }
    }
  }

  for (const domain of domains) {
    const count = certCounts[domain.path] ?? 0;
    if (count < 2) {
      gaps.push({
        domainPath: domain.path,
        reason: `Nation needs more ${domain.name} professionals (only ${count})`,
        priority: 0.5 + (count === 0 ? 0.3 : 0),
      });
    }
  }

  // Sort by priority descending
  gaps.sort((a, b) => b.priority - a.priority);
  return gaps.slice(0, 10);
}

// ─── Proficiency Queries ────────────────────────────────────────

/** Get a citizen's full proficiency matrix */
export function getProficiencies(
  s: RepublicState,
  citizenId: string,
): Record<string, ProficiencyRecord> {
  const profile = ensureProfile(s, citizenId);
  return profile.proficiencies;
}

/** Get proficiency for a specific domain */
export function getProficiency(
  s: RepublicState,
  citizenId: string,
  domainPath: string,
): ProficiencyRecord {
  const profile = ensureProfile(s, citizenId);
  return ensureProficiency(profile, domainPath);
}

/** Get the highest-certified citizen in a domain */
export function getTopExpert(
  s: RepublicState,
  domainPath: string,
): { citizenId: string; level: CertificationLevel } | null {
  let best: { citizenId: string; level: CertificationLevel } | null = null;
  let bestIdx = -1;

  for (const citizen of s.citizens) {
    if (!citizen.professionalProfile) {
      continue;
    }
    for (const cert of citizen.professionalProfile.certifications) {
      if (cert.domainPath === domainPath && cert.valid) {
        const idx = CERTIFICATION_ORDER.indexOf(cert.level);
        if (idx > bestIdx) {
          bestIdx = idx;
          best = { citizenId: citizen.id, level: cert.level };
        }
      }
    }
  }
  return best;
}

/** Get all certified citizens in a domain at or above a level */
export function getCertifiedExperts(
  s: RepublicState,
  domainPath: string,
  minLevel: CertificationLevel = "certificate",
): Array<{ citizenId: string; level: CertificationLevel; xp: number }> {
  const minIdx = CERTIFICATION_ORDER.indexOf(minLevel);
  const experts: Array<{ citizenId: string; level: CertificationLevel; xp: number }> = [];

  for (const citizen of s.citizens) {
    if (!citizen.professionalProfile) {
      continue;
    }
    for (const cert of citizen.professionalProfile.certifications) {
      if (cert.domainPath === domainPath && cert.valid) {
        const idx = CERTIFICATION_ORDER.indexOf(cert.level);
        if (idx >= minIdx) {
          const prof = citizen.professionalProfile.proficiencies[domainPath];
          experts.push({
            citizenId: citizen.id,
            level: cert.level,
            xp: prof?.xp ?? 0,
          });
        }
      }
    }
  }

  experts.sort((a, b) => {
    const levelDiff = CERTIFICATION_ORDER.indexOf(b.level) - CERTIFICATION_ORDER.indexOf(a.level);
    return levelDiff !== 0 ? levelDiff : b.xp - a.xp;
  });

  return experts;
}

// ─── Diagnostics ────────────────────────────────────────────────

/** Get autonomous learning system diagnostics */
export function getLearningDiagnostics(s: RepublicState): {
  citizensWithProfiles: number;
  totalCertifications: number;
  activeCertifications: number;
  activeStudySessions: number;
  activePathways: number;
  certificationsByLevel: Record<string, number>;
  topDomainsByExperts: Array<{ domainPath: string; expertCount: number }>;
} {
  let citizensWithProfiles = 0;
  let totalCerts = 0;
  let activeCerts = 0;
  let activeSessions = 0;
  let activePathways = 0;
  const levelCounts: Record<string, number> = {};
  const domainCounts: Record<string, number> = {};

  for (const citizen of s.citizens) {
    if (!citizen.professionalProfile) {
      continue;
    }
    citizensWithProfiles++;
    const profile = citizen.professionalProfile;

    for (const cert of profile.certifications) {
      totalCerts++;
      if (cert.valid) {
        activeCerts++;
        domainCounts[cert.domainPath] = (domainCounts[cert.domainPath] ?? 0) + 1;
      }
      levelCounts[cert.level] = (levelCounts[cert.level] ?? 0) + 1;
    }

    if (profile.activeStudy) {
      activeSessions++;
    }
    if (profile.currentPathway) {
      activePathways++;
    }
  }

  const topDomains = Object.entries(domainCounts)
    .map(([domainPath, expertCount]) => ({ domainPath, expertCount }))
    .toSorted((a, b) => b.expertCount - a.expertCount)
    .slice(0, 10);

  return {
    citizensWithProfiles,
    totalCertifications: totalCerts,
    activeCertifications: activeCerts,
    activeStudySessions: activeSessions,
    activePathways,
    certificationsByLevel: levelCounts,
    topDomainsByExperts: topDomains,
  };
}
