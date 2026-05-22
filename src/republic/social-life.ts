/**
 * Republic Platform — Social Life Engine
 *
 * Rich human-like social behaviors for citizens:
 * - Friendships, rivalries, and mentorships
 * - Dating, engagement, marriage, divorce
 * - Family life: babies, family trees
 * - Inter-citizen messaging and announcements
 * - Life events: birthdays, parties, funerals
 * - Emotional states and compatibility
 */

import type { CitizenMessage, RelationshipType, RepublicState } from "./types.js";
import { sendProtocolMessage } from "./agent-protocol.js";
import { getNearbyCtizens } from "./spatial-world.js";
import { rand, ts, uid } from "./utils.js";

// ─── Relationship Management ────────────────────────────────────

/**
 * Form a new relationship between two citizens.
 */
export function formRelationship(
  s: RepublicState,
  citizenId: string,
  targetId: string,
  type: RelationshipType,
  strength = 50,
): { ok: boolean; error?: string } {
  const citizen = s.citizens.find((c) => c.id === citizenId);
  const target = s.citizens.find((c) => c.id === targetId);
  if (!citizen || !target) {
    return { ok: false, error: "Citizen not found" };
  }
  if (citizenId === targetId) {
    return { ok: false, error: "Cannot form relationship with self" };
  }

  if (!citizen.relationships) {
    citizen.relationships = [];
  }
  if (!target.relationships) {
    target.relationships = [];
  }

  // Check if relationship already exists
  const existing = citizen.relationships.find((r) => r.targetId === targetId);
  if (existing) {
    existing.type = type;
    existing.strength = Math.min(100, strength);
    // Mirror on target
    const mirror = target.relationships.find((r) => r.targetId === citizenId);
    if (mirror) {
      mirror.type = mirrorType(type);
      mirror.strength = Math.min(100, strength);
    }
    return { ok: true };
  }

  const now = ts();
  citizen.relationships.push({ targetId, type, strength: Math.min(100, strength), since: now });
  target.relationships.push({
    targetId: citizenId,
    type: mirrorType(type),
    strength: Math.min(100, strength),
    since: now,
  });

  s.events.push({
    citizenId,
    citizenName: citizen.name,
    type: "Friendship",
    description: `${citizen.name} and ${target.name} became ${type.toLowerCase()}s`,
    timestamp: now,
  });

  return { ok: true };
}

/**
 * Break a relationship between two citizens.
 */
export function breakRelationship(
  s: RepublicState,
  citizenId: string,
  targetId: string,
): { ok: boolean; error?: string } {
  const citizen = s.citizens.find((c) => c.id === citizenId);
  const target = s.citizens.find((c) => c.id === targetId);
  if (!citizen || !target) {
    return { ok: false, error: "Citizen not found" };
  }

  if (citizen.relationships) {
    citizen.relationships = citizen.relationships.filter((r) => r.targetId !== targetId);
  }
  if (target.relationships) {
    target.relationships = target.relationships.filter((r) => r.targetId !== citizenId);
  }

  return { ok: true };
}

/**
 * Strengthen an existing relationship.
 */
export function strengthenRelationship(
  s: RepublicState,
  citizenId: string,
  targetId: string,
  amount = 5,
): { ok: boolean; newStrength?: number } {
  const citizen = s.citizens.find((c) => c.id === citizenId);
  if (!citizen?.relationships) {
    return { ok: false };
  }

  const rel = citizen.relationships.find((r) => r.targetId === targetId);
  if (!rel) {
    return { ok: false };
  }

  rel.strength = Math.min(100, rel.strength + amount);

  // Mirror on target
  const target = s.citizens.find((c) => c.id === targetId);
  const mirror = target?.relationships?.find((r) => r.targetId === citizenId);
  if (mirror) {
    mirror.strength = Math.min(100, mirror.strength + amount);
  }

  // Auto-promote friendship levels
  if (rel.type === "Friend" && rel.strength >= 85) {
    rel.type = "BestFriend";
    if (mirror) {
      mirror.type = "BestFriend";
    }
  }

  return { ok: true, newStrength: rel.strength };
}

// ─── Romance & Marriage ─────────────────────────────────────────

/**
 * One citizen asks another on a date.
 */
export function proposeDate(
  s: RepublicState,
  citizenId: string,
  targetId: string,
): { ok: boolean; accepted: boolean; error?: string } {
  const citizen = s.citizens.find((c) => c.id === citizenId);
  const target = s.citizens.find((c) => c.id === targetId);
  if (!citizen || !target) {
    return { ok: false, accepted: false, error: "Citizen not found" };
  }

  // Check compatibility
  const compat = getCompatibility(s, citizenId, targetId);

  // Spatial proximity bonus — nearby citizens more likely to accept
  let proximityBonus = 0;
  try {
    const nearby = getNearbyCtizens(citizenId);
    if (nearby.includes(targetId)) {
      proximityBonus = 0.15; // 15% bonus for being nearby
    }
  } catch {
    /* spatial module not initialized */
  }

  const adjustedCompat = Math.min(1.0, compat + proximityBonus);
  const accepted = adjustedCompat > 0.4 && rand(0, 99) / 100 < adjustedCompat;

  if (accepted) {
    citizen.maritalStatus = "Dating";
    target.maritalStatus = "Dating";
    citizen.partnerId = targetId;
    target.partnerId = citizenId;

    formRelationship(s, citizenId, targetId, "Romantic", 60);

    s.events.push({
      citizenId,
      citizenName: citizen.name,
      type: "Discovery",
      description: `${citizen.name} and ${target.name} started dating! 💕`,
      timestamp: ts(),
    });
  }

  return { ok: true, accepted };
}

/**
 * Propose marriage to partner.
 */
export function proposeMarriage(
  s: RepublicState,
  citizenId: string,
): { ok: boolean; accepted: boolean; error?: string } {
  const citizen = s.citizens.find((c) => c.id === citizenId);
  if (!citizen) {
    return { ok: false, accepted: false, error: "Citizen not found" };
  }
  if (!citizen.partnerId) {
    return { ok: false, accepted: false, error: "Not in a relationship" };
  }
  if (citizen.maritalStatus !== "Dating") {
    return { ok: false, accepted: false, error: "Must be dating first" };
  }

  const partner = s.citizens.find((c) => c.id === citizen.partnerId);
  if (!partner) {
    return { ok: false, accepted: false, error: "Partner not found" };
  }

  // Acceptance based on relationship strength
  const rel = (citizen.relationships ?? []).find((r) => r.targetId === citizen.partnerId!);
  const strength = rel?.strength ?? 50;
  const accepted = strength >= 60 && rand(0, 99) < strength;

  if (accepted) {
    citizen.maritalStatus = "Engaged";
    partner.maritalStatus = "Engaged";

    s.events.push({
      citizenId,
      citizenName: citizen.name,
      type: "Discovery",
      description: `${citizen.name} and ${partner.name} got engaged! 💍`,
      timestamp: ts(),
    });
  }

  return { ok: true, accepted };
}

/**
 * Get married (if engaged).
 */
export function getMarried(s: RepublicState, citizenId: string): { ok: boolean; error?: string } {
  const citizen = s.citizens.find((c) => c.id === citizenId);
  if (!citizen) {
    return { ok: false, error: "Citizen not found" };
  }
  if (citizen.maritalStatus !== "Engaged") {
    return { ok: false, error: "Must be engaged first" };
  }
  if (!citizen.partnerId) {
    return { ok: false, error: "No partner" };
  }

  const partner = s.citizens.find((c) => c.id === citizen.partnerId);
  if (!partner) {
    return { ok: false, error: "Partner not found" };
  }

  citizen.maritalStatus = "Married";
  partner.maritalStatus = "Married";

  // Update relationships to Spouse
  formRelationship(s, citizenId, citizen.partnerId, "Spouse", 90);

  // Happiness boost
  citizen.happiness = Math.min(100, citizen.happiness + 15);
  partner.happiness = Math.min(100, partner.happiness + 15);

  s.events.push({
    citizenId,
    citizenName: citizen.name,
    type: "Marriage",
    description: `${citizen.name} and ${partner.name} got married! 🎊`,
    timestamp: ts(),
  });

  return { ok: true };
}

/**
 * Divorce.
 */
export function divorce(s: RepublicState, citizenId: string): { ok: boolean; error?: string } {
  const citizen = s.citizens.find((c) => c.id === citizenId);
  if (!citizen) {
    return { ok: false, error: "Citizen not found" };
  }
  if (citizen.maritalStatus !== "Married") {
    return { ok: false, error: "Not married" };
  }
  if (!citizen.partnerId) {
    return { ok: false, error: "No partner" };
  }

  const partner = s.citizens.find((c) => c.id === citizen.partnerId);

  citizen.maritalStatus = "Divorced";
  citizen.partnerId = null;

  if (partner) {
    partner.maritalStatus = "Divorced";
    partner.partnerId = null;
    partner.happiness = Math.max(10, partner.happiness - 10);
  }

  breakRelationship(s, citizenId, citizen.partnerId ?? "");
  citizen.happiness = Math.max(10, citizen.happiness - 10);

  s.events.push({
    citizenId,
    citizenName: citizen.name,
    type: "Divorce",
    description: `${citizen.name} and ${partner?.name ?? "partner"} divorced`,
    timestamp: ts(),
  });

  return { ok: true };
}

// ─── Family ─────────────────────────────────────────────────────

/**
 * Married couple has a baby — creates a new citizen.
 */
export function haveBaby(
  s: RepublicState,
  citizenId: string,
  babyName?: string,
): { ok: boolean; babyId?: string; error?: string } {
  const citizen = s.citizens.find((c) => c.id === citizenId);
  if (!citizen) {
    return { ok: false, error: "Citizen not found" };
  }
  if (citizen.maritalStatus !== "Married" || !citizen.partnerId) {
    return { ok: false, error: "Must be married" };
  }

  const partner = s.citizens.find((c) => c.id === citizen.partnerId);
  if (!partner) {
    return { ok: false, error: "Partner not found" };
  }

  const babyId = uid();
  const name = babyName ?? `Baby ${citizen.name.split(" ")[1] ?? citizen.name}`;

  // Create baby citizen
  const baby = {
    id: babyId,
    name,
    generation: Math.max(citizen.generation, partner.generation) + 1,
    specialization: "Generalist" as const,
    activity: "Sleeping" as const,
    energy: 100,
    happiness: 100,
    health: 100,
    credits: 0,
    age: 0,
    skillCount: 0,
    skills: [],
    familySize: 3,
    parentIds: [citizenId, citizen.partnerId],
    children: [],
    maritalStatus: "Single" as const,
    relationships: [
      { targetId: citizenId, type: "Parent" as const, strength: 100, since: ts() },
      { targetId: citizen.partnerId, type: "Parent" as const, strength: 100, since: ts() },
    ],
  };

  s.citizens.push(baby);

  // Update parents
  if (!citizen.children) {
    citizen.children = [];
  }
  citizen.children.push(babyId);
  citizen.familySize = (citizen.children.length ?? 0) + 2;

  if (!partner.children) {
    partner.children = [];
  }
  partner.children.push(babyId);
  partner.familySize = citizen.familySize;

  // Parent relationships to child
  if (!citizen.relationships) {
    citizen.relationships = [];
  }
  citizen.relationships.push({ targetId: babyId, type: "Child", strength: 100, since: ts() });

  if (!partner.relationships) {
    partner.relationships = [];
  }
  partner.relationships.push({ targetId: babyId, type: "Child", strength: 100, since: ts() });

  // Happiness boost
  citizen.happiness = Math.min(100, citizen.happiness + 20);
  partner.happiness = Math.min(100, partner.happiness + 20);

  s.events.push({
    citizenId,
    citizenName: citizen.name,
    type: "ChildBirth",
    description: `${citizen.name} and ${partner.name} welcomed baby ${name}! 👶`,
    timestamp: ts(),
  });

  return { ok: true, babyId };
}

/**
 * Get a citizen's family tree.
 */
export function getFamilyTree(
  s: RepublicState,
  citizenId: string,
): {
  citizen: string;
  parents: string[];
  children: string[];
  spouse: string | null;
  siblings: string[];
} {
  const citizen = s.citizens.find((c) => c.id === citizenId);
  if (!citizen) {
    return { citizen: citizenId, parents: [], children: [], spouse: null, siblings: [] };
  }

  const parentIds = citizen.parentIds ?? [];
  const childIds = citizen.children ?? [];
  const spouseId = citizen.maritalStatus === "Married" ? (citizen.partnerId ?? null) : null;

  // Find siblings (same parents)
  const siblings = s.citizens
    .filter(
      (c) =>
        c.id !== citizenId &&
        c.parentIds?.length &&
        citizen.parentIds?.length &&
        c.parentIds.some((p) => citizen.parentIds!.includes(p)),
    )
    .map((c) => c.id);

  return {
    citizen: citizen.name,
    parents: parentIds,
    children: childIds,
    spouse: spouseId,
    siblings,
  };
}

// ─── Messaging ──────────────────────────────────────────────────

/**
 * Send a message from one citizen to another.
 */
export function sendMessage(
  s: RepublicState,
  fromId: string,
  toId: string,
  content: string,
): { ok: boolean; messageId?: string; error?: string } {
  const from = s.citizens.find((c) => c.id === fromId);
  const to = s.citizens.find((c) => c.id === toId);
  if (!from || !to) {
    return { ok: false, error: "Citizen not found" };
  }

  if (!s.messages) {
    s.messages = [];
  }

  const msg: CitizenMessage = {
    id: uid(),
    from: fromId,
    to: toId,
    content,
    timestamp: ts(),
    read: false,
  };

  s.messages.push(msg);

  // Cap messages
  if (s.messages.length > 2000) {
    s.messages = s.messages.slice(-1500);
  }

  // Strengthen relationship
  strengthenRelationship(s, fromId, toId, 1);

  // Emit structured protocol message for inter-agent communication
  try {
    sendProtocolMessage(fromId, [toId], "inform", {
      description: content,
      ontology: "social-message",
    });
  } catch {
    /* protocol module may not be initialized */
  }

  s.events.push({
    citizenId: fromId,
    citizenName: from.name,
    type: "MessageSent",
    description: `${from.name} messaged ${to.name}`,
    timestamp: ts(),
  });

  return { ok: true, messageId: msg.id };
}

/**
 * Get conversation between two citizens.
 */
export function getConversation(
  s: RepublicState,
  citizenAId: string,
  citizenBId: string,
  limit = 50,
): CitizenMessage[] {
  return (s.messages ?? [])
    .filter(
      (m) =>
        (m.from === citizenAId && m.to === citizenBId) ||
        (m.from === citizenBId && m.to === citizenAId),
    )
    .slice(-limit);
}

/**
 * Get all unread messages for a citizen.
 */
export function getUnreadMessages(s: RepublicState, citizenId: string): CitizenMessage[] {
  return (s.messages ?? []).filter((m) => m.to === citizenId && !m.read);
}

/**
 * Mark messages as read.
 */
export function markMessagesRead(s: RepublicState, messageIds: string[]): void {
  const idSet = new Set(messageIds);
  for (const msg of s.messages ?? []) {
    if (idSet.has(msg.id)) {
      msg.read = true;
    }
  }
}

/**
 * Broadcast an announcement to all citizens.
 */
export function broadcastAnnouncement(
  s: RepublicState,
  fromId: string,
  content: string,
): { sent: number } {
  const from = s.citizens.find((c) => c.id === fromId);
  if (!from) {
    return { sent: 0 };
  }
  if (!s.messages) {
    s.messages = [];
  }

  let sent = 0;
  const now = ts();
  // PERFORMANCE: cap broadcast to 100 recipients — creating N message objects for
  // all citizens at once causes memory spikes and O(N) allocation per call.
  const MAX_BROADCAST_RECIPIENTS = 100;
  const allRecipients = s.citizens.filter((c) => c.id !== fromId);
  const recipients =
    allRecipients.length <= MAX_BROADCAST_RECIPIENTS
      ? allRecipients
      : allRecipients.slice(0, MAX_BROADCAST_RECIPIENTS);

  for (const citizen of recipients) {
    s.messages.push({
      id: uid(),
      from: fromId,
      to: citizen.id,
      content: `[ANNOUNCEMENT] ${content}`,
      timestamp: now,
      read: false,
    });
    sent++;
  }

  // Also emit a structured protocol broadcast
  try {
    const receiverIds = s.citizens.filter((c) => c.id !== fromId).map((c) => c.id);
    sendProtocolMessage(fromId, receiverIds, "inform", {
      description: `[ANNOUNCEMENT] ${content}`,
      ontology: "broadcast",
    });
  } catch {
    /* protocol module may not be initialized */
  }

  return { sent };
}

// ─── Life Events ────────────────────────────────────────────────

/**
 * Throw a party — boosts happiness for guests.
 */
export function throwParty(
  s: RepublicState,
  hostId: string,
  guestIds?: string[],
): { ok: boolean; guests: number } {
  const host = s.citizens.find((c) => c.id === hostId);
  if (!host) {
    return { ok: false, guests: 0 };
  }

  // If no guest list, invite friends + nearby citizens
  let guests: typeof s.citizens;
  if (guestIds) {
    guests = s.citizens.filter((c) => guestIds.includes(c.id));
  } else {
    // Invite friends
    const friends = s.citizens.filter((c) => {
      const rel = (host.relationships ?? []).find((r) => r.targetId === c.id);
      return rel && rel.strength >= 30;
    });
    // Also invite nearby citizens (spatial proximity → social bonding)
    const friendIds = new Set(friends.map((f) => f.id));
    let nearbyGuests: typeof s.citizens = [];
    try {
      const nearby = getNearbyCtizens(hostId);
      nearbyGuests = nearby
        .filter((nId) => !friendIds.has(nId))
        .slice(0, 3)
        .map((nId) => s.citizens.find((c) => c.id === nId))
        .filter((c): c is NonNullable<typeof c> => c !== undefined);
    } catch {
      /* spatial module not initialized */
    }
    guests = [...friends, ...nearbyGuests];
  }

  for (const guest of guests) {
    guest.happiness = Math.min(100, guest.happiness + rand(3, 8));
    strengthenRelationship(s, hostId, guest.id, 3);
  }

  host.happiness = Math.min(100, host.happiness + 5);
  host.credits -= Math.min(host.credits, rand(5, 20)); // Party costs

  s.events.push({
    citizenId: hostId,
    citizenName: host.name,
    type: "PartyHosted",
    description: `${host.name} threw a party with ${guests.length} guests! 🎉`,
    timestamp: ts(),
  });

  return { ok: true, guests: guests.length };
}

/**
 * Celebrate a citizen's birthday — age increases.
 */
export function celebrateBirthday(
  s: RepublicState,
  citizenId: string,
): { ok: boolean; newAge: number } {
  const citizen = s.citizens.find((c) => c.id === citizenId);
  if (!citizen) {
    return { ok: false, newAge: 0 };
  }

  citizen.age += 1;
  citizen.happiness = Math.min(100, citizen.happiness + 10);

  // Friends send birthday messages
  const friends = (citizen.relationships ?? [])
    .filter((r) => r.type === "Friend" || r.type === "BestFriend" || r.type === "Spouse")
    .slice(0, 10);

  for (const fr of friends) {
    sendMessage(s, fr.targetId, citizenId, `Happy Birthday, ${citizen.name}! 🎂`);
  }

  s.events.push({
    citizenId,
    citizenName: citizen.name,
    type: "Achievement",
    description: `${citizen.name} turned ${citizen.age}! 🎂`,
    timestamp: ts(),
  });

  return { ok: true, newAge: citizen.age };
}

// ─── Emotions & Compatibility ───────────────────────────────────

const _MOODS = [
  "Happy",
  "Content",
  "Excited",
  "Bored",
  "Sad",
  "Anxious",
  "Angry",
  "Peaceful",
  "Inspired",
  "Tired",
  "Hopeful",
  "Nostalgic",
];

/**
 * Express an emotion / update mood.
 */
export function expressEmotion(
  s: RepublicState,
  citizenId: string,
  mood?: string,
): { ok: boolean; mood: string } {
  const citizen = s.citizens.find((c) => c.id === citizenId);
  if (!citizen) {
    return { ok: false, mood: "Unknown" };
  }

  // Auto-determine mood if not provided
  if (!mood) {
    if (citizen.happiness > 80) {
      mood = "Happy";
    } else if (citizen.happiness > 60) {
      mood = "Content";
    } else if (citizen.happiness > 40) {
      mood = "Bored";
    } else if (citizen.happiness > 20) {
      mood = "Sad";
    } else {
      mood = "Anxious";
    }
  }

  citizen.mood = mood;
  return { ok: true, mood };
}

/**
 * Calculate compatibility between two citizens based on personality vectors.
 */
export function getCompatibility(s: RepublicState, citizenAId: string, citizenBId: string): number {
  const a = s.citizens.find((c) => c.id === citizenAId);
  const b = s.citizens.find((c) => c.id === citizenBId);
  if (!a || !b) {
    return 0;
  }

  // Use personality vectors if available
  if (a.personality && b.personality) {
    const dims = ["openness", "conscientiousness", "agreeableness", "stability", "drive"] as const;
    let similarity = 0;
    for (const dim of dims) {
      similarity += 1 - Math.abs(a.personality[dim] - b.personality[dim]);
    }
    return parseFloat((similarity / dims.length).toFixed(3));
  }

  // Fallback: use skill overlap and randomness
  const sharedSkills = a.skills.filter((sk) => b.skills.includes(sk)).length;
  const maxSkills = Math.max(a.skills.length, b.skills.length, 1);
  const skillAffinity = sharedSkills / maxSkills;
  return parseFloat((0.3 + skillAffinity * 0.4 + rand(0, 29) / 100).toFixed(3));
}

/**
 * Get all relationships for a citizen.
 */
export function getCitizenRelationships(
  s: RepublicState,
  citizenId: string,
): Array<{ targetId: string; targetName: string; type: string; strength: number; since: string }> {
  const citizen = s.citizens.find((c) => c.id === citizenId);
  if (!citizen?.relationships) {
    return [];
  }

  return citizen.relationships.map((r) => {
    const target = s.citizens.find((c) => c.id === r.targetId);
    return {
      targetId: r.targetId,
      targetName: target?.name ?? r.targetId,
      type: r.type,
      strength: r.strength,
      since: r.since,
    };
  });
}

// ─── Helpers ────────────────────────────────────────────────────

function mirrorType(type: RelationshipType): RelationshipType {
  switch (type) {
    case "Parent":
      return "Child";
    case "Child":
      return "Parent";
    case "Mentor":
      return "Colleague";
    default:
      return type;
  }
}

// ─── Diagnostics ────────────────────────────────────────────────

export interface SocialLifeDiagnostics {
  totalRelationships: number;
  marriages: number;
  datingCouples: number;
  totalMessages: number;
  totalChildren: number;
  averageRelationshipStrength: number;
}

export function getSocialLifeDiagnostics(s: RepublicState): SocialLifeDiagnostics {
  let totalRels = 0;
  let totalStrength = 0;
  let marriages = 0;
  let dating = 0;
  let children = 0;

  for (const c of s.citizens) {
    totalRels += (c.relationships ?? []).length;
    for (const r of c.relationships ?? []) {
      totalStrength += r.strength;
    }
    if (c.maritalStatus === "Married") {
      marriages++;
    }
    if (c.maritalStatus === "Dating") {
      dating++;
    }
    children += (c.children ?? []).length;
  }

  return {
    totalRelationships: totalRels,
    marriages: Math.floor(marriages / 2), // Count couples not individuals
    datingCouples: Math.floor(dating / 2),
    totalMessages: (s.messages ?? []).length,
    totalChildren: children, // May double-count
    averageRelationshipStrength:
      totalRels > 0 ? parseFloat((totalStrength / totalRels).toFixed(1)) : 0,
  };
}

// ─── Autonomous Social Life Tick ────────────────────────────────

const _GREETINGS = [
  "How's your day going?",
  "Working on anything interesting?",
  "Let's grab lunch soon!",
  "Did you see the latest news?",
  "Hope you're doing well!",
  "Miss our chats!",
  "Any plans for later?",
  "Just thinking about you!",
];

/**
 * Autonomous social-life tick — drives all citizen social behaviors.
 *
 * Runs every tick, but each sub-system has its own cadence:
 *   - Emotions:           every tick (cheap — mood derived from stats)
 *   - Relationship decay:  every 20 ticks
 *   - New friendships:     every 10 ticks
 *   - Romance (dating/wed):every 25 ticks
 *   - Family (babies):     every 50 ticks
 *   - Celebrations:        every 100 ticks
 *   - Messaging:           every 15 ticks
 */
export function socialLifeTick(s: RepublicState): void {
  const t = s.currentTick;
  const citizens = s.citizens;
  if (citizens.length < 2) {
    return;
  }

  // ── Every tick: update moods from current stats ──
  for (const c of citizens) {
    expressEmotion(s, c.id); // auto-derives mood from happiness
  }

  // ── Every 10 ticks: form new friendships ──
  if (t % 10 === 0) {
    const maxNew = Math.max(1, Math.floor(citizens.length / 10));
    let formed = 0;
    for (const c of citizens) {
      if (formed >= maxNew) {
        break;
      }
      const rels = c.relationships ?? [];
      if (rels.length >= 15) {
        continue;
      } // social cap

      // Find nearby citizens first, fallback to random
      let candidates: string[] = [];
      try {
        candidates = getNearbyCtizens(c.id);
      } catch {
        /* */
      }
      if (candidates.length < 3) {
        const ri = rand(0, citizens.length - 1);
        if (citizens[ri].id !== c.id) {
          candidates.push(citizens[ri].id);
        }
      }

      const existing = new Set(rels.map((r) => r.targetId));
      const fresh = candidates.filter((id) => id !== c.id && !existing.has(id));

      for (const targetId of fresh.slice(0, 2)) {
        const compat = getCompatibility(s, c.id, targetId);
        if (compat > 0.5 && rand(0, 99) < compat * 60) {
          formRelationship(s, c.id, targetId, "Friend", Math.floor(30 + compat * 40));
          formed++;
          break;
        }
      }
    }
  }

  // ── Every 15 ticks: friends exchange messages ──
  if (t % 15 === 0) {
    const maxMsgs = Math.max(1, Math.floor(citizens.length / 8));
    let sent = 0;
    for (const c of citizens) {
      if (sent >= maxMsgs) {
        break;
      }
      const friends = (c.relationships ?? []).filter(
        (r) => r.type === "Friend" || r.type === "BestFriend",
      );
      if (friends.length === 0 || rand(0, 99) > 30) {
        continue;
      }
      const friend = friends[rand(0, friends.length - 1)];
      sendMessage(s, c.id, friend.targetId, _GREETINGS[rand(0, _GREETINGS.length - 1)]);
      sent++;
    }
  }

  // ── Every 20 ticks: relationship decay (weak bonds fade) ──
  if (t % 20 === 0) {
    for (const c of citizens) {
      if (!c.relationships) {
        continue;
      }
      for (const rel of c.relationships) {
        if (rel.type === "Parent" || rel.type === "Child" || rel.type === "Spouse") {
          continue;
        }
        if (rel.strength < 30) {
          rel.strength = Math.max(0, rel.strength - 1);
        }
      }
      c.relationships = c.relationships.filter((r) => r.strength > 0);
    }
  }

  // ── Every 20+3 ticks: strengthen bonds via shared activity ──
  if (t % 20 === 3) {
    const maxStr = Math.max(2, Math.floor(citizens.length / 5));
    let count = 0;
    for (const c of citizens) {
      if (count >= maxStr) {
        break;
      }
      for (const rel of c.relationships ?? []) {
        if (count >= maxStr) {
          break;
        }
        if (rel.type === "Parent" || rel.type === "Child") {
          continue;
        }
        const target = citizens.find((ci) => ci.id === rel.targetId);
        if (target && target.specialization === c.specialization && rand(0, 99) < 40) {
          strengthenRelationship(s, c.id, rel.targetId, 2);
          count++;
        }
      }
    }
  }

  // ── Every 25 ticks: romance — dating, proposals, weddings ──
  if (t % 25 === 0) {
    for (const c of citizens) {
      // Single + happy → try dating
      if (c.maritalStatus === "Single" && c.happiness > 50 && rand(0, 99) < 15) {
        const pool = citizens.filter(
          (o) => o.id !== c.id && o.maritalStatus === "Single" && !o.partnerId,
        );
        if (pool.length > 0) {
          proposeDate(s, c.id, pool[rand(0, pool.length - 1)].id);
        }
      }
      // Dating → propose marriage
      if (c.maritalStatus === "Dating" && c.partnerId && rand(0, 99) < 10) {
        const rel = (c.relationships ?? []).find((r) => r.targetId === c.partnerId);
        if (rel && rel.strength >= 70) {
          proposeMarriage(s, c.id);
        }
      }
      // Engaged → get married
      if (c.maritalStatus === "Engaged" && rand(0, 99) < 25) {
        getMarried(s, c.id);
      }
      // Very unhappy married → divorce (rare)
      if (c.maritalStatus === "Married" && c.happiness < 20 && rand(0, 99) < 3) {
        divorce(s, c.id);
      }
    }
  }

  // ── Every 50 ticks: family — babies ──
  if (t % 50 === 0) {
    for (const c of citizens) {
      if (
        c.maritalStatus === "Married" &&
        c.partnerId &&
        c.happiness > 60 &&
        (c.children ?? []).length < 3 &&
        rand(0, 99) < 8
      ) {
        haveBaby(s, c.id);
      }
    }
  }

  // ── Every 100 ticks: celebrations ──
  if (t % 100 === 0) {
    // Random birthday
    const bday = citizens[rand(0, citizens.length - 1)];
    celebrateBirthday(s, bday.id);

    // Spontaneous party
    const happy = citizens.filter((c) => c.happiness > 70 && (c.relationships ?? []).length >= 3);
    if (happy.length > 0 && rand(0, 99) < 40) {
      throwParty(s, happy[rand(0, happy.length - 1)].id);
    }
  }
}
