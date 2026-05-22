import {
    installLaunchAgent,
    isLaunchAgentLoaded,
    readLaunchAgentProgramArguments,
    readLaunchAgentRuntime,
    restartLaunchAgent,
    stopLaunchAgent,
    uninstallLaunchAgent
} from "./launchd.js";
import {
    installScheduledTask,
    isScheduledTaskInstalled,
    readScheduledTaskCommand,
    readScheduledTaskRuntime,
    restartScheduledTask,
    stopScheduledTask,
    uninstallScheduledTask
} from "./schtasks.js";
import type { GatewayServiceRuntime } from "./service-runtime.js";
import {
    installSystemdService,
    isSystemdServiceEnabled,
    readSystemdServiceExecStart,
    readSystemdServiceRuntime,
    restartSystemdService,
    stopSystemdService,
    uninstallSystemdService
} from "./systemd.js";

export type GatewayServiceInstallArgs = {
  env: Record<string, string | undefined>;
  stdout: NodeJS.WritableStream;
  programArguments: string[];
  workingDirectory?: string;
  environment?: Record<string, string | undefined>;
  description?: string;
};

export type GatewayService = {
  label: string;
  loadedText: string;
  notLoadedText: string;
  install: (args: GatewayServiceInstallArgs) => Promise<void>;
  uninstall: (args: {
    env: Record<string, string | undefined>;
    stdout: NodeJS.WritableStream;
  }) => Promise<void>;
  stop: (args: {
    env?: Record<string, string | undefined>;
    stdout: NodeJS.WritableStream;
  }) => Promise<void>;
  restart: (args: {
    env?: Record<string, string | undefined>;
    stdout: NodeJS.WritableStream;
  }) => Promise<void>;
  isLoaded: (args: { env?: Record<string, string | undefined> }) => Promise<boolean>;
  readCommand: (env: Record<string, string | undefined>) => Promise<{
    programArguments: string[];
    workingDirectory?: string;
    environment?: Record<string, string>;
    sourcePath?: string;
  } | null>;
  readRuntime: (env: Record<string, string | undefined>) => Promise<GatewayServiceRuntime>;
};

export async function resolveGatewayService(): Promise<GatewayService> {
  if (process.platform === "darwin") {
    return {
      label: "LaunchAgent",
      loadedText: "loaded",
      notLoadedText: "not loaded",
      install: async (args) => {
        await installLaunchAgent(args);
      },
      uninstall: async (args) => {
        await uninstallLaunchAgent(args);
      },
      stop: async (args) => {
        await stopLaunchAgent({
          stdout: args.stdout,
          env: args.env,
        });
      },
      restart: async (args) => {
        await restartLaunchAgent({
          stdout: args.stdout,
          env: args.env,
        });
      },
      isLoaded: async (args) => isLaunchAgentLoaded(args),
      readCommand: readLaunchAgentProgramArguments,
      readRuntime: readLaunchAgentRuntime,
    };
  }

  if (process.platform === "linux") {
    return {
      label: "systemd",
      loadedText: "enabled",
      notLoadedText: "disabled",
      install: async (args) => {
        await installSystemdService(args);
      },
      uninstall: async (args) => {
        await uninstallSystemdService(args);
      },
      stop: async (args) => {
        await stopSystemdService({
          stdout: args.stdout,
          env: args.env,
        });
      },
      restart: async (args) => {
        await restartSystemdService({
          stdout: args.stdout,
          env: args.env,
        });
      },
      isLoaded: async (args) => isSystemdServiceEnabled(args),
      readCommand: readSystemdServiceExecStart,
      readRuntime: async (env) => await readSystemdServiceRuntime(env),
    };
  }

  if (process.platform === "win32") {
    // Try Windows Service first (preferred for production)
    const useWindowsService = process.env.OPENCLAW_USE_WINDOWS_SERVICE !== "false";

    if (useWindowsService) {
      try {
        // Check if sc.exe is available (it should be on all Windows versions)
        const { execFile } = await import("node:child_process");
        const { promisify } = await import("node:util");
        const execFileAsync = promisify(execFile);

        await execFileAsync("sc.exe", ["query", "type=", "service"], { timeout: 2000 });

        // sc.exe is available, use Windows Service
        const {
          installWindowsService,
          uninstallWindowsService,
          stopWindowsService,
          restartWindowsService,
          isWindowsServiceInstalled,
          readWindowsServiceCommand,
          readWindowsServiceRuntime,
        } = await import("./windows-service.js");

        return {
          label: "Windows Service",
          loadedText: "installed",
          notLoadedText: "not installed",
          install: async (args) => {
            await installWindowsService(args);
          },
          uninstall: async (args) => {
            await uninstallWindowsService(args);
          },
          stop: async (args) => {
            await stopWindowsService({
              stdout: args.stdout,
              env: args.env,
            });
          },
          restart: async (args) => {
            await restartWindowsService({
              stdout: args.stdout,
              env: args.env,
            });
          },
          isLoaded: async (args) => isWindowsServiceInstalled(args),
          readCommand: readWindowsServiceCommand,
          readRuntime: async (env) => await readWindowsServiceRuntime(env),
        };
      } catch {
        // Windows Service not available, fall back to Scheduled Task
        console.warn("[openclaw] Windows Service not available, using Scheduled Task fallback");
      }
    }

    // Fallback: Scheduled Task (for compatibility)
    return {
      label: "Scheduled Task",
      loadedText: "registered",
      notLoadedText: "missing",
      install: async (args) => {
        await installScheduledTask(args);
      },
      uninstall: async (args) => {
        await uninstallScheduledTask(args);
      },
      stop: async (args) => {
        await stopScheduledTask({
          stdout: args.stdout,
          env: args.env,
        });
      },
      restart: async (args) => {
        await restartScheduledTask({
          stdout: args.stdout,
          env: args.env,
        });
      },
      isLoaded: async (args) => isScheduledTaskInstalled(args),
      readCommand: readScheduledTaskCommand,
      readRuntime: async (env) => await readScheduledTaskRuntime(env),
    };
  }

  throw new Error(`Gateway service install not supported on ${process.platform}`);
}
