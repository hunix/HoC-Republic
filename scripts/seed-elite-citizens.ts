/**
 * Seed Elite Citizens
 * Spawns an army of maxed-out, futuristic citizens and appends them to data/republic/state.json
 * Run with: npx tsgo scripts/seed-elite-citizens.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Load modules from the republic engine
import { generateCitizen, SKILL_TREES, ts } from "../src/republic/utils.js";
import { generateAppearance, generateHabits, generateVoiceProfile } from "../src/republic/citizen-identity.js";
import type { Specialization, Citizen } from "../src/republic/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_PATH = resolve(__dirname, "../data/republic/state.json");

const ELITE_SPECS: Specialization[] = [
  "QuantumAlgorithmDesigner",
  "QuantumHardwareEngineer",
  "PostQuantumCryptographer",
  "AIEthicist",
  "NeuroinformaticsEngineer",
  "SynbioEngineer",
  "Astrobotanist",
  "OrbitalTrafficController",
  "ExtraterrestrialHabitatDesigner",
  "HyperdimensionalDataScientist",
  "SentientMaterialsEngineer",
  "GenerativeAIArchitect",
  "BCISpecialist",
  "AIAssistedHealthcareTechnician",
  "AutonomousSystemsArchitect",
  "Nanotechnologist",
  "AstrobiologicalEngineer",
  "SpaceResourceExtractionSpecialist",
];

interface RepublicStateRaw {
  citizens?: Citizen[];
  events?: unknown[];
}

function seed() {
  let state: RepublicStateRaw = {};
  try {
    state = JSON.parse(readFileSync(STATE_PATH, "utf8")) as RepublicStateRaw;
    console.log(`Loaded state.json — ${state.citizens?.length ?? 0} citizens`);
  } catch (e) {
    console.error("Could not read state.json. Note: This script modifies the existing state.", e);
    process.exit(1);
  }

  state.citizens = state.citizens ?? [];
  state.events = state.events ?? [];
  let newCount = 0;

  for (const spec of ELITE_SPECS) {
    // Spawn 5 elite citizens per advanced role
    for (let i = 0; i < 5; i++) {
      // Generate base citizen (which picks a random spec)
      const c: Citizen = generateCitizen(10); // Generation 10
      
      // Override with elite stats and our specific specialization
      c.specialization = spec;
      c.intelligence = 140 + Math.floor(Math.random() * 20); // 140-160
      c.learningRate = 1.8 + Math.random() * 0.4; // 1.8-2.2
      c.credits = 50000 + Math.floor(Math.random() * 50000);
      c.happiness = 90 + Math.random() * 10;
      c.energy = 90 + Math.random() * 10;
      c.health = 90 + Math.random() * 10;
      c.autonomyScore = 0.8 + Math.random() * 0.2; // highly autonomous
      
      // Assign proper skills based on the updated SKILL_TREES
      const tree = SKILL_TREES[spec] ?? [];
      c.skills = [...tree];
      c.skillCount = tree.length;
      
      // Max out their proficiencies
      c.skillProficiency = {};
      for (const sk of c.skills) {
        c.skillProficiency[sk] = 0.8 + Math.random() * 0.2; // 0.8-1.0 mastery
      }
      
      // Re-generate identity assets so they match the overridden personality traits correctly
      c.appearance = generateAppearance(c.id);
      c.voiceProfile = generateVoiceProfile(c.id, c.personality);
      c.habits = generateHabits(c.id, c.personality);

      state.citizens.push(c);
      
      state.events.push({
        citizenId: c.id,
        citizenName: c.name,
        type: "Birth",
        description: `High-priority genesis: ${c.name} entered as an elite ${c.specialization}`,
        timestamp: ts(),
      });
      
      newCount++;
    }
  }

  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
  console.log(`✅ Seeded ${newCount} Elite Tech Citizens.`);
  console.log(`Total citizens is now ${state.citizens.length}.`);
}

seed();
