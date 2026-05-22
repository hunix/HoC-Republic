import * as fs from "fs";
import * as path from "path";

function walk(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const stat = fs.statSync(path.join(dir, file));
    if (stat.isDirectory()) {
      walk(path.join(dir, file), fileList);
    } else if (file.endsWith(".tsx")) {
      fileList.push(path.join(dir, file));
    }
  }
  return fileList;
}

const pagesDir = "c:/Users/HK/sources/repos/HoC/hoc-ui/src/pages";
const files = walk(pagesDir);

const results = [];

files.forEach((file) => {
  const content = fs.readFileSync(file, "utf8");
  const lines = content.split("\n");

  lines.forEach((line, index) => {
    if (
      line.includes("<Button ") ||
      line.includes("<button ") ||
      line.includes("actions={<Button")
    ) {
      // Check next few lines for onClick if not on this line
      let snippet = line;
      for (let i = 1; i < 5; i++) {
        if (lines[index + i]) {
          snippet += " " + lines[index + i].trim();
        }
      }

      const onClickMatch = snippet.match(/onClick=\{([^}]+)\}/);
      const isRefetch =
        onClickMatch && (onClickMatch[1].includes("refetch") || onClickMatch[1].includes("set"));
      const isConsoleLog = onClickMatch && onClickMatch[1].includes("console.log");
      const isEmpty = onClickMatch && onClickMatch[1].includes("() => {}");
      const hasOnClick = !!onClickMatch;

      if (!isRefetch && (isConsoleLog || isEmpty || !hasOnClick)) {
        results.push(`${file.split("\\").pop()}:${index + 1}: ${line.trim()}`);
      }
    }
  });
});

fs.writeFileSync("c:/Users/HK/sources/repos/HoC/button_audit.txt", results.join("\n"));
console.log(`Found ${results.length} static/placeholder buttons.`);
