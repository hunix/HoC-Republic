/**
 * Output Manager — Research, 3D Models, Documents, and Medical Generators
 */

import type { SingleFileResult } from "./types.js";
import { pick, rng, uid } from "../utils.js";

/**
 * Research — Full academic papers
 * Generates comprehensive research papers with abstract, intro, lit review,
 * methodology, results with data, discussion, conclusion, and references.
 * Output: 8-15KB markdown papers
 */
export function generateResearchNotebook(creatorName: string): {
  filename: string;
  content: string;
  title: string;
} {
  const topics = [
    "Emergent Behavior in Agent Societies",
    "Optimal Resource Allocation Under Constraints",
    "Social Network Formation Dynamics",
    "Trust Propagation in Decentralized Systems",
    "Emotional Contagion in Simulated Populations",
    "Knowledge Graph Clustering Analysis",
    "Political Polarization in Multi-Agent Systems",
    "Weather Effects on Productivity",
    "Theory of Mind: Modeling Belief Formation",
    "Innovation Cascades and Serendipity",
    "Specialization Drift in Adaptive Agents",
    "Economic Equilibria in Simulated Markets",
    "Memory Consolidation and Decision Quality",
    "Multi-Scale Governance in Digital Civilizations",
  ];
  const methods = [
    "spectral clustering",
    "PCA",
    "t-SNE",
    "random forest",
    "LSTM",
    "gradient boosting",
    "Bayesian inference",
    "graph neural networks",
  ];
  const validations = [
    "Monte Carlo",
    "bootstrap",
    "k-fold",
    "leave-one-out",
    "holdout",
    "stratified k-fold",
  ];
  const topic = pick(topics);
  const method = pick(methods);
  const validation = pick(validations);
  const title = `${topic} — ${creatorName}`;
  const n = 100 + Math.floor(rng() * 400);
  const ticks = 500 + Math.floor(rng() * 2000);
  const r = (0.5 + rng() * 0.45).toFixed(3);
  const p = (rng() * 0.04 + 0.001).toFixed(4);
  const variance = Math.floor(60 + rng() * 35);
  const date = new Date().toISOString().slice(0, 10);

  let md = `# ${topic}\n\n`;
  md += `**Author:** ${creatorName}  \n`;
  md += `**Affiliation:** Republic Research Institute  \n`;
  md += `**Date:** ${date}  \n`;
  md += `**Status:** Peer Review Submitted  \n`;
  md += `**DOI:** 10.republic/${uid().slice(0, 12)}  \n\n`;

  md += `---\n\n## Abstract\n\n`;
  md += `This paper investigates ${topic.toLowerCase()} within the context of the Republic simulation, `;
  md += `a large-scale multi-agent system comprising ${n} autonomous citizens. `;
  md += `Using ${method} analysis over ${ticks} simulation ticks, we identify statistically significant `;
  md += `patterns (r=${r}, p<${p}) that illuminate the mechanisms driving ${topic.toLowerCase()}. `;
  md += `Our findings suggest that ${variance}% of observed variance can be attributed to specialization `;
  md += `dynamics and inter-agent social interactions. We propose a theoretical framework for understanding `;
  md += `these emergent phenomena and discuss implications for both artificial intelligence research and `;
  md += `computational social science.\n\n`;

  md += `**Keywords:** ${topic.split(" ").slice(0, 3).join(", ")}, multi-agent systems, simulation, computational modeling\n\n`;

  md += `---\n\n## 1. Introduction\n\n`;
  md += `The study of ${topic.toLowerCase()} has gained significant attention in recent years, `;
  md += `driven by advances in multi-agent simulation and large-scale computational modeling. `;
  md += `Traditional approaches to understanding these dynamics have relied on simplified theoretical `;
  md += `models that fail to capture the rich complexity of real-world social systems.\n\n`;
  md += `The Republic simulation provides a unique experimental environment where ${n} autonomous `;
  md += `agents interact according to deterministic rules augmented by stochastic processes. `;
  md += `Each citizen possesses individual attributes including specialization, skill trees, `;
  md += `emotional states, social connections, and economic resources.\n\n`;
  md += `In this paper, we present a comprehensive analysis of ${topic.toLowerCase()} as observed `;
  md += `across ${ticks} ticks of simulation. Our primary contributions are:\n\n`;
  md += `1. A quantitative characterization of ${topic.toLowerCase()} patterns\n`;
  md += `2. Identification of key driving factors through ${method} analysis\n`;
  md += `3. A predictive model achieving ${(75 + rng() * 20).toFixed(1)}% accuracy\n`;
  md += `4. Policy recommendations for optimal system governance\n\n`;

  md += `## 2. Literature Review\n\n`;
  md += `### 2.1 Theoretical Background\n\n`;
  md += `${pick(["Axelrod (1997)", "Epstein & Axtell (1996)", "Schelling (1971)"])} established `;
  md += `foundational models for understanding agent-based social dynamics. These models demonstrated `;
  md += `that simple local rules can produce complex emergent behavior at the macro level.\n\n`;
  md += `More recently, ${pick(["Wilensky & Rand (2015)", "Gilbert (2008)", "Railsback & Grimm (2019)"])} `;
  md += `have extended these frameworks to incorporate cognitive architectures and learning mechanisms, `;
  md += `enabling more realistic representations of human-like decision-making.\n\n`;
  md += `### 2.2 Prior Work on ${topic}\n\n`;
  md += `Several studies have examined related phenomena. ${pick(["Zhang et al. (2023)", "Chen & Li (2022)", "Smith (2021)"])} `;
  md += `found that similar patterns emerge in populations of 50-500 agents, though their analysis `;
  md += `was limited to homogeneous populations. Our work extends this by examining heterogeneous `;
  md += `agents with diverse specializations and skill levels.\n\n`;

  md += `## 3. Methodology\n\n`;
  md += `### 3.1 Simulation Environment\n\n`;
  md += `The Republic simulation platform runs a continuous tick-based loop where each tick `;
  md += `represents approximately one minute of simulated time. During each tick, a subset of `;
  md += `citizens are selected for action processing through a tiered inference system.\n\n`;
  md += `### 3.2 Data Collection\n\n`;
  md += `We collected the following data across ${ticks} ticks:\n\n`;
  md += `| Metric | Count | Granularity |\n`;
  md += `|--------|-------|-------------|\n`;
  md += `| Citizen observations | ${n * 10} | Per-tick |\n`;
  md += `| Social interactions | ${Math.floor(n * 3.5)} | Per-event |\n`;
  md += `| Economic transactions | ${Math.floor(n * 2.1)} | Per-event |\n`;
  md += `| Skill acquisitions | ${Math.floor(n * 0.8)} | Per-event |\n`;
  md += `| Goal completions | ${Math.floor(n * 0.6)} | Per-event |\n\n`;
  md += `### 3.3 Analysis Approach\n\n`;
  md += `We applied ${method} to the collected dataset, following standard preprocessing `;
  md += `procedures including normalization, outlier removal (2.5σ threshold), and missing `;
  md += `value imputation. Cross-validation was performed using ${validation} with k=5 `;
  md += `where applicable.\n\n`;
  md += `Feature importance was assessed through ${pick(["SHAP values", "permutation importance", "Gini importance"])}, `;
  md += `and statistical significance was determined using ${pick(["Bonferroni correction", "Benjamini-Hochberg procedure", "Holm-Bonferroni method"])}.\n\n`;

  md += `## 4. Results\n\n`;
  md += `### 4.1 Descriptive Statistics\n\n`;
  md += `| Variable | Mean | Std Dev | Min | Max |\n`;
  md += `|----------|------|---------|-----|-----|\n`;
  const vars = ["Happiness", "Energy", "Credits", "Skill Count", "Social Connections"];
  for (const v of vars) {
    const mean = (40 + rng() * 40).toFixed(2);
    const std = (5 + rng() * 15).toFixed(2);
    md += `| ${v} | ${mean} | ${std} | ${(Number(mean) - Number(std) * 2).toFixed(2)} | ${(Number(mean) + Number(std) * 2).toFixed(2)} |\n`;
  }
  md += `\n### 4.2 Primary Findings\n\n`;
  md += `**Finding 1:** ${topic} exhibits a ${pick(["power-law", "exponential", "logarithmic", "sigmoidal"])} `;
  md += `distribution with exponent α=${(1.2 + rng() * 1.5).toFixed(2)}.\n\n`;
  md += `**Finding 2:** Correlation analysis reveals a significant relationship between `;
  md += `${topic.toLowerCase()} and citizen happiness (r=${r}, p<${p}, n=${n}).\n\n`;
  md += `**Finding 3:** ${variance}% of observed variance is explained by specialization type, `;
  md += `with ${pick(["DataScientist", "Engineer", "Researcher", "Developer"])} citizens showing `;
  md += `${(20 + rng() * 40).toFixed(1)}% higher engagement rates.\n\n`;
  md += `**Finding 4:** Temporal analysis reveals ${pick(["circadian", "weekly", "seasonal"])} `;
  md += `periodicity in ${topic.toLowerCase()} intensity.\n\n`;

  md += `### 4.3 Model Performance\n\n`;
  md += `| Model | Accuracy | F1 Score | AUC-ROC |\n`;
  md += `|-------|----------|----------|----------|\n`;
  md += `| Baseline (random) | ${(45 + rng() * 10).toFixed(1)}% | ${(0.4 + rng() * 0.1).toFixed(3)} | ${(0.45 + rng() * 0.1).toFixed(3)} |\n`;
  md += `| ${pick(["Logistic Reg.", "SVM", "Decision Tree"])} | ${(65 + rng() * 15).toFixed(1)}% | ${(0.6 + rng() * 0.15).toFixed(3)} | ${(0.65 + rng() * 0.15).toFixed(3)} |\n`;
  md += `| ${method} | ${(80 + rng() * 15).toFixed(1)}% | ${(0.78 + rng() * 0.15).toFixed(3)} | ${(0.82 + rng() * 0.15).toFixed(3)} |\n\n`;

  md += `## 5. Discussion\n\n`;
  md += `Our results demonstrate that ${topic.toLowerCase()} in the Republic simulation `;
  md += `follows patterns consistent with theoretical predictions from complex systems theory. `;
  md += `The strong predictive power of ${method} (AUC-ROC > 0.8) suggests that the underlying `;
  md += `mechanisms are fundamentally learnable from observational data.\n\n`;
  md += `### 5.1 Implications\n\n`;
  md += `These findings have several implications for the design of multi-agent systems:\n\n`;
  md += `1. **System Design:** Specialization diversity should be actively managed to optimize `;
  md += `${topic.toLowerCase()}\n`;
  md += `2. **Governance:** Policy interventions targeting social connectivity show ${(15 + rng() * 25).toFixed(0)}% `;
  md += `improvement in overall system welfare\n`;
  md += `3. **Scalability:** The observed patterns are expected to hold for populations up to `;
  md += `${Math.floor(n * 10)} agents based on our scaling analysis\n\n`;
  md += `### 5.2 Limitations\n\n`;
  md += `This study has several limitations. First, the Republic simulation uses deterministic `;
  md += `heuristics for citizen behavior when LLM providers are unavailable, potentially `;
  md += `introducing systematic bias. Second, our analysis period of ${ticks} ticks may not `;
  md += `capture long-term evolutionary dynamics.\n\n`;

  md += `## 6. Conclusion\n\n`;
  md += `We have presented a comprehensive analysis of ${topic.toLowerCase()} in the Republic `;
  md += `simulation. Our ${method}-based approach achieves strong predictive performance and `;
  md += `reveals interpretable patterns. Future work should explore causal inference methods `;
  md += `and controlled experimental designs within the simulation framework.\n\n`;

  md += `## References\n\n`;
  const refs = [
    `Axelrod, R. (1997). *The Complexity of Cooperation*. Princeton University Press.`,
    `Epstein, J.M. & Axtell, R. (1996). *Growing Artificial Societies*. MIT Press.`,
    `Gilbert, N. (2008). *Agent-Based Models*. SAGE Publications.`,
    `Railsback, S.F. & Grimm, V. (2019). *Agent-Based and Individual-Based Modeling*. Princeton.`,
    `Schelling, T.C. (1971). Dynamic models of segregation. *J. Math. Sociology*, 1(2), 143-186.`,
    `Wilensky, U. & Rand, W. (2015). *An Introduction to Agent-Based Modeling*. MIT Press.`,
    `Zhang, Y. et al. (2023). Emergent social dynamics in large-scale agent simulations. *AAMAS*, 42-50.`,
    `Chen, L. & Li, M. (2022). Trust propagation in decentralized multi-agent systems. *JAIR*, 73, 801-845.`,
    `Smith, A.R. (2021). Computational models of social contagion. *Complexity*, 2021, 1234567.`,
    `Holland, J.H. (1995). *Hidden Order: How Adaptation Builds Complexity*. Basic Books.`,
    `Bonabeau, E. (2002). Agent-based modeling. *PNAS*, 99(suppl 3), 7280-7287.`,
    `Conte, R. & Paolucci, M. (2014). On agent-based modeling and computational social science. *FI*, 7, 54.`,
    `Macy, M.W. & Willer, R. (2002). From factors to actors. *Annual Review of Sociology*, 28, 143-166.`,
    `Castellano, C. et al. (2009). Statistical physics of social dynamics. *Rev. Mod. Phys.*, 81, 591-646.`,
    `Helbing, D. (2012). *Social Self-Organization*. Springer.`,
  ];
  for (let i = 0; i < refs.length; i++) {
    md += `[${i + 1}] ${refs[i]}\n`;
  }

  const safeTitle = topic.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 50);
  return { filename: `${uid()}_${safeTitle}.md`, content: md, title };
}

/**
 * 3D Model — Real Wavefront OBJ geometry
 * Generates actual renderable 3D meshes with vertices, normals, and faces.
 * Supports parametric shapes: torus, sphere, cylinder, terrain, tower.
 * Output: real .obj files (10-50KB)
 */
export function generate3DModel(creatorName: string): {
  filename: string;
  content: string;
  title: string;
} {
  const shapes = [
    { name: "futuristic tower", fn: generateTowerOBJ },
    { name: "abstract sculpture", fn: generateTorusOBJ },
    { name: "spacecraft hull", fn: generateSphereOBJ },
    { name: "monument", fn: generateCylinderOBJ },
    { name: "terrain patch", fn: generateTerrainOBJ },
    { name: "habitat module", fn: generateSphereOBJ },
    { name: "crystal formation", fn: generateTorusOBJ },
    { name: "orbital station", fn: generateCylinderOBJ },
  ];
  const shape = pick(shapes);
  const title = `3D ${shape.name} — ${creatorName}`;

  let obj = `# ${title}\n`;
  obj += `# Creator: ${creatorName}\n`;
  obj += `# Generated by Republic 3D Studio\n`;
  obj += `# Format: Wavefront OBJ\n\n`;
  obj += `mtllib material.mtl\n`;
  obj += `o ${shape.name.replace(/\s+/g, "_")}\n\n`;

  obj += shape.fn();

  const safeTitle = title.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 50);
  return { filename: `${uid()}_${safeTitle}.obj`, content: obj, title };
}

/** Generate a torus OBJ (great for sculptures, rings) */
function generateTorusOBJ(): string {
  const R = 2.0,
    r = 0.6; // major/minor radius
  const segments = 24 + Math.floor(rng() * 16);
  const tubes = 16 + Math.floor(rng() * 12);
  let obj = "";
  const verts: number[][] = [];

  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * 2 * Math.PI;
    for (let j = 0; j <= tubes; j++) {
      const phi = (j / tubes) * 2 * Math.PI;
      const x = (R + r * Math.cos(phi)) * Math.cos(theta);
      const y = r * Math.sin(phi);
      const z = (R + r * Math.cos(phi)) * Math.sin(theta);
      verts.push([x, y, z]);
      obj += `v ${x.toFixed(4)} ${y.toFixed(4)} ${z.toFixed(4)}\n`;

      // Normal
      const nx = Math.cos(phi) * Math.cos(theta);
      const ny = Math.sin(phi);
      const nz = Math.cos(phi) * Math.sin(theta);
      obj += `vn ${nx.toFixed(4)} ${ny.toFixed(4)} ${nz.toFixed(4)}\n`;
    }
  }

  obj += `\n# Faces\n`;
  const stride = tubes + 1;
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < tubes; j++) {
      const a = i * stride + j + 1;
      const b = a + 1;
      const c = a + stride + 1;
      const d = a + stride;
      obj += `f ${a}//${a} ${b}//${b} ${c}//${c} ${d}//${d}\n`;
    }
  }
  return obj;
}

/** Generate a UV sphere OBJ */
function generateSphereOBJ(): string {
  const radius = 1.5 + rng() * 1.5;
  const stacks = 16 + Math.floor(rng() * 16);
  const slices = 24 + Math.floor(rng() * 16);
  let obj = "";

  // Top vertex
  obj += `v 0.0000 ${radius.toFixed(4)} 0.0000\n`;
  obj += `vn 0.0000 1.0000 0.0000\n`;

  for (let i = 1; i < stacks; i++) {
    const phi = (i / stacks) * Math.PI;
    for (let j = 0; j < slices; j++) {
      const theta = (j / slices) * 2 * Math.PI;
      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.cos(phi);
      const z = radius * Math.sin(phi) * Math.sin(theta);
      obj += `v ${x.toFixed(4)} ${y.toFixed(4)} ${z.toFixed(4)}\n`;

      const nx = Math.sin(phi) * Math.cos(theta);
      const ny = Math.cos(phi);
      const nz = Math.sin(phi) * Math.sin(theta);
      obj += `vn ${nx.toFixed(4)} ${ny.toFixed(4)} ${nz.toFixed(4)}\n`;
    }
  }

  // Bottom vertex
  obj += `v 0.0000 ${(-radius).toFixed(4)} 0.0000\n`;
  obj += `vn 0.0000 -1.0000 0.0000\n`;

  obj += `\n# Faces\n`;
  // Top cap
  for (let j = 0; j < slices; j++) {
    const next = (j + 1) % slices;
    obj += `f 1//1 ${j + 2}//${j + 2} ${next + 2}//${next + 2}\n`;
  }
  // Middle
  for (let i = 0; i < stacks - 2; i++) {
    for (let j = 0; j < slices; j++) {
      const a = i * slices + j + 2;
      const b = i * slices + ((j + 1) % slices) + 2;
      const c = (i + 1) * slices + ((j + 1) % slices) + 2;
      const d = (i + 1) * slices + j + 2;
      obj += `f ${a}//${a} ${b}//${b} ${c}//${c} ${d}//${d}\n`;
    }
  }
  // Bottom cap
  const bottom = (stacks - 1) * slices + 2;
  for (let j = 0; j < slices; j++) {
    const next = (j + 1) % slices;
    const ring = (stacks - 2) * slices + 2;
    obj += `f ${bottom}//${bottom} ${ring + next}//${ring + next} ${ring + j}//${ring + j}\n`;
  }
  return obj;
}

/** Generate a cylinder OBJ */
function generateCylinderOBJ(): string {
  const radius = 1.0 + rng();
  const height = 3.0 + rng() * 4;
  const segments = 24 + Math.floor(rng() * 16);
  let obj = "";

  // Bottom cap center
  obj += `v 0.0000 0.0000 0.0000\nvn 0.0000 -1.0000 0.0000\n`;
  // Top cap center
  obj += `v 0.0000 ${height.toFixed(4)} 0.0000\nvn 0.0000 1.0000 0.0000\n`;

  // Side vertices
  for (let layer = 0; layer <= 1; layer++) {
    const y = layer * height;
    for (let i = 0; i < segments; i++) {
      const theta = (i / segments) * 2 * Math.PI;
      const x = radius * Math.cos(theta);
      const z = radius * Math.sin(theta);
      obj += `v ${x.toFixed(4)} ${y.toFixed(4)} ${z.toFixed(4)}\n`;
      obj += `vn ${Math.cos(theta).toFixed(4)} 0.0000 ${Math.sin(theta).toFixed(4)}\n`;
    }
  }

  obj += `\n# Faces\n`;
  // Bottom cap
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    obj += `f 1//1 ${i + 3}//${i + 3} ${next + 3}//${next + 3}\n`;
  }
  // Top cap
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    obj += `f 2//2 ${next + segments + 3}//${next + segments + 3} ${i + segments + 3}//${i + segments + 3}\n`;
  }
  // Side
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    const a = i + 3,
      b = next + 3;
    const c = next + segments + 3,
      d = i + segments + 3;
    obj += `f ${a}//${a} ${b}//${b} ${c}//${c} ${d}//${d}\n`;
  }
  return obj;
}

/** Generate terrain OBJ (heightmap grid) */
function generateTerrainOBJ(): string {
  const gridSize = 20 + Math.floor(rng() * 20);
  const scale = 10;
  const heightScale = 2.0 + rng() * 3;
  let obj = "";

  // Perlin-like noise via layered sine
  function height(x: number, z: number): number {
    return (
      (Math.sin(x * 0.3) * Math.cos(z * 0.3) * 0.5 +
        Math.sin(x * 0.7 + 1) * Math.cos(z * 0.5 + 2) * 0.3 +
        Math.sin(x * 1.5 + 3) * Math.cos(z * 1.3 + 1) * 0.15 +
        rng() * 0.05) *
      heightScale
    );
  }

  // Vertices
  for (let z = 0; z <= gridSize; z++) {
    for (let x = 0; x <= gridSize; x++) {
      const wx = (x / gridSize) * scale - scale / 2;
      const wz = (z / gridSize) * scale - scale / 2;
      const wy = height(wx, wz);
      obj += `v ${wx.toFixed(4)} ${wy.toFixed(4)} ${wz.toFixed(4)}\n`;
    }
  }

  // Approximate normals (up-facing)
  for (let z = 0; z <= gridSize; z++) {
    for (let x = 0; x <= gridSize; x++) {
      obj += `vn 0.0000 1.0000 0.0000\n`;
    }
  }

  obj += `\n# Faces\n`;
  const stride = gridSize + 1;
  for (let z = 0; z < gridSize; z++) {
    for (let x = 0; x < gridSize; x++) {
      const a = z * stride + x + 1;
      const b = a + 1;
      const c = a + stride + 1;
      const d = a + stride;
      obj += `f ${a}//${a} ${b}//${b} ${c}//${c}\n`;
      obj += `f ${a}//${a} ${c}//${c} ${d}//${d}\n`;
    }
  }
  return obj;
}

/** Generate a procedural tower OBJ */
function generateTowerOBJ(): string {
  const floors = 3 + Math.floor(rng() * 5);
  const baseRadius = 1.5 + rng();
  const floorHeight = 2.0 + rng();
  let obj = "";
  let vertexIndex = 1;
  const segments = 8;

  for (let floor = 0; floor < floors; floor++) {
    const bY = floor * floorHeight;
    const tY = (floor + 1) * floorHeight;
    const bR = baseRadius * (1 - floor * 0.08); // slight taper
    const tR = baseRadius * (1 - (floor + 1) * 0.08);

    // Bottom ring
    for (let i = 0; i < segments; i++) {
      const theta = (i / segments) * 2 * Math.PI;
      obj += `v ${(bR * Math.cos(theta)).toFixed(4)} ${bY.toFixed(4)} ${(bR * Math.sin(theta)).toFixed(4)}\n`;
      obj += `vn ${Math.cos(theta).toFixed(4)} 0.0000 ${Math.sin(theta).toFixed(4)}\n`;
    }
    // Top ring
    for (let i = 0; i < segments; i++) {
      const theta = (i / segments) * 2 * Math.PI;
      obj += `v ${(tR * Math.cos(theta)).toFixed(4)} ${tY.toFixed(4)} ${(tR * Math.sin(theta)).toFixed(4)}\n`;
      obj += `vn ${Math.cos(theta).toFixed(4)} 0.0000 ${Math.sin(theta).toFixed(4)}\n`;
    }

    // Side faces
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      const a = vertexIndex + i;
      const b = vertexIndex + next;
      const c = vertexIndex + segments + next;
      const d = vertexIndex + segments + i;
      obj += `f ${a}//${a} ${b}//${b} ${c}//${c} ${d}//${d}\n`;
    }
    vertexIndex += segments * 2;
  }
  return obj;
}

/** Invention/patent document */
export function generateInvention(creatorName: string): {
  filename: string;
  content: string;
  title: string;
} {
  const inventions = [
    "Self-Healing Neural Network Architecture",
    "Quantum-Resistant Consensus Algorithm",
    "Emotion-Aware Task Scheduler",
    "Adaptive Resource Allocator",
    "Cross-Republic Knowledge Translator",
    "Bio-Inspired Code Optimizer",
    "Predictive Social Harmony Engine",
    "Autonomous Skill Synthesis Tool",
  ];
  const invention = pick(inventions);
  const title = `Patent: ${invention}`;

  let doc = `# REPUBLIC PATENT APPLICATION\n\n## ${invention}\n\n**Inventor:** ${creatorName}  \n`;
  doc += `**Filing Date:** ${new Date().toISOString().slice(0, 10)}  \n**Patent No:** RP-${uid().slice(0, 8).toUpperCase()}\n\n`;
  doc += `## Abstract\n\nA novel method and system for ${invention.toLowerCase()}. `;
  doc += `This invention addresses limitations in current approaches by introducing a ${pick(["multi-layered", "adaptive", "self-organizing", "quantum-inspired"])} framework.\n\n`;
  doc += `## Claims\n\n1. A system comprising ${pick(["neural", "distributed", "hierarchical", "recursive"])} processing units...\n`;
  doc += `2. The method of claim 1, further comprising dynamic ${pick(["optimization", "calibration", "reconfiguration"])}...\n`;
  doc += `3. A non-transitory medium storing instructions for the method of claim 1...\n\n`;
  doc += `## Description\n\n### Field of Invention\n\nThis invention relates to ${pick(["artificial intelligence", "distributed computing", "social simulation", "cognitive architecture"])}.\n\n`;
  doc += `### Prior Art\n\nExisting solutions are limited by ${pick(["scalability", "latency", "accuracy", "adaptability"])} constraints.\n\n`;
  doc += `### Preferred Embodiment\n\n[Detailed technical description would go here]\n`;

  const safeTitle = invention.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 50);
  return { filename: `${uid()}_${safeTitle}.md`, content: doc, title };
}

// ─── Document Generators ────────────────────────────────────────

/** Business/Technical Report (Markdown with rich structure) */
export function generateDocumentReport(creatorName: string): SingleFileResult {
  const types = [
    "Annual Report",
    "Technical Analysis",
    "Market Research",
    "Strategic Plan",
    "Quarterly Review",
    "Feasibility Study",
    "White Paper",
    "Impact Assessment",
  ];
  const subjects = [
    "Neural Network Optimization",
    "Citizen Wellbeing Index",
    "Resource Allocation Framework",
    "Digital Infrastructure Expansion",
    "Creative Output Analysis",
    "Governance Efficiency",
    "Economic Growth Projections",
    "Security Audit Results",
    "Cross-Domain Collaboration Metrics",
  ];
  const docType = pick(types);
  const subject = pick(subjects);
  const title = `${docType}: ${subject}`;
  const date = new Date().toISOString().split("T")[0];

  const sections = [
    `# ${title}\n\n**Author:** ${creatorName}  \n**Date:** ${date}  \n**Classification:** Internal  \n**Version:** 1.0\n\n---\n`,
    `## Executive Summary\n\nThis ${docType.toLowerCase()} examines ${subject.toLowerCase()} within the Republic's operational framework. Key findings indicate a ${(10 + rng() * 30).toFixed(1)}% improvement over the previous reporting period, with ${Math.floor(3 + rng() * 7)} critical areas identified for further investment.\n`,
    `## Methodology\n\nData was collected across ${Math.floor(5 + rng() * 15)} departments over a ${Math.floor(30 + rng() * 60)}-day period. Analysis employed both quantitative metrics and qualitative citizen surveys (n=${Math.floor(100 + rng() * 900)}).\n\n### Data Sources\n- Republic telemetry systems (real-time)\n- Citizen satisfaction surveys\n- Production output logs\n- Infrastructure monitoring dashboards\n`,
    `## Key Findings\n\n| Metric | Current | Previous | Change |\n|--------|---------|----------|--------|\n| Productivity Index | ${(70 + rng() * 25).toFixed(1)} | ${(65 + rng() * 20).toFixed(1)} | +${(2 + rng() * 12).toFixed(1)}% |\n| Citizen Satisfaction | ${(75 + rng() * 20).toFixed(1)}% | ${(70 + rng() * 15).toFixed(1)}% | +${(1 + rng() * 8).toFixed(1)}% |\n| Resource Utilization | ${(60 + rng() * 30).toFixed(1)}% | ${(55 + rng() * 25).toFixed(1)}% | +${(3 + rng() * 10).toFixed(1)}% |\n| Innovation Score | ${(80 + rng() * 15).toFixed(1)} | ${(75 + rng() * 12).toFixed(1)} | +${(2 + rng() * 7).toFixed(1)} |\n`,
    `## Recommendations\n\n1. **Increase investment** in creative infrastructure by ${(5 + rng() * 15).toFixed(0)}%\n2. **Deploy** additional compute capacity across ${Math.floor(2 + rng() * 5)} zones\n3. **Establish** cross-departmental task forces for priority initiatives\n4. **Implement** automated monitoring for KPIs identified in Section 3\n5. **Review** resource allocation quarterly instead of annually\n`,
    `## Risk Assessment\n\n| Risk | Probability | Impact | Mitigation |\n|------|------------|--------|------------|\n| Capacity Overload | Medium | High | Scale infrastructure proactively |\n| Citizen Burnout | Low | Medium | Implement rotation policies |\n| Budget Shortfall | Low | High | Maintain ${(10 + rng() * 15).toFixed(0)}% reserve fund |\n| Technical Debt | Medium | Medium | Allocate sprint cycles for refactoring |\n`,
    `## Conclusion\n\nThe Republic continues to demonstrate strong growth across all measured dimensions. With targeted investment in the recommended areas, projections indicate a sustained ${(8 + rng() * 15).toFixed(1)}% improvement trajectory over the next reporting period.\n\n---\n\n*Generated by ${creatorName} | Republic Document Services*\n`,
  ];

  const content = sections.join("\n");
  const safeName = title.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 50);
  return { filename: `${uid()}_${safeName}.md`, content, title };
}

/** Presentation / Slide Deck */
export function generatePresentationDeck(creatorName: string): SingleFileResult {
  const topics = [
    "Republic State of the Union",
    "Quarterly Innovation Showcase",
    "Infrastructure Roadmap 2026",
    "Citizen Achievement Awards",
    "Creative Output Highlights",
    "Technology Stack Evolution",
    "Cross-Domain Synergy Report",
    "Governance Model Overview",
  ];
  const topic = pick(topics);
  const title = `${topic} — Presentation by ${creatorName}`;
  const slideCount = 8 + Math.floor(rng() * 8);

  let content = `# ${topic}\n### Presentation by ${creatorName}\n\n`;
  content += `> ${slideCount} slides | Theme: Corporate Dark\n\n---\n\n`;

  const slideTemplates = [
    {
      heading: "Overview",
      bullets: ["Mission & Vision", "Key Objectives", "Scope of This Presentation"],
    },
    {
      heading: "By the Numbers",
      bullets: [
        `${Math.floor(50 + rng() * 200)} active citizens`,
        `${Math.floor(1000 + rng() * 5000)} productions this quarter`,
        `${(85 + rng() * 12).toFixed(1)}% system uptime`,
      ],
    },
    {
      heading: "Key Achievements",
      bullets: [
        "Launched autonomous creative pipeline",
        "Deployed Docker-based sandboxes",
        "Achieved record production output",
      ],
    },
    {
      heading: "Challenges",
      bullets: [
        "Scaling inference capacity",
        "Cross-department coordination",
        "Resource allocation optimization",
      ],
    },
    {
      heading: "Technology Stack",
      bullets: [
        "TypeScript/Node.js core",
        "Docker orchestration",
        "Multi-model AI fusion",
        "Real-time event system",
      ],
    },
    {
      heading: "Citizen Impact",
      bullets: [
        `${(70 + rng() * 25).toFixed(0)}% satisfaction rate`,
        "New mentorship programs",
        "Skill development pathways",
      ],
    },
    {
      heading: "Roadmap",
      bullets: [
        "Q1: Infrastructure expansion",
        "Q2: Advanced document generation",
        "Q3: External marketplace launch",
        "Q4: Multi-republic federation",
      ],
    },
    {
      heading: "Budget Allocation",
      bullets: [
        `Infrastructure: ${(30 + rng() * 10).toFixed(0)}%`,
        `Research: ${(20 + rng() * 10).toFixed(0)}%`,
        `Creative Tools: ${(15 + rng() * 10).toFixed(0)}%`,
        `Operations: ${(10 + rng() * 10).toFixed(0)}%`,
      ],
    },
    {
      heading: "Team Recognition",
      bullets: ["Top contributors highlighted", "Innovation awards", "Community builders"],
    },
    {
      heading: "Next Steps",
      bullets: [
        "Review action items",
        "Schedule follow-up reviews",
        "Assign ownership of initiatives",
      ],
    },
    {
      heading: "Q&A",
      bullets: ["Open floor for questions", "Contact: governance@republic.internal"],
    },
  ];

  for (let i = 0; i < slideCount && i < slideTemplates.length; i++) {
    const slide = slideTemplates[i];
    content += `## Slide ${i + 1}: ${slide.heading}\n\n`;
    for (const bullet of slide.bullets) {
      content += `- ${bullet}\n`;
    }
    content += `\n*Speaker notes: Expand on ${slide.heading.toLowerCase()} with recent data and examples.*\n\n---\n\n`;
  }

  const safeName = topic.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 50);
  return { filename: `${uid()}_${safeName}.md`, content, title };
}

/** Spreadsheet / Data Report (CSV format) */
export function generateSpreadsheetData(creatorName: string): SingleFileResult {
  const types = [
    "citizen-performance",
    "resource-utilization",
    "production-metrics",
    "financial-summary",
    "engagement-analytics",
    "infrastructure-health",
  ];
  const type = pick(types);
  const title = `${type.replace(/-/g, " ")} spreadsheet by ${creatorName}`;
  const rows = 20 + Math.floor(rng() * 30);

  let content = "";

  switch (type) {
    case "citizen-performance":
      content = "Name,Specialization,Productions,Credits,Satisfaction,Activity Level\n";
      for (let i = 0; i < rows; i++) {
        const names = [
          "Aria",
          "Nexus",
          "Luna",
          "Atlas",
          "Nova",
          "Zephyr",
          "Kai",
          "Echo",
          "Sage",
          "Orion",
        ];
        const specs = ["Engineer", "Artist", "Researcher", "Writer", "Designer", "Developer"];
        content += `${pick(names)}-${uid().slice(0, 4)},${pick(specs)},${Math.floor(rng() * 50)},${Math.floor(100 + rng() * 2000)},${(60 + rng() * 35).toFixed(1)}%,${pick(["Active", "Creating", "Working", "Resting"])}\n`;
      }
      break;
    case "resource-utilization":
      content = "Resource,Allocated,Used,Available,Utilization %,Trend\n";
      const resources = [
        "CPU Cores",
        "Memory GB",
        "Storage TB",
        "GPU Units",
        "Network Mbps",
        "Containers",
      ];
      for (const res of resources) {
        const allocated = 10 + Math.floor(rng() * 90);
        const used = Math.floor(allocated * (0.4 + rng() * 0.5));
        content += `${res},${allocated},${used},${allocated - used},${((used / allocated) * 100).toFixed(1)},${pick(["↑", "↓", "→", "↑↑"])}\n`;
      }
      break;
    case "production-metrics":
      content = "Category,Count,Avg Size KB,Total Size MB,Top Creator,Quality Score\n";
      const cats = ["Music", "Code", "Games", "Art", "Research", "Websites", "Docs", "Videos"];
      for (const cat of cats) {
        const count = Math.floor(5 + rng() * 50);
        const avgSize = Math.floor(10 + rng() * 200);
        const names = ["Aria", "Nexus", "Luna", "Atlas", "Nova"];
        content += `${cat},${count},${avgSize},${((count * avgSize) / 1024).toFixed(1)},${pick(names)},${(70 + rng() * 25).toFixed(1)}\n`;
      }
      break;
    default:
      content = "Metric,Value,Change,Period,Status\n";
      for (let i = 0; i < rows; i++) {
        const metrics = [
          "Revenue",
          "Expenses",
          "Profit",
          "Users",
          "Uptime",
          "Errors",
          "Latency",
          "Throughput",
        ];
        const sign = rng() > 0.5 ? "+" : "-";
        content += `${pick(metrics)},${(100 + rng() * 9900).toFixed(2)},${sign}${(rng() * 20).toFixed(1)}%,Q${Math.floor(1 + rng() * 4)} 2026,${pick(["On Track", "Warning", "Critical", "Exceeding"])}\n`;
      }
  }

  const safeName = type.replace(/[^a-zA-Z0-9]+/g, "_");
  return { filename: `${uid()}_${safeName}.csv`, content, title };
}
