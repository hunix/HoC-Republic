/**
 * Republic Platform — Browser Automation Agent
 *
 * High-level browser automation for citizen-driven real-world actions.
 * Wraps the companion-bridge to provide:
 *   - Tab registry (user declares which tabs are available & logged-in)
 *   - Multi-step browser task execution with error recovery
 *   - Screen reading via capture + OCR/text extraction
 *   - Form filling, navigation, and page interaction
 *
 * All browser tasks go through the tool-executor for permission checks:
 *   - Tier 2 (auto-approved): reading pages, searching, copying data
 *   - Tier 3 (approval required): financial actions, key generation
 */

import { getCompanionBridge, isCompanionAvailable } from "../infra/companion-bridge.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { citizenScrapeUrl } from "./citizen-n8n.js";
import { getQueueLength, withScreenAccess } from "./screen-queue.js";
import type { RepublicState } from "./types.js";
import { ts, uid } from "./utils.js";
import { verifyTaskCompletion } from "./vision-analyzer.js";

const logger = createSubsystemLogger("republic:browser-agent");

// ─── Types ──────────────────────────────────────────────────────

export type TabCategory =
  | "aws"
  | "binance"
  | "paypal"
  | "gmail"
  | "github"
  | "upwork"
  | "fiverr"
  | "vercel"
  | "general";

export type BrowserTaskStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "awaiting_approval";

export type TaskStepType =
  | "navigate"
  | "click"
  | "type"
  | "read"
  | "screenshot"
  | "scroll"
  | "wait"
  | "key_combo"
  | "find_element"
  | "extract_text";

export interface RegisteredTab {
  id: string;
  category: TabCategory;
  label: string;
  urlPattern: string;
  loggedIn: boolean;
  lastVerified: string | null;
  inUse: boolean;
  usedBy: string | null; // citizenId
}

export interface TaskStep {
  type: TaskStepType;
  description: string;
  params: Record<string, unknown>;
  status: "pending" | "running" | "done" | "failed";
  result?: unknown;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface BrowserTask {
  id: string;
  citizenId: string;
  citizenName: string;
  objective: string;
  category: TabCategory;
  tier: 2 | 3;
  steps: TaskStep[];
  currentStep: number;
  status: BrowserTaskStatus;
  result?: unknown;
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  retryCount: number;
  maxRetries: number;
}

export interface BrowserAgentDiagnostics {
  available: boolean;
  registeredTabs: number;
  activeTabs: number;
  queuedTasks: number;
  runningTasks: number;
  completedTasks: number;
  failedTasks: number;
  totalTasks: number;
}

// ─── State ──────────────────────────────────────────────────────

const registeredTabs = new Map<string, RegisteredTab>();
const taskQueue: BrowserTask[] = [];
const taskHistory: BrowserTask[] = [];
const MAX_TASK_HISTORY = 200;
const MAX_CONCURRENT_TASKS = 2;
const STEP_TIMEOUT_MS = 15_000;

let initialized = false;

// ─── Tab Registry ───────────────────────────────────────────────

/**
 * Register a browser tab that the user has open and logged into.
 * Citizens can request access to these tabs for real-world actions.
 */
export function registerTab(
  category: TabCategory,
  label: string,
  urlPattern: string,
  loggedIn = true,
): RegisteredTab {
  const tab: RegisteredTab = {
    id: uid(),
    category,
    label,
    urlPattern,
    loggedIn,
    lastVerified: loggedIn ? ts() : null,
    inUse: false,
    usedBy: null,
  };

  registeredTabs.set(tab.id, tab);
  logger.info(`Tab registered: ${label} [${category}]`, { urlPattern });
  return tab;
}

/**
 * Register default tabs on initialization.
 */
function initDefaultTabs(): void {
  if (initialized) {return;}
  initialized = true;

  const defaults: Array<{ category: TabCategory; label: string; urlPattern: string }> = [
    { category: "aws", label: "AWS Console", urlPattern: "console.aws.amazon.com" },
    { category: "binance", label: "Binance", urlPattern: "binance.com" },
    { category: "paypal", label: "PayPal", urlPattern: "paypal.com" },
    { category: "gmail", label: "Gmail", urlPattern: "mail.google.com" },
    { category: "github", label: "GitHub", urlPattern: "github.com" },
    { category: "upwork", label: "Upwork", urlPattern: "upwork.com" },
    { category: "fiverr", label: "Fiverr", urlPattern: "fiverr.com" },
    { category: "vercel", label: "Vercel", urlPattern: "vercel.com" },
  ];

  for (const { category, label, urlPattern } of defaults) {
    registerTab(category, label, urlPattern, false); // Not verified yet
  }

  logger.info("Browser agent initialized with default tab registry");
}

/**
 * Get a tab by category. Returns the first available (not in use) tab.
 */
export function getAvailableTab(category: TabCategory): RegisteredTab | null {
  initDefaultTabs();
  for (const tab of registeredTabs.values()) {
    if (tab.category === category && !tab.inUse) {
      return tab;
    }
  }
  return null;
}

/**
 * Acquire exclusive access to a tab for a citizen.
 */
export function acquireTab(tabId: string, citizenId: string): boolean {
  const tab = registeredTabs.get(tabId);
  if (!tab || tab.inUse) {return false;}

  tab.inUse = true;
  tab.usedBy = citizenId;
  return true;
}

/**
 * Release a tab back to the pool.
 */
export function releaseTab(tabId: string): void {
  const tab = registeredTabs.get(tabId);
  if (tab) {
    tab.inUse = false;
    tab.usedBy = null;
  }
}

/**
 * Mark a tab as logged-in after verification.
 */
export function verifyTabLogin(tabId: string): void {
  const tab = registeredTabs.get(tabId);
  if (tab) {
    tab.loggedIn = true;
    tab.lastVerified = ts();
  }
}

/**
 * Get all registered tabs.
 */
export function getRegisteredTabs(): RegisteredTab[] {
  initDefaultTabs();
  return Array.from(registeredTabs.values());
}

// ─── Task Creation ──────────────────────────────────────────────

/**
 * Create a browser task for a citizen.
 *
 * Tasks are multi-step sequences of browser actions that citizens
 * execute to accomplish real-world objectives (browsing, form filling,
 * data extraction, etc.)
 */
export function createBrowserTask(
  citizenId: string,
  citizenName: string,
  objective: string,
  category: TabCategory,
  steps: Array<Omit<TaskStep, "status">>,
  tier: 2 | 3 = 2,
): BrowserTask {
  const task: BrowserTask = {
    id: uid(),
    citizenId,
    citizenName,
    objective,
    category,
    tier,
    steps: steps.map((s) => ({ ...s, status: "pending" as const })),
    currentStep: 0,
    status: tier === 3 ? "awaiting_approval" : "queued",
    createdAt: ts(),
    retryCount: 0,
    maxRetries: 2,
  };

  taskQueue.push(task);

  logger.info(`Browser task created: ${objective}`, {
    citizenId,
    category,
    tier,
    steps: steps.length,
  });

  return task;
}

// ─── Task Building Helpers ──────────────────────────────────────

/** Create a 'navigate to URL' step */
export function stepNavigate(url: string, description?: string): Omit<TaskStep, "status"> {
  return {
    type: "navigate",
    description: description ?? `Navigate to ${url}`,
    params: { url },
  };
}

/** Create a 'click element' step */
export function stepClick(selector: string, description?: string): Omit<TaskStep, "status"> {
  return {
    type: "click",
    description: description ?? `Click ${selector}`,
    params: { selector },
  };
}

/** Create a 'type text' step */
export function stepType(text: string, description?: string): Omit<TaskStep, "status"> {
  return {
    type: "type",
    description: description ?? `Type "${text.slice(0, 30)}..."`,
    params: { text },
  };
}

/** Create a 'screenshot' step */
export function stepScreenshot(description?: string): Omit<TaskStep, "status"> {
  return {
    type: "screenshot",
    description: description ?? "Capture screenshot",
    params: {},
  };
}

/** Create a 'scroll' step */
export function stepScroll(delta: number, description?: string): Omit<TaskStep, "status"> {
  return {
    type: "scroll",
    description: description ?? `Scroll ${delta > 0 ? "down" : "up"}`,
    params: { delta },
  };
}

/** Create a 'wait' step (milliseconds) */
export function stepWait(ms: number, description?: string): Omit<TaskStep, "status"> {
  return {
    type: "wait",
    description: description ?? `Wait ${ms}ms`,
    params: { ms },
  };
}

/** Create a 'key combo' step */
export function stepKeyCombo(keys: string[], description?: string): Omit<TaskStep, "status"> {
  return {
    type: "key_combo",
    description: description ?? `Press ${keys.join("+")}`,
    params: { keys },
  };
}

/** Create a 'find element' step */
export function stepFindElement(selector: string, description?: string): Omit<TaskStep, "status"> {
  return {
    type: "find_element",
    description: description ?? `Find element ${selector}`,
    params: { selector },
  };
}

/** Create a 'read/extract text' step */
export function stepExtractText(selector: string, description?: string): Omit<TaskStep, "status"> {
  return {
    type: "extract_text",
    description: description ?? `Extract text from ${selector}`,
    params: { selector },
  };
}

// ─── Task Execution ─────────────────────────────────────────────

/**
 * Execute a single task step using the companion bridge.
 */
async function executeStep(step: TaskStep): Promise<void> {
  const bridge = getCompanionBridge();

  step.status = "running";
  step.startedAt = ts();

  try {
    switch (step.type) {
      case "navigate": {
        const url = step.params.url as string;
        // Open URL via companion: start default browser with URL
        await bridge.executeCommand("cmd", ["/c", "start", url]);
        // Wait for page to load
        await new Promise((r) => setTimeout(r, 3000));
        step.result = { navigated: url };
        break;
      }

      case "click": {
        const selector = step.params.selector as string;
        const found = await bridge.findUIElement(selector);
        if (found.found && found.bounds) {
          const cx = found.bounds.x + found.bounds.width / 2;
          const cy = found.bounds.y + found.bounds.height / 2;
          await bridge.moveMouse(cx, cy);
          await new Promise((r) => setTimeout(r, 200));
          await bridge.clickMouse("left");
          step.result = { clicked: selector, at: { x: cx, y: cy } };
        } else {
          throw new Error(`Element not found: ${selector}`);
        }
        break;
      }

      case "type": {
        const text = step.params.text as string;
        await bridge.typeText(text);
        step.result = { typed: text.length };
        break;
      }

      case "screenshot": {
        const buffer = await bridge.captureScreen();
        step.result = { captured: true, size: buffer.length };
        break;
      }

      case "scroll": {
        const delta = step.params.delta as number;
        await bridge.scrollMouse(delta);
        step.result = { scrolled: delta };
        break;
      }

      case "wait": {
        const ms = step.params.ms as number;
        await new Promise((r) => setTimeout(r, Math.min(ms, STEP_TIMEOUT_MS)));
        step.result = { waited: ms };
        break;
      }

      case "key_combo": {
        const keys = step.params.keys as string[];
        await bridge.keyCombo(keys);
        step.result = { pressed: keys };
        break;
      }

      case "find_element": {
        const selector = step.params.selector as string;
        const found = await bridge.findUIElement(selector);
        step.result = found;
        if (!found.found) {
          throw new Error(`Element not found: ${selector}`);
        }
        break;
      }

      case "extract_text": {
        const selector = step.params.selector as string;
        const text = await bridge.readUIElement(selector);
        step.result = { text };
        break;
      }

      case "read": {
        // Read entire page content — capture screen and store
        const buf = await bridge.captureScreen();
        step.result = { captured: true, size: buf.length };
        break;
      }

      default:
        throw new Error(`Unknown step type: ${String(step.type)}`);
    }

    step.status = "done";
    step.completedAt = ts();
  } catch (err) {
    step.status = "failed";
    step.error = err instanceof Error ? err.message : String(err);
    step.completedAt = ts();
    throw err;
  }
}

/**
 * Execute a complete browser task — runs all steps sequentially.
 */
async function executeTask(task: BrowserTask): Promise<void> {
  task.status = "running";
  task.startedAt = ts();

  logger.info(`Executing browser task: ${task.objective}`, {
    taskId: task.id,
    citizenId: task.citizenId,
    steps: task.steps.length,
  });

  for (let i = task.currentStep; i < task.steps.length; i++) {
    task.currentStep = i;
    const step = task.steps[i];

    try {
      await executeStep(step);
      logger.debug(`Step ${i + 1}/${task.steps.length} done: ${step.description}`);
    } catch (err) {
      logger.warn(`Step ${i + 1}/${task.steps.length} failed: ${step.description}`, {
        error: err instanceof Error ? err.message : String(err),
      });

      // Retry logic
      if (task.retryCount < task.maxRetries) {
        task.retryCount++;
        logger.info(`Retrying step ${i + 1} (attempt ${task.retryCount + 1})`);
        // Wait before retry
        await new Promise((r) => setTimeout(r, 2000));
        try {
          step.status = "pending";
          await executeStep(step);
          continue;
        } catch {
          // Retry also failed
        }
      }

      task.status = "failed";
      task.error = `Step ${i + 1} failed: ${step.error}`;
      task.completedAt = ts();
      return;
    }
  }

  task.status = "completed";
  task.completedAt = ts();

  // Collect step results as the task result
  task.result = task.steps.map((s) => ({
    type: s.type,
    description: s.description,
    result: s.result,
  }));

  logger.info(`Browser task completed: ${task.objective}`, { taskId: task.id });
}

// ─── Approval ───────────────────────────────────────────────────

/**
 * Approve a tier-3 task that is awaiting approval.
 */
export function approveTask(taskId: string): boolean {
  const task = taskQueue.find((t) => t.id === taskId);
  if (!task || task.status !== "awaiting_approval") {return false;}

  task.status = "queued";
  logger.info(`Task approved: ${task.objective}`, { taskId });
  return true;
}

/**
 * Reject a tier-3 task.
 */
export function rejectTask(taskId: string, reason: string): boolean {
  const task = taskQueue.find((t) => t.id === taskId);
  if (!task || task.status !== "awaiting_approval") {return false;}

  task.status = "cancelled";
  task.error = `Rejected: ${reason}`;
  task.completedAt = ts();
  moveToHistory(task);
  logger.info(`Task rejected: ${task.objective}`, { taskId, reason });
  return true;
}

// ─── Task Queue Processing ──────────────────────────────────────

function moveToHistory(task: BrowserTask): void {
  const idx = taskQueue.indexOf(task);
  if (idx !== -1) {taskQueue.splice(idx, 1);}
  taskHistory.push(task);
  if (taskHistory.length > MAX_TASK_HISTORY) {
    taskHistory.splice(0, taskHistory.length - MAX_TASK_HISTORY);
  }
}

/**
 * Process the task queue — called from the tick loop.
 * Runs queued tasks up to the concurrency limit.
 * Now integrates with screen-queue for fair access.
 */
async function processTaskQueue(): Promise<void> {
  const running = taskQueue.filter((t) => t.status === "running").length;
  if (running >= MAX_CONCURRENT_TASKS) {return;}

  const available = MAX_CONCURRENT_TASKS - running;
  const queued = taskQueue.filter((t) => t.status === "queued");

  for (let i = 0; i < Math.min(available, queued.length); i++) {
    const task = queued[i];

    // Check if a tab is available for this task
    const tab = getAvailableTab(task.category);
    if (!tab) {
      // Fallback: if this is a simple web read and screen queue is full,
      // use n8n headless scraping instead
      if (task.steps.length <= 3 && getQueueLength() > 3) {
        const navStep = task.steps.find((s) => s.type === "navigate");
        if (navStep?.params.url) {
          logger.info(`Falling back to n8n scraping for: ${task.objective}`);
          citizenScrapeUrl(
            task.citizenId,
            task.citizenName,
            navStep.params.url as string,
          ).then((result) => {
            task.status = result.success ? "completed" : "failed";
            task.result = result.data;
            task.completedAt = ts();
            moveToHistory(task);
          }).catch(() => { /* swallow */ });
          continue;
        }
      }

      logger.debug(`No available tab for category: ${task.category}`);
      continue;
    }

    // Acquire the tab
    acquireTab(tab.id, task.citizenId);

    // Execute within screen queue for fair access
    withScreenAccess(
      task.citizenId,
      task.citizenName,
      "browser_task",
      task.objective,
      async () => {
        await executeTask(task);
        // Optional: verify task completion via vision model
        if (task.status === "completed" && task.steps.length > 1) {
          const verification = await verifyTaskCompletion(task.objective);
          if (verification.verified) {
            logger.info(`Task verified via vision: ${task.objective}`);
          }
        }
      },
      task.tier === 3 ? "high" : "normal",
    )
      .catch((err) => {
        logger.error(`Task execution error: ${task.objective}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      })
      .finally(() => {
        releaseTab(tab.id);
        moveToHistory(task);
      });
  }
}

// ─── Pre-built Task Templates ───────────────────────────────────

/**
 * Create a task to read and extract content from a web page.
 */
export function createWebReadTask(
  citizenId: string,
  citizenName: string,
  url: string,
  objective: string,
): BrowserTask {
  return createBrowserTask(citizenId, citizenName, objective, "general", [
    stepNavigate(url, `Open ${url}`),
    stepWait(3000, "Wait for page load"),
    stepScreenshot("Capture page content"),
  ]);
}

/**
 * Create a task to search Google and read results.
 */
export function createSearchTask(
  citizenId: string,
  citizenName: string,
  query: string,
): BrowserTask {
  return createBrowserTask(
    citizenId,
    citizenName,
    `Search: ${query}`,
    "general",
    [
      stepNavigate(`https://www.google.com/search?q=${encodeURIComponent(query)}`, `Search Google for "${query}"`),
      stepWait(2000, "Wait for results"),
      stepScreenshot("Capture search results"),
      stepScroll(500, "Scroll to see more results"),
      stepScreenshot("Capture more results"),
    ],
  );
}

/**
 * Create a task to browse a freelance platform for gigs.
 */
export function createFreelanceScanTask(
  citizenId: string,
  citizenName: string,
  platform: "upwork" | "fiverr",
  skills: string[],
): BrowserTask {
  const urls: Record<string, string> = {
    upwork: `https://www.upwork.com/nx/find-work/best-matches`,
    fiverr: `https://www.fiverr.com/search/gigs?query=${encodeURIComponent(skills.join(" "))}`,
  };

  return createBrowserTask(
    citizenId,
    citizenName,
    `Scan ${platform} for gigs matching: ${skills.join(", ")}`,
    platform,
    [
      stepNavigate(urls[platform], `Open ${platform}`),
      stepWait(3000, "Wait for page load"),
      stepScreenshot("Capture listings"),
      stepScroll(800, "Scroll for more listings"),
      stepScreenshot("Capture more listings"),
    ],
  );
}

/**
 * Create a task to check Binance account (tier 3 — financial).
 */
export function createBinanceCheckTask(
  citizenId: string,
  citizenName: string,
): BrowserTask {
  return createBrowserTask(
    citizenId,
    citizenName,
    "Check Binance portfolio balance",
    "binance",
    [
      stepNavigate("https://www.binance.com/en/my/wallet/account/overview", "Open Binance wallet"),
      stepWait(3000, "Wait for page load"),
      stepScreenshot("Capture portfolio overview"),
    ],
    3, // Tier 3 — requires approval
  );
}

/**
 * Create a task to check AWS console (tier 3 — infrastructure).
 */
export function createAWSCheckTask(
  citizenId: string,
  citizenName: string,
  service: string,
): BrowserTask {
  const serviceUrls: Record<string, string> = {
    ec2: "https://console.aws.amazon.com/ec2/home",
    s3: "https://s3.console.aws.amazon.com/s3/home",
    lambda: "https://console.aws.amazon.com/lambda/home",
    amplify: "https://console.aws.amazon.com/amplify/home",
  };

  return createBrowserTask(
    citizenId,
    citizenName,
    `Check AWS ${service} console`,
    "aws",
    [
      stepNavigate(serviceUrls[service] ?? serviceUrls.ec2, `Open AWS ${service}`),
      stepWait(3000, "Wait for console load"),
      stepScreenshot(`Capture ${service} dashboard`),
    ],
    3, // Tier 3
  );
}

// ─── Browser Agent Tick ─────────────────────────────────────────

/**
 * Browser agent tick — processes task queue each tick.
 * Called from the main simulation loop.
 */
export function browserAgentTick(s: RepublicState): void {
  const t = s.currentTick;

  // Only process every 5 ticks to avoid overwhelming the system
  if (t % 5 !== 0) {return;}

  initDefaultTabs();

  // Check companion availability periodically
  if (t % 100 === 0) {
    isCompanionAvailable().then((available) => {
      if (!available) {
        logger.debug("Companion service not available — browser tasks paused");
      }
    }).catch(() => { /* ignore */ });
  }

  // Process task queue
  processTaskQueue().catch((err) => {
    logger.warn("Task queue processing error", {
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

// ─── Query Functions ────────────────────────────────────────────

export function getQueuedTasks(): BrowserTask[] {
  return taskQueue.filter((t) => t.status === "queued" || t.status === "awaiting_approval");
}

export function getRunningTasks(): BrowserTask[] {
  return taskQueue.filter((t) => t.status === "running");
}

export function getTaskHistory(limit = 50): BrowserTask[] {
  return taskHistory.slice(-limit);
}

export function getTask(taskId: string): BrowserTask | undefined {
  return taskQueue.find((t) => t.id === taskId) ?? taskHistory.find((t) => t.id === taskId);
}

export function getPendingApprovals(): BrowserTask[] {
  return taskQueue.filter((t) => t.status === "awaiting_approval");
}

// ─── Diagnostics ────────────────────────────────────────────────

export function getBrowserAgentDiagnostics(): BrowserAgentDiagnostics {
  initDefaultTabs();

  return {
    available: true, // Will be updated by tick
    registeredTabs: registeredTabs.size,
    activeTabs: Array.from(registeredTabs.values()).filter((t) => t.inUse).length,
    queuedTasks: taskQueue.filter((t) => t.status === "queued").length,
    runningTasks: taskQueue.filter((t) => t.status === "running").length,
    completedTasks: taskHistory.filter((t) => t.status === "completed").length,
    failedTasks: taskHistory.filter((t) => t.status === "failed").length,
    totalTasks: taskQueue.length + taskHistory.length,
  };
}
