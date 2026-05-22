import fs from "node:fs/promises";
import path from "node:path";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export const fileSystemTools: ToolDefinition[] = [
  {
    name: "list_dir",
    description: "List contents of a directory",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path to list" }
      },
      required: ["path"]
    }
  },
  {
    name: "read_file",
    description: "Read contents of a file",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path to read" }
      },
      required: ["path"]
    }
  },
  {
    name: "write_file",
    description: "Write content to a file (Safeguarded)",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path to write" },
        content: { type: "string", description: "Content to write" }
      },
      required: ["path", "content"]
    }
  },
  {
    name: "delete_file",
    description: "Delete a file (Safeguarded)",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path to delete" }
      },
      required: ["path"]
    }
  }
];

export const fileSystemHandlers = {
  list_dir: async (args: { path: string }) => {
    try {
      const resolved = path.resolve(process.cwd(), args.path);
      const entries = await fs.readdir(resolved, { withFileTypes: true });
      return JSON.stringify(entries.map(e => ({
        name: e.name,
        type: e.isDirectory() ? "directory" : "file"
      })), null, 2);
    } catch (error: any) {
      return `Error listing directory: ${error.message}`;
    }
  },

  read_file: async (args: { path: string }) => {
    try {
      const resolved = path.resolve(process.cwd(), args.path);
      const content = await fs.readFile(resolved, "utf-8");
      return content;
    } catch (error: any) {
      return `Error reading file: ${error.message}`;
    }
  },

  write_file: async (args: { path: string; content: string }) => {
    try {
      const resolved = path.resolve(process.cwd(), args.path);
      // Safety check: Don't overwrite critical files without explicit "FORCE" flag (not impl yet, just being careful)
      // For now, allow writing to anything in CWD.
      if (!resolved.startsWith(process.cwd())) {
        return "Error: Cannot write outside of current working directory.";
      }
      
      await fs.writeFile(resolved, args.content, "utf-8");
      return `Successfully wrote to ${args.path}`;
    } catch (error: any) {
      return `Error writing file: ${error.message}`;
    }
  },

  delete_file: async (args: { path: string }) => {
    try {
      const resolved = path.resolve(process.cwd(), args.path);
      if (!resolved.startsWith(process.cwd())) {
        return "Error: Cannot delete outside of current working directory.";
      }
      await fs.unlink(resolved);
      return `Successfully deleted ${args.path}`;
    } catch (error: any) {
      return `Error deleting file: ${error.message}`;
    }
  }
};
