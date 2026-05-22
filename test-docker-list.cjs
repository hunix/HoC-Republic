const { execSync } = require("child_process");
const fmt = "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}|{{.CreatedAt}}";
const cmd = `docker ps -a --format "${fmt}"`;
console.log("Command:", cmd);
try {
  const out = execSync(cmd, { encoding: "utf-8", timeout: 30000, stdio: ["pipe","pipe","pipe"] }).trim();
  console.log("Raw output:", JSON.stringify(out));
  const lines = out.split("\n").filter(l => l.trim().length > 0);
  console.log("Number of lines:", lines.length);
  lines.forEach((line, i) => {
    console.log(`\nLine[${i}]:`, JSON.stringify(line));
    const parts = line.split("|");
    console.log("  ID:", parts[0]);
    console.log("  Name:", parts[1]);
    console.log("  Image:", parts[2]);
    console.log("  Status:", parts[3]);
    console.log("  Ports:", parts[4]);
    console.log("  CreatedAt:", parts[5]);
    const statusStr = (parts[3] || "").toLowerCase();
    let status = "unknown";
    if (statusStr.includes("up")) {status = "running";}
    else if (statusStr.includes("exited")) {status = "exited";}
    console.log("  Parsed status:", status);
  });
} catch (e) {
  console.log("Error:", e.message);
}
