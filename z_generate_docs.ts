import { sandboxExec, sandboxWriteFile } from "./src/republic/agent-sandbox.js";
import { createDocumentToolsHandlers } from "./src/republic/sandbox-tools/document-tools.js";

async function run() {
  console.log("Generating documents using Sandbox container...");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = { sandboxExec, sandboxWriteFile } as any;
  const tools = createDocumentToolsHandlers(ctx);
  
  const researchData = [
    {
      title: "Overview",
      content: "Security reconnaissance was performed on zenithr.com. WhatWeb and Nikto were executed against the target URL."
    },
    {
      title: "Infrastructure & WAF",
      content: "The target zenithr.com resolves to www.zenithr.com and is operating behind a **Cloudflare** Web Application Firewall (WAF).\n\nTechnology Stack:\n- jQuery\n- OpenResty"
    },
    {
      title: "Security Headers Detected",
      content: "- **Strict-Transport-Security (HSTS):** Enabled, ensuring connections are forced over HTTPS.\n- **X-Frame-Options:** Set to SAMEORIGIN, protecting against clickjacking attacks."
    },
    {
      title: "Nikto Scan Results",
      content: "The Nikto vulnerability scanner did not detect immediately exploitable local paths. The Cloudflare perimeter is actively routing and filtering malicious payloads, making direct enumeration difficult from an untrusted source."
    }
  ];

  const slideData = JSON.stringify(researchData);

  const resPPTX = await tools.create_document!({
    type: "pptx",
    filename: "ZenithR_Security_Research.pptx",
    title: "ZenithR Security Analysis",
    slide_data: slideData
  });
  console.log("PPTX Generation:", resPPTX);

  const resPDF = await tools.create_document!({
    type: "pdf",
    filename: "ZenithR_Security_Research.pdf",
    title: "ZenithR Security Analysis",
    slide_data: slideData
  });
  console.log("PDF Generation:", resPDF);
  
  // Exfiltrate from docker so the user has them locally in HoC workspace
  console.log("Copying generated files from docker to local workspace...");
  try {
     const { execSync } = require("child_process");
     // The sandbox mounts C:\Users\hani_\sources\repos\HoC\src\republic\workspace
     // So we just need to ensure they're accessible!
     execSync("docker cp hoc-playwright-sandbox:/workspace/ZenithR_Security_Research.pptx ./src/republic/workspace/ZenithR_Security_Research.pptx");
     execSync("docker cp hoc-playwright-sandbox:/workspace/ZenithR_Security_Research.pdf ./src/republic/workspace/ZenithR_Security_Research.pdf");
     console.log("Available in src/republic/workspace/");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
     console.log("Warning during copy (already mounted?):", e.message);
  }
}

run().catch(console.error);
