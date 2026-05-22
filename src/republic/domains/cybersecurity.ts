import type { SeedDomain } from "./seed-data.js";

export const cybersecurityDomains: SeedDomain[] = [
  {
    path: "Cybersecurity",
    name: "Cybersecurity",
    description: "Protection of systems, networks, and data from digital threats",
    coreSkills: [
      "threat-modeling",
      "vulnerability-assessment",
      "incident-response",
      "security-architecture",
      "compliance-frameworks",
    ],
    minPracticeLevel: "bachelor",
  },
  {
    path: "Cybersecurity.NetworkSecurity",
    name: "Network Security",
    description: "Firewalls, intrusion detection, network segmentation, and traffic analysis",
    coreSkills: [
      "firewall-configuration",
      "ids-tuning",
      "packet-analysis",
      "vpn-architecture",
      "zero-trust-design",
    ],
    minPracticeLevel: "bachelor",
  },
  {
    path: "Cybersecurity.Cryptography",
    name: "Cryptography",
    description: "Encryption algorithms, key management, and cryptographic protocol design",
    coreSkills: [
      "symmetric-encryption",
      "asymmetric-encryption",
      "hash-functions",
      "digital-signatures",
      "post-quantum-crypto",
    ],
    minPracticeLevel: "master",
  },
  {
    path: "Cybersecurity.PenetrationTesting",
    name: "Penetration Testing",
    description: "Ethical hacking, exploit development, and red team operations",
    coreSkills: [
      "exploit-development",
      "social-engineering",
      "web-app-testing",
      "privilege-escalation",
      "report-writing",
    ],
    minPracticeLevel: "bachelor",
  },
  {
    path: "Cybersecurity.ThreatIntelligence",
    name: "Threat Intelligence",
    description: "Cyber threat analysis, indicator tracking, and adversary profiling",
    coreSkills: [
      "ioc-analysis",
      "malware-analysis",
      "adversary-tracking",
      "osint-collection",
      "threat-reporting",
    ],
    minPracticeLevel: "master",
  },
  {
    path: "Cybersecurity.ForensicAnalysis",
    name: "Digital Forensics",
    description: "Evidence acquisition, disk imaging, memory forensics, and chain-of-custody",
    coreSkills: [
      "disk-imaging",
      "memory-forensics",
      "log-analysis",
      "evidence-preservation",
      "timeline-reconstruction",
    ],
    minPracticeLevel: "master",
  },
];
