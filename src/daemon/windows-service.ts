/**
 * Windows Service implementation for OpenClaw
 * Replaces the Scheduled Task approach with a proper Windows Service
 * running as NT AUTHORITY\SYSTEM for maximum privileges and reliability
 */

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { ErrorCategory, ErrorSeverity, handleError } from "../infra/error-handler.js";
import { colorize, isRich, theme } from "../terminal/theme.js";
import { formatGatewayServiceDescription, resolveGatewayWindowsServiceName } from "./constants.js";
import { resolveGatewayStateDir } from "./paths.js";
import type { GatewayServiceRuntime } from "./service-runtime.js";

const execFileAsync = promisify(execFile);

const formatLine = (label: string, value: string) => {
  const rich = isRich();
  return `${colorize(rich, theme.muted, `${label}:`)} ${colorize(rich, theme.command, value)}`;
};

function resolveServiceName(env: Record<string, string | undefined>): string {
  const override = env.OPENCLAW_WINDOWS_SERVICE_NAME?.trim();
  if (override) {
    return override;
  }
  return resolveGatewayWindowsServiceName(env.OPENCLAW_PROFILE);
}

export function resolveServiceExecutablePath(env: Record<string, string | undefined>): string {
  const override = env.OPENCLAW_SERVICE_EXECUTABLE?.trim();
  if (override) {
    return override;
  }
  const stateDir = resolveGatewayStateDir(env);
  return path.join(stateDir, "openclaw-service.exe");
}

function quoteCmdArg(value: string): string {
  if (!/[ \t"]/g.test(value)) {
    return value;
  }
  return `"${value.replace(/"/g, '\\"')}"`;
}

async function execScExe(
  args: string[],
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFileAsync("sc.exe", args, {
      encoding: "utf8",
      windowsHide: true,
    });
    return {
      stdout: String(stdout ?? ""),
      stderr: String(stderr ?? ""),
      code: 0,
    };
  } catch (error) {
    const e = error as {
      stdout?: unknown;
      stderr?: unknown;
      code?: unknown;
      message?: unknown;
    };
    return {
      stdout: typeof e.stdout === "string" ? e.stdout : "",
      stderr:
        typeof e.stderr === "string" ? e.stderr : typeof e.message === "string" ? e.message : "",
      code: typeof e.code === "number" ? e.code : 1,
    };
  }
}

async function assertScExeAvailable(): Promise<void> {
  const res = await execScExe(["query", "type=", "service"]);
  if (res.code === 0) {
    return;
  }
  const detail = res.stderr || res.stdout;
  throw new Error(`sc.exe unavailable: ${detail || "unknown error"}`.trim());
}

/**
 * Install OpenClaw as a Windows Service
 * This provides much better reliability and privilege than Scheduled Tasks
 */
export async function installWindowsService({
  env,
  stdout,
  programArguments,
  workingDirectory,
  environment,
  description,
}: {
  env: Record<string, string | undefined>;
  stdout: NodeJS.WritableStream;
  programArguments: string[];
  workingDirectory?: string;
  environment?: Record<string, string | undefined>;
  description?: string;
}): Promise<{ serviceName: string; executablePath: string }> {
  try {
    await assertScExeAvailable();
  } catch (error) {
    handleError(error, {
      category: ErrorCategory.WINDOWS,
      component: "WindowsService",
      operation: "assertScExeAvailable",
      severity: ErrorSeverity.FATAL,
    });
    throw error;
  }

  const serviceName = resolveServiceName(env);
  const executablePath = resolveServiceExecutablePath(env);
  
  // Ensure the service executable directory exists
  await fs.mkdir(path.dirname(executablePath), { recursive: true });

  const serviceDescription =
    description ??
    formatGatewayServiceDescription({
      profile: env.OPENCLAW_PROFILE,
      version: environment?.OPENCLAW_SERVICE_VERSION ?? env.OPENCLAW_SERVICE_VERSION,
    });

  // Generate the service wrapper executable that implements the Windows SCM interface.
  // node.exe cannot be used directly as a Windows Service binary because it does not
  // call SetServiceStatus — SCM will time out with error 1053.
  let binPath: string;
  try {
    stdout.write("Compiling Windows Service wrapper...\n");
    await generateServiceWrapper({
      serviceName,
      programArguments,
      workingDirectory,
      environment,
      outputPath: executablePath,
    });
    binPath = quoteCmdArg(executablePath);
    stdout.write(`${formatLine("Compiled service wrapper", executablePath)}\n`);
  } catch (wrapperError) {
    // If the .NET SDK is not available, fall back to registering node.exe directly.
    // This will likely cause error 1053, but at least creates the service entry.
    stdout.write(
      `Warning: Could not compile service wrapper (${wrapperError instanceof Error ? wrapperError.message : String(wrapperError)}). ` +
      `Falling back to direct node.exe registration (may cause error 1053 on start).\n`,
    );
    binPath = buildServiceBinPath(programArguments, workingDirectory);
  }

  // Create the service with sc.exe
  const createArgs = [
    "create",
    serviceName,
    "binPath=",
    binPath,
    "start=",
    "auto",
    "DisplayName=",
    serviceName,
  ];

  const createResult = await execScExe(createArgs);
  if (createResult.code !== 0) {
    const detail = createResult.stderr || createResult.stdout;
    const hint = /access is denied|5/i.test(detail)
      ? " Run PowerShell or Command Prompt as Administrator."
      : "";
    throw new Error(`sc.exe create failed: ${detail}${hint}`.trim());
  }

  // Set the service description
  if (serviceDescription) {
    await execScExe(["description", serviceName, serviceDescription]);
  }

  // Configure the service to run as NT AUTHORITY\SYSTEM (default for services)
  // This provides maximum local privileges
  await execScExe(["config", serviceName, "obj=", "LocalSystem"]);

  // Configure failure actions to restart on failure
  await execScExe([
    "failure",
    serviceName,
    "reset=",
    "86400",
    "actions=",
    "restart/60000/restart/60000/restart/60000",
  ]);

  // Start the service
  const startResult = await execScExe(["start", serviceName]);
  if (startResult.code !== 0 && !startResult.stdout.includes("already running")) {
    stdout.write(`Warning: Service created but failed to start: ${startResult.stderr}\n`);
  }

  stdout.write("\n");
  stdout.write(`${formatLine("Installed Windows Service", serviceName)}\n`);
  stdout.write(`${formatLine("Service runs as", "NT AUTHORITY\\SYSTEM")}\n`);
  stdout.write(`${formatLine("Start type", "Automatic")}\n`);
  stdout.write(`${formatLine("Executable path", executablePath)}\n`);

  return { serviceName, executablePath };
}

/**
 * Uninstall the OpenClaw Windows Service
 */
export async function uninstallWindowsService({
  env,
  stdout,
}: {
  env: Record<string, string | undefined>;
  stdout: NodeJS.WritableStream;
}): Promise<void> {
  try {
    await assertScExeAvailable();
  } catch (error) {
    handleError(error, {
      category: ErrorCategory.WINDOWS,
      component: "WindowsService",
      operation: "assertScExeAvailable",
    });
    throw error;
  }

  const serviceName = resolveServiceName(env);

  // Stop the service first
  await execScExe(["stop", serviceName]);

  // Wait a moment for the service to stop
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Delete the service
  const deleteResult = await execScExe(["delete", serviceName]);
  if (deleteResult.code !== 0 && !deleteResult.stdout.includes("does not exist")) {
    throw new Error(`sc.exe delete failed: ${deleteResult.stderr || deleteResult.stdout}`.trim());
  }

  stdout.write(`${formatLine("Removed Windows Service", serviceName)}\n`);
}

/**
 * Stop the OpenClaw Windows Service
 */
export async function stopWindowsService({
  stdout,
  env,
}: {
  stdout: NodeJS.WritableStream;
  env?: Record<string, string | undefined>;
}): Promise<void> {
  try {
    await assertScExeAvailable();
  } catch (error) {
    handleError(error, {
      category: ErrorCategory.WINDOWS,
      component: "WindowsService",
      operation: "assertScExeAvailable",
    });
    throw error;
  }

  const serviceName = resolveServiceName(env ?? (process.env as Record<string, string | undefined>));
  const res = await execScExe(["stop", serviceName]);
  
  // sc.exe error 1062 = "The service has not been started" — treat as success
  const output = `${res.stdout} ${res.stderr}`.toLowerCase();
  const isAlreadyStopped = output.includes("1062") || output.includes("not started");
  if (res.code !== 0 && !isAlreadyStopped) {
    throw new Error(`sc.exe stop failed: ${res.stderr || res.stdout}`.trim());
  }
  
  stdout.write(`${formatLine("Stopped Windows Service", serviceName)}\n`);
}

/**
 * Restart the OpenClaw Windows Service.
 * Auto-repairs the service if it's registered with node.exe directly
 * (which doesn't implement SCM and causes error 1053).
 */
export async function restartWindowsService({
  stdout,
  env,
}: {
  stdout: NodeJS.WritableStream;
  env?: Record<string, string | undefined>;
}): Promise<void> {
  try {
    await assertScExeAvailable();
  } catch (error) {
    handleError(error, {
      category: ErrorCategory.WINDOWS,
      component: "WindowsService",
      operation: "assertScExeAvailable",
    });
    throw error;
  }

  const resolvedEnv = env ?? (process.env as Record<string, string | undefined>);
  const serviceName = resolveServiceName(resolvedEnv);

  // Check the current service binary path — if it points to node.exe directly,
  // the service will always fail with error 1053 because node.exe doesn't
  // implement the Windows SCM interface. Auto-repair by compiling the wrapper.
  await autoRepairServiceBinary({ serviceName, env: resolvedEnv, stdout });
  
  // Stop the service — ignore errors if the service wasn't running
  const stopRes = await execScExe(["stop", serviceName]);
  const stopOutput = `${stopRes.stdout} ${stopRes.stderr}`.toLowerCase();
  const isAlreadyStopped = stopOutput.includes("1062") || stopOutput.includes("not started");
  if (stopRes.code !== 0 && !isAlreadyStopped) {
    stdout.write(`Warning: service stop returned: ${stopRes.stderr || stopRes.stdout}\n`);
  }
  
  // Wait for service to stop
  await new Promise((resolve) => setTimeout(resolve, 2000));
  
  // Start the service
  const res = await execScExe(["start", serviceName]);
  if (res.code !== 0) {
    throw new Error(`sc.exe start failed: ${res.stderr || res.stdout}`.trim());
  }
  
  stdout.write(`${formatLine("Restarted Windows Service", serviceName)}\n`);
}

/**
 * Inspect the service's BINARY_PATH_NAME. If it points to node.exe directly
 * instead of the SCM wrapper .exe, recompile the wrapper and update the service.
 */
async function autoRepairServiceBinary({
  serviceName,
  env,
  stdout,
}: {
  serviceName: string;
  env: Record<string, string | undefined>;
  stdout: NodeJS.WritableStream;
}): Promise<void> {
  const qcRes = await execScExe(["qc", serviceName]);
  if (qcRes.code !== 0) {
    return; // Can't query config, nothing to repair
  }

  const binPathMatch = qcRes.stdout.match(/BINARY_PATH_NAME\s*:\s*(.+)/i);
  if (!binPathMatch) {
    return;
  }

  const currentBinPath = binPathMatch[1].trim();
  const lowerBinPath = currentBinPath.toLowerCase();

  // Check if the binary is node.exe (or bun.exe) — these are NOT SCM-compatible
  const isRawRuntime =
    lowerBinPath.includes("node.exe") ||
    lowerBinPath.includes("bun.exe");

  if (!isRawRuntime) {
    return; // Already using the wrapper, no repair needed
  }

  stdout.write("Detected node.exe as service binary (not SCM-compatible). Auto-repairing...\n");

  // Extract the original program arguments from the current binPath
  // Format: "C:\...\node.exe" C:\...\index.js gateway --port 18789
  // or: C:\...\node.exe C:\...\index.js gateway --port 18789
  const programArguments = parseScBinPath(currentBinPath);
  
  // Determine working directory from the script path
  const scriptPath = programArguments[1]; // index.js path
  const workingDirectory = scriptPath ? path.dirname(scriptPath) : undefined;

  const executablePath = resolveServiceExecutablePath(env);
  await fs.mkdir(path.dirname(executablePath), { recursive: true });

  try {
    await generateServiceWrapper({
      serviceName,
      programArguments,
      workingDirectory,
      outputPath: executablePath,
    });

    // Update the service binary path to use the compiled wrapper
    const configRes = await execScExe([
      "config",
      serviceName,
      "binPath=",
      quoteCmdArg(executablePath),
    ]);

    if (configRes.code !== 0) {
      stdout.write(
        `Warning: Compiled wrapper but failed to update service config: ${configRes.stderr || configRes.stdout}\n`,
      );
      return;
    }

    stdout.write(`${formatLine("Repaired service binary", executablePath)}\n`);
  } catch (err) {
    stdout.write(
      `Warning: Auto-repair failed (${err instanceof Error ? err.message : String(err)}). ` +
      `The service may fail to start with error 1053.\n`,
    );
  }
}

/**
 * Parse an sc.exe BINARY_PATH_NAME value into program arguments.
 * Handles quoted paths like: "C:\Program Files\nodejs\node.exe" arg1 arg2
 */
function parseScBinPath(binPath: string): string[] {
  const args: string[] = [];
  let i = 0;
  while (i < binPath.length) {
    // Skip whitespace
    while (i < binPath.length && (binPath[i] === " " || binPath[i] === "\t")) {
      i++;
    }
    if (i >= binPath.length) {break;}

    if (binPath[i] === '"') {
      // Quoted argument
      i++; // skip opening quote
      let arg = "";
      while (i < binPath.length && binPath[i] !== '"') {
        arg += binPath[i];
        i++;
      }
      if (i < binPath.length) {i++;} // skip closing quote
      args.push(arg);
    } else {
      // Unquoted argument
      let arg = "";
      while (i < binPath.length && binPath[i] !== " " && binPath[i] !== "\t") {
        arg += binPath[i];
        i++;
      }
      args.push(arg);
    }
  }
  return args;
}

/**
 * Check if the OpenClaw Windows Service is installed
 */
export async function isWindowsServiceInstalled(args: {
  env?: Record<string, string | undefined>;
}): Promise<boolean> {
  try {
    await assertScExeAvailable();
  } catch {
    return false;
  }

  const serviceName = resolveServiceName(args.env ?? (process.env as Record<string, string | undefined>));
  const res = await execScExe(["query", serviceName]);
  return res.code === 0;
}

/**
 * Read the current status of the OpenClaw Windows Service
 */
export async function readWindowsServiceRuntime(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): Promise<GatewayServiceRuntime> {
  try {
    await assertScExeAvailable();
  } catch (err) {
    return {
      status: "unknown",
      detail: String(err),
    };
  }

  const serviceName = resolveServiceName(env);
  const res = await execScExe(["query", serviceName]);
  
  if (res.code !== 0) {
    const detail = (res.stderr || res.stdout).trim();
    const missing = detail.toLowerCase().includes("does not exist");
    return {
      status: missing ? "stopped" : "unknown",
      detail: detail || undefined,
      missingUnit: missing,
    };
  }

  // Parse the service status
  const statusMatch = res.stdout.match(/STATE\s*:\s*\d+\s+(\w+)/i);
  const status = statusMatch ? statusMatch[1].toLowerCase() : "unknown";
  
  const running = status === "running" || status === "start_pending";
  
  return {
    status: running ? "running" : "stopped",
    state: status,
  };
}

// Helper functions

/**
 * Read the command configuration of the Windows Service
 */
export async function readWindowsServiceCommand(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): Promise<{
  programArguments: string[];
  workingDirectory?: string;
  environment?: Record<string, string>;
  sourcePath?: string;
} | null> {
  try {
    await assertScExeAvailable();
  } catch {
    return null;
  }

  const serviceName = resolveServiceName(env);
  const res = await execScExe(["qc", serviceName]);
  if (res.code !== 0) {
    return null;
  }

  // Parse BINARY_PATH_NAME from sc.exe qc output
  const binPathMatch = res.stdout.match(/BINARY_PATH_NAME\s*:\s*(.+)/i);
  if (!binPathMatch) {
    return null;
  }

  const binPath = binPathMatch[1].trim();
  // Split into program and arguments
  const parts = binPath.split(/\s+/);
  return {
    programArguments: parts,
    sourcePath: `sc.exe qc ${serviceName}`,
  };
}

function buildServiceBinPath(
  programArguments: string[],
  _workingDirectory?: string,
): string {
  // For a Windows Service, the binPath must point to a service executable
  // that implements the Windows Service Control Manager (SCM) interface
  // We'll need to create a wrapper executable for this
  const command = programArguments.map(quoteCmdArg).join(" ");
  return command;
}

/**
 * Generate a Windows Service wrapper executable
 * This creates a small C# or C++ executable that implements the SCM interface
 * and launches the actual OpenClaw node process
 */
export async function generateServiceWrapper({
  serviceName,
  programArguments,
  workingDirectory,
  environment,
  outputPath,
}: {
  serviceName: string;
  programArguments: string[];
  workingDirectory?: string;
  environment?: Record<string, string | undefined>;
  outputPath: string;
}): Promise<void> {
  const csCode = generateServiceWrapperCode({
    serviceName,
    programArguments,
    workingDirectory,
    environment,
  });

  const sourcePath = outputPath.replace(".exe", ".cs");
  const projPath = outputPath.replace(".exe", ".csproj");
  
  // write the C# source
  await fs.writeFile(sourcePath, csCode, "utf8");

  // generate a temporary .csproj — use plain SDK to avoid NuGet dependency on
  // Microsoft.Extensions.Hosting.WindowsServices which can fail on NuGet restore.
  // System.ServiceProcess.ServiceController ships with the .NET runtime.
  const csprojContent = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net9.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <OutputType>Exe</OutputType>
    <PublishSingleFile>true</PublishSingleFile>
    <SelfContained>true</SelfContained>
    <RuntimeIdentifier>win-x64</RuntimeIdentifier>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="System.ServiceProcess.ServiceController" Version="9.0.0" />
  </ItemGroup>
</Project>`;

  await fs.writeFile(projPath, csprojContent, "utf8");

  // Compile using dotnet publish
  // We use publish to get a standalone .exe
  try {
    const { stdout, stderr } = await execFileAsync("dotnet", [
      "publish",
      projPath,
      "-c", "Release",
      "-r", "win-x64",
      "--self-contained", "true",
      "-p:PublishSingleFile=true",
      "-o", path.dirname(outputPath)
    ]);
    
    // The output might be named based on the project file name, let's rename it if needed
    // But since we are compiling for a specific output path... wait, -o specifies the directory.
    // The strict output file name will be the project name (from .csproj filename).
    
    // We should name the project file same as the target executable base name
    // sourcePath is e.g. .../openclaw-service.cs
    // projPath is .../openclaw-service.csproj
    // So the output executable will be openclaw-service.exe in the output dir.
    
    // We verify if it exists
    try {
        await fs.access(outputPath);
    } catch {
        throw new Error(`Compilation failed, output file not found at ${outputPath}\nStdout: ${stdout}\nStderr: ${stderr}`);
    }

    // Clean up temporary files
    await fs.unlink(sourcePath).catch(() => {});
    await fs.unlink(projPath).catch(() => {});
    
    // Also cleaning up the obj/bin folders if they were created in the source dir...
    // dotnet build creates obj/ and bin/ in the directory of the csproj.
    // We should probably run this in a temp dir to be clean, but for now this is fine.
    
  } catch (error) {
    throw new Error(`Failed to compile service wrapper: ${String(error)}`, { cause: error });
  }
}

function generateServiceWrapperCode({
  serviceName,
  programArguments,
  workingDirectory,
  environment,
}: {
  serviceName: string;
  programArguments: string[];
  workingDirectory?: string;
  environment?: Record<string, string | undefined>;
}): string {
  const envVars = environment
    ? Object.entries(environment)
        .map(([key, value]) => `Environment.SetEnvironmentVariable("${key}", "${value}");`)
        .join("\n        ")
    : "";

  // Use the lower-level ServiceBase API directly instead of the
  // Microsoft.Extensions.Hosting.WindowsServices pattern.
  // This avoids a NuGet dependency on Microsoft.Extensions.Hosting.WindowsServices
  // and works with just System.ServiceProcess.ServiceController.
  return `
using System;
using System.Diagnostics;
using System.IO;
using System.ServiceProcess;
using System.Threading;
using System.Threading.Tasks;

namespace OpenClawService
{
    public class Program
    {
        public static void Main(string[] args)
        {
            ServiceBase.Run(new OpenClawServiceHost());
        }
    }

    public class OpenClawServiceHost : ServiceBase
    {
        private Process? _process;
        private string _logPath;
        private CancellationTokenSource? _cts;

        public OpenClawServiceHost()
        {
            ServiceName = "${serviceName}";
            CanStop = true;
            CanShutdown = true;

            var stateDir = Environment.GetEnvironmentVariable("OPENCLAW_STATE_DIR") 
                ?? Environment.GetEnvironmentVariable("TEMP") 
                ?? @"C:\\Windows\\Temp";
            _logPath = Path.Combine(stateDir, "openclaw-service.log");
        }

        private void Log(string message)
        {
            try 
            { 
                File.AppendAllText(_logPath, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {message}{Environment.NewLine}"); 
            } 
            catch { }
        }

        protected override void OnStart(string[] args)
        {
            _cts = new CancellationTokenSource();
            Task.Run(() => RunProcessAsync(_cts.Token));
        }

        protected override void OnStop()
        {
            Log("Service stopping...");
            _cts?.Cancel();
            try
            {
                if (_process != null && !_process.HasExited)
                {
                    _process.Kill(entireProcessTree: true);
                    _process.WaitForExit(5000);
                }
            }
            catch (Exception ex)
            {
                Log($"Error stopping process: {ex.Message}");
            }
        }

        protected override void OnShutdown()
        {
            OnStop();
        }

        private async Task RunProcessAsync(CancellationToken stoppingToken)
        {
            try 
            {
                ${envVars}
                
                Log("Service starting...");
                var fileName = @"${programArguments[0].replace(/"/g, '""')}";
                var processArgs = @"${programArguments.slice(1).join(" ").replace(/"/g, '""')}";
                var workDir = @"${(workingDirectory || "").replace(/"/g, '""')}";

                Log($"FileName: {fileName}");
                Log($"Arguments: {processArgs}");
                Log($"WorkingDirectory: {workDir}");

                var startInfo = new ProcessStartInfo
                {
                    FileName = fileName, 
                    Arguments = processArgs,
                    WorkingDirectory = workDir,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true
                };

                _process = new Process();
                _process.StartInfo = startInfo;
                
                _process.OutputDataReceived += (sender, e) => { 
                    if (!string.IsNullOrEmpty(e.Data)) Log($"[STDOUT] {e.Data}"); 
                };
                _process.ErrorDataReceived += (sender, e) => { 
                    if (!string.IsNullOrEmpty(e.Data)) Log($"[STDERR] {e.Data}"); 
                };

                Log("Starting process...");
                if (!_process.Start())
                {
                    Log("Process.Start() returned false");
                    ExitCode = 1;
                    Stop();
                    return;
                }

                _process.BeginOutputReadLine();
                _process.BeginErrorReadLine();
                Log($"Process started with PID: {_process.Id}");

                // Wait for process exit or cancellation
                while (!_process.HasExited && !stoppingToken.IsCancellationRequested)
                {
                    await Task.Delay(500, stoppingToken).ConfigureAwait(false);
                }
                
                if (_process.HasExited)
                {
                    Log($"Process exited with code {_process.ExitCode}");
                    ExitCode = _process.ExitCode;
                    Stop();
                }
            }
            catch (OperationCanceledException)
            {
                Log("Service stopping (cancelled)");
            }
            catch (Exception ex)
            {
                Log($"Critical Exception: {ex}");
                ExitCode = 1;
                Stop();
            }
        }
    }
}
`;
}
