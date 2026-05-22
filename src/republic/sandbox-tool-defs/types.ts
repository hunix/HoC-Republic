/**
 * Sandbox Tool Definitions — Types
 */

export interface ToolInput {
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
  // output_path already declared above
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
  // title already declared above
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
  // upscale_image properties (image_path already declared above)
  scale?: number;
  // container_manage properties
  container_type?: string;
  // preview_app / deploy_local properties
  build_first?: boolean;
  build_command?: string;
  serve_port?: number;
  // template_seed properties
  supabase?: boolean;
  // git_github properties (url, title already declared)
  branch?: string;
  base?: string;
  // cloud_storage properties (provider, remote_path already exist)
  local_path?: string;
  // email properties (to, subject, count already exist)
  attachments?: string;
  folder?: string;
  smtp_host?: string;
  smtp_port?: number;
  smtp_user?: string;
  smtp_pass?: string;
  // web_app_bridge properties (prompt, output_path, action, selector already exist)
  service?: string;
  wait_seconds?: number;
  // Phase 7 — rag_knowledge properties
  collection?: string;
  top_k?: number;
  // Phase 7 — python_exec properties
  script?: string;
  timeout_seconds?: number;
  // Phase 7 — database properties (sql, table, data already exist)
  db_name?: string;
  table?: string;
  // Phase 7 — visual_diff properties (output_path already exists)
  image_a?: string;
  image_b?: string;
  output?: string;
  threshold?: number;
  // Phase 7 — self_correct properties
  max_rounds?: number;
  // Phase 7 — mcp_connect properties
  server_url?: string;
  tool_name?: string;
  tool_params?: string;
  // Phase 7 — figma_to_react properties
  file_url?: string;
  node_ids?: string;
  // Phase 7 — i18n_setup properties
  languages?: string;
  // Phase 7 — storybook_generate properties
  components_dir?: string;
  // Phase 7 — api_mock properties (endpoints, port already exist)
  schema?: string;
  // P0 — http_request properties
  method?: string;
  headers?: string;
  content_type?: string;
  auth_type?: string;
  auth_token?: string;
  follow_redirects?: boolean;
  save_to?: string;
  // P0 — cron_schedule properties
  task_name?: string;
  schedule?: string;
  rpc_method?: string;
  rpc_params?: string;
  task_id?: string;
  // P0 — notification_send properties
  channel?: string;
  webhook_url?: string;
  chat_id?: string;
  priority?: string;
  image_url?: string;
  // P1 — spreadsheet properties (file_path, chart_type, output_format already declared)
  transform_ops?: string;
  x_col?: string;
  y_col?: string;
  sheet_name?: string;
  head?: number;
  // P1 — audio_process properties
  start_time?: string;
  effect?: string;
  effect_value?: string;
  bitrate?: string;
  sample_rate?: number;
  // P1 — secret_vault properties (key, scope, env_file already declared)
  keys?: string;
  // Phase 9 — intelligence & extended tools
  lang?: string;
  page_range?: string;
  pattern?: string;
  include?: string;
  exclude?: string;
  case_sensitive?: boolean;
  context_lines?: number;
  max_results?: number;
  replacement?: string;
  dry_run?: boolean;
  ref_a?: string;
  ref_b?: string;
  max_commits?: number;
  collection_name?: string;
  documents?: string;
  target_lang?: string;
  source_lang?: string;
  host?: string;
  user?: string;
  key_path?: string;
  password?: string;
  tunnel_local?: number;
  tunnel_remote?: number;
  domain?: string;
  record_type?: string;
  record_value?: string;
  record_name?: string;
  ttl?: number;
  zone_id?: string;
  record_id?: string;
  proxied?: boolean;
  api_token?: string;
  size?: number;
  ssid?: string;
  wifi_password?: string;
  wifi_security?: string;
  vcard_name?: string;
  vcard_phone?: string;
  vcard_email?: string;
  stop_on_error?: boolean;
  parallel?: boolean;
  event_id?: string;
  days_ahead?: number;
  duration_minutes?: number;
  end_time?: string;
  from?: string;
  token_url?: string;
  client_id?: string;
  client_secret?: string;
  scopes?: string;
  refresh_token?: string;
  auth_code?: string;
  redirect_uri?: string;
  device_code_url?: string;
  runtime?: string;
  input?: string;
  gpu?: boolean;
  theme?: string;
  environment?: string;
  template_file?: string;
}
