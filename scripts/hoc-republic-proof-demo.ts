#!/usr/bin/env -S node --import tsx
/**
 * HoC-Republic proof demo.
 *
 * This script is intentionally narrow: it demonstrates repository-backed digital-genome
 * mechanics that are already implemented and covered by focused tests. It produces
 * capture-ready JSON and Markdown artifacts for outreach without claiming sentience,
 * personhood, or real-world agency.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  GENOME_TOPOLOGY,
  canReproduce,
  countWeights,
  createRandomGenome,
  evaluateFitness,
  genomeTick,
  magnitudeCrossover,
  mutateGenome,
  probeHostResources,
  tournamentSelect,
} from "../src/republic/genetics.js";
import type { NeuralGenome, RepublicState } from "../src/republic/types.js";
import { setSeed } from "../src/republic/utils.js";

const OUT_DIR = "docs/hoc/outreach/demo-assets";
const SEED = "hoc-republic-proof-2026-05-23";

function round(n: number, places = 4): number {
  return Number(n.toFixed(places));
}

function summarizeGenome(genome: NeuralGenome): Record<string, unknown> {
  return {
    id: genome.id,
    label: genome.label,
    generation: genome.generation,
    topology: genome.topology,
    weightCount: genome.weights.length,
    fitness: genome.fitness,
    parentIds: genome.parentIds,
    firstEightWeights: genome.weights.slice(0, 8).map((w) => round(w)),
  };
}

function deterministicParent(index: number): NeuralGenome {
  const genome = createRandomGenome(GENOME_TOPOLOGY, 0);
  genome.label = `Demo Parent ${index}`;
  genome.fitness = evaluateFitness(genome);
  return genome;
}

mkdirSync(OUT_DIR, { recursive: true });
setSeed(SEED);

const parentA = deterministicParent(1);
const parentB = deterministicParent(2);
const selected = tournamentSelect([parentA, parentB], 2);
const parents = selected ?? [parentA, parentB];
const [winnerA, winnerB] = parents;

const directChild = magnitudeCrossover(winnerA, winnerB);
const directChildBeforeMutation = directChild.weights.slice(0, 12);
mutateGenome(directChild);
directChild.fitness = evaluateFitness(directChild);

const changedWeights = directChild.weights.reduce((count, weight, index) => {
  return count + (weight !== directChildBeforeMutation[index] ? 1 : 0);
}, 0);

const state = {
  currentTick: 10,
  genomePool: [parentA, parentB],
  mlModels: [
    {
      name: "demo_parent_1",
      displayName: parentA.label,
      trained: true,
      accuracy: parentA.fitness,
      samplesUsed: parentA.weights.length,
      lastTrainedAt: new Date("2026-05-23T00:00:00.000Z").toISOString(),
      predictionsServed: 0,
      genomeId: parentA.id,
    },
    {
      name: "demo_parent_2",
      displayName: parentB.label,
      trained: true,
      accuracy: parentB.fitness,
      samplesUsed: parentB.weights.length,
      lastTrainedAt: new Date("2026-05-23T00:00:00.000Z").toISOString(),
      predictionsServed: 0,
      genomeId: parentB.id,
    },
  ],
  events: [],
  totalEventsProcessed: 0,
} as unknown as RepublicState;

const hostResources = probeHostResources();
const resourceGateOpen = canReproduce();
genomeTick(state);
const tickOffspring = state.genomePool.find((genome) => genome.generation > 0) ?? null;
const birthEvent = state.events.find((event) => event.type === "Birth") ?? null;

const proof = {
  demoName: "HoC-Republic Digital-Genome Proof Demo",
  seed: SEED,
  generatedAt: new Date().toISOString(),
  sourceBackedMechanics: [
    "GENOME_TOPOLOGY and countWeights",
    "createRandomGenome",
    "evaluateFitness",
    "tournamentSelect",
    "magnitudeCrossover",
    "mutateGenome",
    "canReproduce host-resource gate",
    "genomeTick Birth event and ML-model linkage",
  ],
  topology: GENOME_TOPOLOGY,
  expectedWeightCount: countWeights(GENOME_TOPOLOGY),
  hostResources,
  resourceGateOpen,
  parentA: summarizeGenome(parentA),
  parentB: summarizeGenome(parentB),
  selectedParentLabels: [winnerA.label, winnerB.label],
  directChild: summarizeGenome(directChild),
  directChildChangedWeightsInFirstTwelve: changedWeights,
  genomeTick: {
    birthCreated: Boolean(birthEvent),
    poolSizeBefore: 2,
    poolSizeAfter: state.genomePool.length,
    modelCountAfter: state.mlModels.length,
    totalEventsProcessed: state.totalEventsProcessed,
    offspring: tickOffspring ? summarizeGenome(tickOffspring) : null,
    birthEvent,
  },
};

const jsonPath = join(OUT_DIR, "hoc-republic-digital-genome-proof.json");
const mdPath = join(OUT_DIR, "hoc-republic-digital-genome-proof.md");
writeFileSync(jsonPath, `${JSON.stringify(proof, null, 2)}\n`);

const birthLine = birthEvent
  ? `The simulated tick emitted a \`Birth\` event: “${birthEvent.description}”.`
  : "The simulated tick did not emit a `Birth` event because the host-resource gate was closed or selection could not proceed.";

const markdown = `# HoC-Republic Digital-Genome Proof Demo

This capture-ready artifact demonstrates a narrow, source-backed part of HoC-Republic: digital-genome creation, fitness scoring, parent selection, magnitude-based crossover, mutation, host-resource gating, and birth-event logging. The demo deliberately avoids claims of sentience or biological life; it treats the system as a software simulation of agent-lineage mechanics.

| Proof element | Value |
| --- | --- |
| Seed | \`${SEED}\` |
| Topology | \`${GENOME_TOPOLOGY.join(" → ")}\` |
| Expected weight count | ${countWeights(GENOME_TOPOLOGY)} |
| Parent A | ${parentA.label}, fitness ${parentA.fitness} |
| Parent B | ${parentB.label}, fitness ${parentB.fitness} |
| Selected parents | ${winnerA.label} × ${winnerB.label} |
| Direct child generation | ${directChild.generation} |
| Direct child fitness | ${directChild.fitness} |
| Host-resource gate open | ${resourceGateOpen ? "Yes" : "No"} |
| Birth event created by \`genomeTick\` | ${birthEvent ? "Yes" : "No"} |

> ${birthLine}

## What this proves

The script imports and executes the repository's own Republic modules rather than mocking the mechanics. It verifies that a pair of parent genomes can be evaluated, selected, crossed over, mutated, and converted into an offspring genome. When host resources allow reproduction, \`genomeTick\` also adds the offspring to the genome pool, creates a linked ML-model record, emits a \`Birth\` event, and increments the event counter.

## What this does not claim

This proof does not claim consciousness, personhood, biological reproduction, or autonomous real-world authority. It is a reproducible software demonstration of lineage-like model mechanics inside an agent-civilization simulation.

## Reproduce locally

Run the following command from the repository root:

\`\`\`bash
node --import tsx scripts/hoc-republic-proof-demo.ts
\`\`\`

The script writes the machine-readable proof to:

\`\`\`text
${jsonPath}
\`\`\`
`;

writeFileSync(mdPath, markdown);
console.log(`Wrote ${jsonPath}`);
console.log(`Wrote ${mdPath}`);
console.log(JSON.stringify({ resourceGateOpen, birthCreated: Boolean(birthEvent), poolSizeAfter: state.genomePool.length }, null, 2));
