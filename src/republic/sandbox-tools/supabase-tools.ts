/**
 * Supabase Tools — Project lifecycle, RLS policies, types, edge functions, storage
 * Handles: supabase_project, supabase_rls, supabase_types, supabase_edge_fn, supabase_storage
 */

import type { ToolInput, ToolHandlerMap, ToolSummaryMap, SandboxContext } from "./types.js";

export function createSupabaseToolsHandlers(ctx: SandboxContext): ToolHandlerMap {
  const { sandboxExec, sandboxWriteFile } = ctx;

  return {
    supabase_project: async (input: ToolInput) => {
      const { action, migration_name, migration_sql, seed_sql } = input;
      const projectDir = "/workspace";
      switch (action) {
        case "start": {
          const initResult = await sandboxExec(`cd ${projectDir} && ([ -d supabase ] || npx supabase init) && npx supabase start --ignore-health-check 2>&1`, projectDir, 300);
          if (initResult.exitCode !== 0) { return `Supabase start failed:\n${initResult.stderr || initResult.stdout}`; }
          const statusResult = await sandboxExec(`cd ${projectDir} && npx supabase status 2>&1`, projectDir, 30);
          return `✅ Supabase started!\n\n${statusResult.stdout}`;
        }
        case "stop": {
          const result = await sandboxExec(`cd ${projectDir} && npx supabase stop 2>&1`, projectDir, 60);
          return `Supabase stopped:\n${result.stdout}`;
        }
        case "status": {
          const result = await sandboxExec(`cd ${projectDir} && npx supabase status 2>&1`, projectDir, 15);
          return result.stdout || result.stderr;
        }
        case "migration": {
          if (!migration_name) { return "Error: migration_name is required"; }
          if (!migration_sql) { return "Error: migration_sql is required"; }
          const createResult = await sandboxExec(`cd ${projectDir} && npx supabase migration new ${migration_name} 2>&1`, projectDir, 15);
          if (createResult.exitCode !== 0) { return `Migration failed: ${createResult.stderr}`; }
          const findResult = await sandboxExec(`ls -t ${projectDir}/supabase/migrations/*.sql | head -1`, projectDir, 5);
          const migrationFile = findResult.stdout.trim();
          if (!migrationFile) { return "Error: Could not find migration file"; }
          await sandboxExec(`cat > '${migrationFile}' << 'MIGRATION_EOF'\n${migration_sql}\nMIGRATION_EOF`, projectDir, 10);
          const applyResult = await sandboxExec(`cd ${projectDir} && npx supabase db reset 2>&1`, projectDir, 60);
          return `✅ Migration '${migration_name}' applied.\n\nFile: ${migrationFile}\n\n${applyResult.stdout.slice(0, 2000)}`;
        }
        case "gen-types": {
          const result = await sandboxExec(`cd ${projectDir} && mkdir -p src/lib && npx supabase gen types typescript --local > src/lib/database.types.ts 2>&1`, projectDir, 30);
          if (result.exitCode !== 0) { return `Type generation failed: ${result.stderr}`; }
          const typesContent = await sandboxExec(`head -100 ${projectDir}/src/lib/database.types.ts`, projectDir, 5);
          return `✅ Types generated: src/lib/database.types.ts\n\n${typesContent.stdout.slice(0, 3000)}`;
        }
        case "seed": {
          if (!seed_sql) { return "Error: seed_sql is required"; }
          await sandboxExec(`cat > '${projectDir}/supabase/seed.sql' << 'SEED_EOF'\n${seed_sql}\nSEED_EOF`, projectDir, 10);
          const result = await sandboxExec(`cd ${projectDir} && npx supabase db reset 2>&1`, projectDir, 60);
          return `✅ Seed data applied.\n${result.stdout.slice(0, 2000)}`;
        }
        case "reset": {
          const result = await sandboxExec(`cd ${projectDir} && npx supabase db reset 2>&1`, projectDir, 60);
          return `Database reset.\n${result.stdout.slice(0, 2000)}`;
        }
        default:
          return `Unknown supabase action: ${action}. Valid: start, stop, status, migration, gen-types, seed, reset`;
      }
    },

    supabase_rls: async (input: ToolInput) => {
      const tableName = (input.table_name as string) || "";
      const rulesDesc = (input.rules as string) || "";
      const shouldApply = input.apply ?? false;
      const schemaName = (input.schema_name as string) || "public";
      if (!tableName || !rulesDesc) { return "Error: table_name and rules are required"; }
      const policies: string[] = [`-- RLS Policies for ${schemaName}.${tableName}`, `ALTER TABLE ${schemaName}.${tableName} ENABLE ROW LEVEL SECURITY;`, ""];
      const lower = rulesDesc.toLowerCase();
      if (lower.includes("own") || lower.includes("their own")) {
        policies.push(`CREATE POLICY "${tableName}_select_own" ON ${schemaName}.${tableName}\n  FOR SELECT USING (auth.uid() = user_id);`);
        policies.push(`CREATE POLICY "${tableName}_insert_own" ON ${schemaName}.${tableName}\n  FOR INSERT WITH CHECK (auth.uid() = user_id);`);
        policies.push(`CREATE POLICY "${tableName}_update_own" ON ${schemaName}.${tableName}\n  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);`);
        policies.push(`CREATE POLICY "${tableName}_delete_own" ON ${schemaName}.${tableName}\n  FOR DELETE USING (auth.uid() = user_id);`);
      }
      if (lower.includes("admin")) {
        policies.push(`CREATE POLICY "${tableName}_admin_all" ON ${schemaName}.${tableName}\n  FOR ALL USING (EXISTS (SELECT 1 FROM ${schemaName}.profiles WHERE id = auth.uid() AND role = 'admin'));`);
      }
      if (lower.includes("public read")) {
        policies.push(`CREATE POLICY "${tableName}_public_select" ON ${schemaName}.${tableName}\n  FOR SELECT USING (true);`);
      }
      const sql = policies.join("\n\n");
      if (shouldApply) {
        const result = await sandboxExec(`psql "$SUPABASE_DB_URL" -c "${sql.replace(/"/g, '\\"')}"`, "/workspace", 15);
        return result.exitCode === 0 ? `✅ RLS applied!\n\n\`\`\`sql\n${sql}\n\`\`\`` : `⚠️ Apply failed: ${result.stderr.slice(0, 300)}\n\n\`\`\`sql\n${sql}\n\`\`\``;
      }
      return `🔐 **RLS for \`${tableName}\`**\n\n\`\`\`sql\n${sql}\n\`\`\`\n\nSet \`apply: true\` to execute.`;
    },

    supabase_types: async (input: ToolInput) => {
      const outPath = (input.output_path as string) || "/workspace/src/types/database.ts";
      const projId = (input.project_id as string) || "";
      await sandboxExec(`mkdir -p $(dirname ${outPath})`, "/workspace", 5);
      let cmd = "supabase gen types typescript --local";
      if (projId) { cmd = `supabase gen types typescript --project-id ${projId}`; }
      const result = await sandboxExec(cmd, "/workspace", 30);
      if (result.exitCode === 0 && result.stdout.trim()) {
        await sandboxWriteFile(outPath, result.stdout);
        return `✅ Types: ${outPath} (${result.stdout.split("\n").length} lines)`;
      }
      const fallbackResult = await sandboxExec(`psql "$SUPABASE_DB_URL" -t -A -c "SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name, ordinal_position" 2>/dev/null`, "/workspace", 15);
      if (fallbackResult.exitCode === 0 && fallbackResult.stdout.trim()) {
        return `📝 Schema:\n\`\`\`\n${fallbackResult.stdout.slice(0, 6000)}\n\`\`\``;
      }
      return `⚠️ Could not generate types. Ensure Supabase is running.`;
    },

    supabase_edge_fn: async (input: ToolInput) => {
      const efAction = (input.action as string) || "list";
      const fnName = (input.function_name as string) || "my-function";
      const tmpl = (input.template as string) || "api";
      switch (efAction) {
        case "create": {
          await sandboxExec(`mkdir -p supabase/functions/${fnName}`, "/workspace", 5);
          const templates: Record<string, string> = {
            api: `import { serve } from "https://deno.land/std@0.168.0/http/server.ts";\nimport { createClient } from "https://esm.sh/@supabase/supabase-js@2";\n\nserve(async (req) => {\n  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", { global: { headers: { Authorization: req.headers.get("Authorization")! } } });\n  if (req.method === "GET") {\n    const { data, error } = await supabase.from("items").select("*").limit(50);\n    return new Response(JSON.stringify({ data, error }), { headers: { "Content-Type": "application/json" } });\n  }\n  return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });\n});\n`,
            webhook: `import { serve } from "https://deno.land/std@0.168.0/http/server.ts";\n\nserve(async (req) => {\n  const payload = await req.json();\n  console.log("Webhook received:", JSON.stringify(payload));\n  return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });\n});\n`,
            cron: `import { serve } from "https://deno.land/std@0.168.0/http/server.ts";\n\nserve(async () => {\n  console.log("Cron job executed at:", new Date().toISOString());\n  return new Response(JSON.stringify({ ok: true }));\n});\n`,
          };
          const code = templates[tmpl] || templates.api;
          await sandboxWriteFile(`/workspace/supabase/functions/${fnName}/index.ts`, code);
          return `✅ Edge function: supabase/functions/${fnName}/index.ts (${tmpl})`;
        }
        case "deploy": {
          const r = await sandboxExec(`supabase functions deploy ${fnName}`, "/workspace", 60);
          return r.exitCode === 0 ? `✅ Deployed: ${fnName}` : `❌ Failed: ${r.stderr.slice(0, 500)}`;
        }
        case "list": {
          const r = await sandboxExec("ls supabase/functions/ 2>/dev/null || echo 'No functions'", "/workspace", 5);
          return `📋 Edge Functions:\n${r.stdout}`;
        }
        case "test": {
          const testBody = (input.body as string) || "{}";
          const r = await sandboxExec(`curl -s -X POST http://localhost:54321/functions/v1/${fnName} -H 'Authorization: Bearer ${process.env.SUPABASE_ANON_KEY || ""}' -H 'Content-Type: application/json' -d '${testBody}'`, "/workspace", 15);
          return `🧪 Test ${fnName}:\n${r.stdout.slice(0, 4000)}`;
        }
        default:
          return `Unknown action: ${efAction}. Use: create, deploy, list, test`;
      }
    },

    supabase_storage: async (input: ToolInput) => {
      const stAction = (input.action as string) || "list-buckets";
      const bucketName = (input.bucket as string) || "";
      const supaUrl = process.env.SUPABASE_URL || "http://localhost:54321";
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
      const curlAuth = `-H 'Authorization: Bearer ${serviceKey}' -H 'apikey: ${serviceKey}'`;
      switch (stAction) {
        case "list-buckets": {
          const r = await sandboxExec(`curl -s ${curlAuth} '${supaUrl}/storage/v1/bucket'`, "/workspace", 10);
          return `📦 Buckets:\n\`\`\`json\n${r.stdout.slice(0, 4000)}\n\`\`\``;
        }
        case "create-bucket": {
          if (!bucketName) { return "Error: bucket required"; }
          const isPublic = input.public ?? false;
          const r = await sandboxExec(`curl -s -X POST ${curlAuth} -H 'Content-Type: application/json' '${supaUrl}/storage/v1/bucket' -d '{"id":"${bucketName}","name":"${bucketName}","public":${isPublic}}'`, "/workspace", 10);
          return `✅ Bucket created: ${bucketName}\n${r.stdout}`;
        }
        case "upload": {
          if (!bucketName || !input.file_path) { return "Error: bucket and file_path required"; }
          const remotePath = (input.remote_path as string) || (input.file_path as string).split("/").pop()!;
          const r = await sandboxExec(`curl -s -X POST ${curlAuth} -F 'file=@${input.file_path}' '${supaUrl}/storage/v1/object/${bucketName}/${remotePath}'`, "/workspace", 30);
          return `✅ Uploaded: ${input.file_path} → ${bucketName}/${remotePath}\n${r.stdout}`;
        }
        case "list": {
          if (!bucketName) { return "Error: bucket required"; }
          const r = await sandboxExec(`curl -s -X POST ${curlAuth} -H 'Content-Type: application/json' '${supaUrl}/storage/v1/object/list/${bucketName}' -d '{"prefix":"","limit":100}'`, "/workspace", 10);
          return `📋 Files in ${bucketName}:\n\`\`\`json\n${r.stdout.slice(0, 4000)}\n\`\`\``;
        }
        default:
          return `Unknown storage action: ${stAction}. Use: list-buckets, create-bucket, upload, list`;
      }
    },
  };
}

export const supabaseToolsSummary: ToolSummaryMap = {
  supabase_project: (input) => `🛢️ Supabase: ${input.action ?? "start"}`,
  supabase_rls: (input) => `🔐 RLS: ${input.table_name ?? "?"}`,
  supabase_types: () => `📝 Supabase Types`,
  supabase_edge_fn: (input) => `⚡ Edge Fn: ${input.action ?? "list"} ${input.function_name ?? ""}`,
  supabase_storage: (input) => `📦 Storage: ${input.action ?? "list-buckets"}`,
};
