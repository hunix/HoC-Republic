/**
 * Sandbox Tools — Shared Types
 *
 * Extracted from sandbox-agent-loop.ts to enable modular tool handlers.
 */

import type {
  sandboxExec as _sandboxExec,
  sandboxWriteFile as _sandboxWriteFile,
  sandboxReadFile as _sandboxReadFile,
  sandboxListFiles as _sandboxListFiles,
} from "../agent-sandbox.js";

// ── Sandbox function types (passed to handlers via context) ─────
export interface SandboxContext {
  sandboxExec: typeof _sandboxExec;
  sandboxWriteFile: typeof _sandboxWriteFile;
  sandboxReadFile: typeof _sandboxReadFile;
  sandboxListFiles: typeof _sandboxListFiles;
  /** Read an environment variable / API key */
  key: (name: string) => string;
  /** Ensure GPU warm pool sweep is running */
  ensureWarmPoolSweep: () => void;
  /** Touch a container to keep it alive in the warm pool */
  touchContainer: (name: string) => void;
  /** Get all registered tool handlers (optional, used by workflow_chain) */
  getAllHandlers?: () => ToolHandlerMap;
}

// ── Tool Input ──────────────────────────────────────────────────
// Unified input bag for all sandbox tools. Each tool destructures
// only the properties it needs.

export interface ToolInput {
  /** Allow arbitrary tool-specific properties */
  [key: string]: unknown;
  command?: string;
  cwd?: string;
  timeout?: number;
  path?: string;
  content?: string;
  manager?: string;
  packages?: string;
  url?: string;
  selectors?: string;
  mode?: string;
  message?: string;
  name?: string;
  description?: string;
  language?: string;
  code?: string;
  type?: string;
  filename?: string;
  title?: string;
  slide_data?: string;
  output_dir?: string;
  depth?: number;
  include_assets?: boolean;
  // browser_interact properties
  action?: string;
  selector?: string;
  value?: string;
  output_path?: string;
  // delegate_task properties
  project_name?: string;
  plan?: string;
  // deploy_public_url properties
  port?: number;
  tunnel_name?: string;
  // memory_query properties
  citizen_id?: string;
  activity?: string;
  topic?: string;
  // archive_files properties
  files?: string;
  output_name?: string;
  format?: string;
  // extract_archive properties
  archive_path?: string;
  list_only?: boolean;
  // request_clarification properties
  options?: string;
  step?: number;
  total_steps?: number;
  allow_multiple?: boolean;
  // create_document branding
  branding?: string;
  // claude_code properties
  task?: string;
  max_turns?: number;
  effort?: string;
  model?: string;
  // claude_review properties
  focus?: string;
  // supabase_project properties
  migration_name?: string;
  migration_sql?: string;
  seed_sql?: string;
  // screenshot properties
  full_page?: boolean;
  width?: number;
  height?: number;
  // deploy properties
  platform?: string;
  directory?: string;
  // git_repo properties
  repo_name?: string;
  commit_message?: string;
  private?: boolean;
  // run_tests properties
  framework?: string;
  coverage?: boolean;
  // generate_asset properties
  prompt?: string;
  style?: string;
  // lighthouse_audit properties
  categories?: string;
  // database_query properties
  sql?: string;
  // api_test properties
  base_url?: string;
  endpoints?: string;
  // send_email properties
  subject?: string;
  body?: string;
  to?: string;
  // search_packages properties
  query?: string;
  registry?: string;
  limit?: number;
  // read_document properties
  file_path?: string;
  max_chars?: number;
  // ai_inference properties
  system?: string;
  provider?: string;
  temperature?: number;
  max_tokens?: number;
  // image_process properties
  input_path?: string;
  output_format?: string;
  quality?: number;
  // docker_compose properties
  services?: string;
  compose_yaml?: string;
  follow?: boolean;
  // env_manager properties
  key?: string;
  env_file?: string;
  required_vars?: string;
  // bundle_analyze properties
  build_dir?: string;
  detail?: boolean;
  // diff_patch properties
  file_a?: string;
  file_b?: string;
  patch_content?: string;
  // monitor_logs properties
  source?: string;
  duration?: number;
  filter?: string;
  // i18n_setup properties
  locales?: string;
  // seo_meta properties
  site_url?: string;
  pages?: string;
  // security_scan properties
  scope?: string;
  fix?: boolean;
  // provision_n8n_workflow properties
  template_type?: string;
  params?: string;
  // web_search properties
  num_results?: number;
  // brand_save/load properties
  company?: string;
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  background_color?: string;
  text_color?: string;
  font_heading?: string;
  font_body?: string;
  logo_url?: string;
  tagline?: string;
  industry?: string;
  website?: string;
  // scaffold_project properties
  stack?: string;
  features?: string;
  // env_manager extended properties
  file?: string;
  vars?: string;
  // pwa_setup properties
  app_name?: string;
  short_name?: string;
  cache_strategy?: string;
  // color_palette properties
  seed_color?: string;
  count?: number;
  image_path?: string;
  // font_pair properties
  brand_name?: string;
  // responsive_test properties
  route?: string;
  wait_ms?: number;
  // css_audit properties
  project_dir?: string;
  // figma_to_code properties
  figma_url?: string;
  component_description?: string;
  // test_generate properties
  test_framework?: string;
  coverage_target?: string;
  // code_refactor properties
  target?: string;
  new_name?: string;
  // type_generate properties
  data?: string;
  api_url?: string;
  type_name?: string;
  // supabase_rls properties
  table_name?: string;
  rules?: string;
  apply?: boolean;
  schema_name?: string;
  // supabase_types properties
  project_id?: string;
  // supabase_edge_fn properties
  function_name?: string;
  template?: string;
  // supabase_storage properties
  bucket?: string;
  remote_path?: string;
  public?: boolean;
  // deerflow_research properties
  save_path?: string;
  // data_viz properties
  chart_type?: string;
  x_label?: string;
  y_label?: string;
  colors?: string;
  custom_code?: string;
  // image_generate / video_generate properties
  negative_prompt?: string;
  seed?: number;
  source_image?: string;
  duration_seconds?: number;
  fps?: number;
  // tts_speak properties
  text?: string;
  voice_ref?: string;
  // upscale_image properties
  scale?: number;
  // container_manage properties
  container_type?: string;
  // preview_app / deploy_local properties
  build_first?: boolean;
  build_command?: string;
  serve_port?: number;
  // template_seed properties
  supabase?: boolean;
  // git_github properties
  branch?: string;
  base?: string;
  // cloud_storage properties
  local_path?: string;
  // email properties
  attachments?: string;
  folder?: string;
  smtp_host?: string;
  smtp_port?: number;
  smtp_user?: string;
  smtp_pass?: string;
  // web_app_bridge properties
  service?: string;
  wait_seconds?: number;
  // rag_knowledge properties
  collection?: string;
  top_k?: number;
  // python_exec properties
  script?: string;
  timeout_seconds?: number;
  // database properties
  db_name?: string;
  table?: string;
  // visual_diff properties
  image_a?: string;
  image_b?: string;
  output?: string;
  threshold?: number;
  // self_correct properties
  max_rounds?: number;
  // mcp_connect properties
  server_url?: string;
  tool_name?: string;
  tool_params?: string;
  // figma_to_react properties
  file_url?: string;
  node_ids?: string;
  // i18n_setup properties
  languages?: string;
  // storybook_generate properties
  components_dir?: string;
  // api_mock properties
  schema?: string;
}

// ── Handler Types ───────────────────────────────────────────────

/** A single tool handler function (ctx is closed over by the factory) */
export type ToolHandler = (input: ToolInput) => Promise<string>;

/** A single tool summary formatter */
export type ToolSummaryFn = (input: ToolInput) => string;

/** A module's exported handler map */
export type ToolHandlerMap = Record<string, ToolHandler>;

/** A module's exported summary map */
export type ToolSummaryMap = Record<string, ToolSummaryFn>;
