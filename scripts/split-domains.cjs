const fs = require('fs');
const lines = fs.readFileSync('src/republic/professional-domains.ts', 'utf8').split('\n');

const imports = lines.slice(0, 24).join('\n');
const constants = lines.slice(24, 29).join('\n');
const templates = lines.slice(29, 93).join('\n');
const toolkits = lines.slice(93, 299).join('\n');
const seedData = lines.slice(299, 1618).join('\n');
const logic = lines.slice(1618).join('\n');

fs.mkdirSync('src/republic/domains', { recursive: true });

fs.writeFileSync('src/republic/domains/templates.ts',
  'import type { CertificationLevel, DegreeTemplate } from "../types.js";\n\n' +
  templates
);

fs.writeFileSync('src/republic/domains/toolkits.ts',
  'import type { ProfessionalToolkit } from "../types.js";\n' +
  'import { uid } from "../utils.js";\n\n' +
  toolkits + '\n\n' +
  'export { toolkitStore, seedToolkits };\n'
);

fs.writeFileSync('src/republic/domains/seed-data.ts',
  'import type { CertificationLevel } from "../types.js";\n\n' +
  seedData + '\n\n' +
  'export { SEED_DOMAINS };\n' +
  'export type { SeedDomain };\n'
);

fs.writeFileSync('src/republic/professional-domains.ts',
  imports + '\n' +
  constants + '\n' +
  'export * from "./domains/templates.js";\n' +
  'import { toolkitStore, seedToolkits } from "./domains/toolkits.js";\n' +
  'import { SEED_DOMAINS } from "./domains/seed-data.js";\n\n' +
  logic
);
