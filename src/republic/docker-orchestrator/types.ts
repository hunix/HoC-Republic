/**
 * Docker Orchestrator — Types & Interfaces
 */

export interface ContainerConfig {
  /** Unique name for the container */
  name: string;
  image: string;
  /** Port mappings: "host:container" */
  ports?: string[];
  /** Volume mounts: "host:container" */
  volumes?: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** CPU core limit (e.g. "2.0" for 2 cores) */
  cpuLimit?: string;
  /** Memory limit (e.g. "4g" for 4 GB) */
  memoryLimit?: string;
  /** Restart policy: "no" | "on-failure" | "always" | "unless-stopped" */
  restartPolicy?: string;
  /** Network to connect to */
  network?: string;
  /** Override entrypoint command */
  command?: string[];
  /** Labels for tracking */
  labels?: Record<string, string>;
  /** Run in detached mode (default: true) */
  detached?: boolean;
  /** Who requested this container */
  requestedBy?: string;
  /** GPU allocation: "all" for all GPUs, or "device=0,1" for specific devices */
  gpus?: string;
  /** Optional remote Docker daemon URL (e.g., tcp://100.x.y.z:2375). Bypasses local resource budget. */
  dockerHostUrl?: string;
  /** Network mode: "host" gives full LAN access, "bridge" is isolated (default) */
  networkMode?: "host" | "bridge";
  /** Run in privileged mode (needed for USB/Bluetooth/raw sockets) */
  privileged?: boolean;
  /** Device passthrough: ["/dev/bus/usb", "/dev/ttyACM0"] etc. */
  devices?: string[];
  /** Linux capabilities to add: ["NET_RAW", "NET_ADMIN"] etc. */
  capAdd?: string[];
}

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: "created" | "running" | "paused" | "exited" | "dead" | "unknown";
  ports: string[];
  createdAt: string;
  startedAt?: string;
  cpuLimit?: string;
  memoryLimit?: string;
  network?: string;
  labels: Record<string, string>;
  /** Managed by us */
  managed: boolean;
  requestedBy?: string;
}

export interface ImageInfo {
  id: string;
  repository: string;
  tag: string;
  sizeGB: number;
  createdAt: string;
}

export interface DockerNetwork {
  id: string;
  name: string;
  driver: string;
  scope: string;
}

export interface ResourceBudget {
  /** Max total CPU cores across all managed containers */
  maxCpuCores: number;
  /** Max total memory in GB across all managed containers */
  maxMemoryGB: number;
  /** Max number of managed containers */
  maxContainers: number;
  /** Current allocated CPU cores */
  allocatedCpuCores: number;
  /** Current allocated memory in GB */
  allocatedMemoryGB: number;
  /** Current number of managed containers */
  activeContainers: number;
}

export interface PullProgress {
  pullId: string;
  image: string;
  status: "pulling" | "complete" | "failed";
  /** Overall progress 0–100 */
  percent: number;
  /** Current layer being pulled */
  currentLayer?: string;
  /** Human-readable status line */
  detail?: string;
  /** Bytes downloaded so far */
  downloadedBytes?: number;
  /** Total bytes to download */
  totalBytes?: number;
  /** Elapsed milliseconds */
  elapsedMs: number;
}

/** Structured result from container creation and preset launch */
export interface ContainerLaunchResult {
  container: ContainerInfo | null;
  error?: string;
}
