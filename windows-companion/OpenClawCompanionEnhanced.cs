/**
 * HoC Windows Companion Service - Enhanced Edition
 * 
 * Features:
 * - Cluster-aware operation with Redis integration
 * - Deep Windows control (processes, screen, inputs, audio)
 * - Hardware-level input simulation
 * - Advanced UI Automation
 * - Process and service management
 * - Screen capture and monitoring
 * - Audio input/output control
 * - PowerShell execution with admin privileges
 * - Registry, environment, firewall, task scheduler access
 * - Hardware info (GPU, disk, network, memory, battery, display)
 * - File operations and clipboard management
 * - Window management and control
 * - VLM vision agent integration via Ollama
 * - Memory-safe with proper resource cleanup
 * - High performance and resilience
 */

using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.IO.Pipes;
using System.Linq;
using System.Management;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.ServiceProcess;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Automation;
using System.Windows.Forms;
using NAudio.Wave;
using StackExchange.Redis;

namespace OpenClawCompanion
{
    /// <summary>
    /// Enhanced companion service with cluster awareness and deep Windows control
    /// </summary>
    public class CompanionServiceEnhanced : ServiceBase
    {
        #region Fields

        private readonly string _pipeName = "OpenClawCompanion";
        private readonly string _serviceName = "OpenClawCompanion";
        private readonly ConcurrentDictionary<string, NamedPipeServerStream> _activePipes;
        private readonly ConcurrentDictionary<string, CancellationTokenSource> _clientCancellationTokens;
        private CancellationTokenSource? _mainCancellationTokenSource;
        private Task? _serverTask;
        private Task? _healthMonitorTask;
        private Task? _clusterSyncTask;
        
        // Cluster integration
        private ConnectionMultiplexer? _redis;
        private IDatabase? _redisDb;
        private string? _gatewayId;
        private string? _nodeId;
        private bool _clusterEnabled;
        
        // Resource tracking
        private readonly ConcurrentDictionary<int, Process> _managedProcesses;
        private readonly ConcurrentDictionary<string, IDisposable> _managedResources;
        private readonly object _disposeLock = new object();
        private bool _disposed = false;

        // Audio devices
        private WaveInEvent? _audioIn;
        private WaveOutEvent? _audioOut;

        // Vision agent (VLM via Ollama)
        private readonly VisionAgent _visionAgent;

        #endregion

        #region Constructor and Lifecycle

        public CompanionServiceEnhanced()
        {
            ServiceName = _serviceName;
            CanStop = true;
            CanPauseAndContinue = false;
            CanShutdown = true;
            AutoLog = true;

            _activePipes = new ConcurrentDictionary<string, NamedPipeServerStream>();
            _clientCancellationTokens = new ConcurrentDictionary<string, CancellationTokenSource>();
            _managedProcesses = new ConcurrentDictionary<int, Process>();
            _managedResources = new ConcurrentDictionary<string, IDisposable>();
            _visionAgent = new VisionAgent();
        }

        protected override void OnStart(string[] args)
        {
            try
            {
                LogInfo("Starting HOC Companion Service");

                // Initialize cluster connection if enabled
                InitializeClusterConnection();

                _mainCancellationTokenSource = new CancellationTokenSource();
                var token = _mainCancellationTokenSource.Token;

                // Start IPC server
                _serverTask = Task.Run(() => RunServerAsync(token), token);

                // Start health monitoring
                _healthMonitorTask = Task.Run(() => HealthMonitorAsync(token), token);

                // Start cluster sync if enabled
                if (_clusterEnabled)
                {
                    _clusterSyncTask = Task.Run(() => ClusterSyncAsync(token), token);
                }

                LogInfo("Service started successfully");
            }
            catch (Exception ex)
            {
                LogError($"Failed to start service: {ex.Message}", ex);
                throw;
            }
        }

        protected override void OnStop()
        {
            LogInfo("Stopping service...");
            Cleanup();
            LogInfo("Service stopped");
        }

        protected override void OnShutdown()
        {
            LogInfo("System shutdown detected, cleaning up...");
            Cleanup();
        }

        public void RunConsole(string[] args)
        {
            OnStart(args);
        }

        public void StopConsole()
        {
            OnStop();
        }

        private void Cleanup()
        {
            lock (_disposeLock)
            {
                if (_disposed) return;
                _disposed = true;

                try
                {
                    // Cancel all operations
                    _mainCancellationTokenSource?.Cancel();

                    // Wait for tasks to complete
                    Task.WaitAll(new[] { _serverTask, _healthMonitorTask, _clusterSyncTask }
                        .Where(t => t != null).ToArray(), TimeSpan.FromSeconds(10));

                    // Close all client connections
                    foreach (var cts in _clientCancellationTokens.Values)
                    {
                        cts?.Cancel();
                        cts?.Dispose();
                    }
                    _clientCancellationTokens.Clear();

                    // Close all pipes
                    foreach (var pipe in _activePipes.Values)
                    {
                        try
                        {
                            pipe?.Close();
                            pipe?.Dispose();
                        }
                        catch { }
                    }
                    _activePipes.Clear();

                    // Cleanup managed processes
                    foreach (var process in _managedProcesses.Values)
                    {
                        try
                        {
                            if (!process.HasExited)
                            {
                                process.Kill();
                            }
                            process.Dispose();
                        }
                        catch { }
                    }
                    _managedProcesses.Clear();

                    // Cleanup managed resources
                    foreach (var resource in _managedResources.Values)
                    {
                        try
                        {
                            resource?.Dispose();
                        }
                        catch { }
                    }
                    _managedResources.Clear();

                    // Cleanup audio devices
                    _audioIn?.Dispose();
                    _audioOut?.Dispose();

                    // Cleanup vision agent
                    _visionAgent?.Dispose();

                    // Cleanup cluster connection
                    _redis?.Dispose();

                    // Dispose cancellation token sources
                    _mainCancellationTokenSource?.Dispose();

                    LogInfo("Cleanup completed");
                }
                catch (Exception ex)
                {
                    LogError($"Error during cleanup: {ex.Message}", ex);
                }
            }
        }

        #endregion

        #region Cluster Integration

        private void InitializeClusterConnection()
        {
            try
            {
                _clusterEnabled = Environment.GetEnvironmentVariable("OPENCLAW_CLUSTER_ENABLED")?.ToLower() == "true";
                
                if (!_clusterEnabled)
                {
                    LogInfo("Cluster mode disabled");
                    return;
                }

                var redisHost = Environment.GetEnvironmentVariable("OPENCLAW_REDIS_HOST") ?? "localhost";
                var redisPort = Environment.GetEnvironmentVariable("OPENCLAW_REDIS_PORT") ?? "6379";
                var redisPassword = Environment.GetEnvironmentVariable("OPENCLAW_REDIS_PASSWORD");
                
                _gatewayId = Environment.GetEnvironmentVariable("OPENCLAW_CLUSTER_NODE_ID") 
                    ?? Environment.MachineName;
                _nodeId = $"{_gatewayId}-companion";

                var config = new ConfigurationOptions
                {
                    EndPoints = { { redisHost, int.Parse(redisPort) } },
                    Password = redisPassword,
                    ConnectTimeout = 5000,
                    SyncTimeout = 5000,
                    AbortOnConnectFail = false,
                    ReconnectRetryPolicy = new ExponentialRetry(5000),
                };

                _redis = ConnectionMultiplexer.Connect(config);
                _redisDb = _redis.GetDatabase();

                // Register companion service in cluster
                RegisterInCluster();

                LogInfo($"Connected to Redis cluster at {redisHost}:{redisPort}");
            }
            catch (Exception ex)
            {
                LogError($"Failed to initialize cluster connection: {ex.Message}", ex);
                _clusterEnabled = false;
            }
        }

        private void RegisterInCluster()
        {
            if (!_clusterEnabled || _redisDb == null) return;

            try
            {
                var companionInfo = new
                {
                    id = _nodeId,
                    gatewayId = _gatewayId,
                    type = "windows-companion",
                    version = "2.0.0-enhanced",
                    capabilities = new[]
                    {
                        "input.hardware",
                        "ui.automation",
                        "process.management",
                        "screen.capture",
                        "audio.control",
                        "system.wmi"
                    },
                    startedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                    lastHeartbeat = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                };

                var json = JsonSerializer.Serialize(companionInfo);
                _redisDb.StringSet($"companion:{_nodeId}", json, TimeSpan.FromMinutes(5));

                LogInfo($"Registered in cluster as {_nodeId}");
            }
            catch (Exception ex)
            {
                LogError($"Failed to register in cluster: {ex.Message}", ex);
            }
        }

        private async Task ClusterSyncAsync(CancellationToken cancellationToken)
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                try
                {
                    // Send heartbeat every 30 seconds
                    await Task.Delay(30000, cancellationToken);

                    if (_redisDb != null)
                    {
                        var heartbeat = new
                        {
                            lastHeartbeat = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                            activeConnections = _activePipes.Count,
                            managedProcesses = _managedProcesses.Count
                        };

                        var json = JsonSerializer.Serialize(heartbeat);
                        await _redisDb.StringSetAsync($"companion:{_nodeId}:heartbeat", json, TimeSpan.FromMinutes(2));
                    }
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    LogError($"Cluster sync error: {ex.Message}", ex);
                }
            }
        }

        #endregion

        #region IPC Server

        private async Task RunServerAsync(CancellationToken cancellationToken)
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                NamedPipeServerStream pipe = null;
                try
                {
                    pipe = new NamedPipeServerStream(
                        _pipeName,
                        PipeDirection.InOut,
                        NamedPipeServerStream.MaxAllowedServerInstances,
                        PipeTransmissionMode.Message,
                        PipeOptions.Asynchronous | PipeOptions.WriteThrough
                    );

                    await pipe.WaitForConnectionAsync(cancellationToken);

                    var clientId = Guid.NewGuid().ToString();
                    _activePipes.TryAdd(clientId, pipe);

                    var clientCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                    _clientCancellationTokens.TryAdd(clientId, clientCts);

                    // Handle client in separate task
                    _ = Task.Run(async () =>
                    {
                        try
                        {
                            await HandleClientAsync(clientId, pipe, clientCts.Token);
                        }
                        finally
                        {
                            _activePipes.TryRemove(clientId, out _);
                            _clientCancellationTokens.TryRemove(clientId, out var cts);
                            cts?.Dispose();
                        }
                    }, clientCts.Token);
                }
                catch (OperationCanceledException)
                {
                    pipe?.Dispose();
                    break;
                }
                catch (Exception ex)
                {
                    LogError($"Server error: {ex.Message}", ex);
                    pipe?.Dispose();
                    await Task.Delay(1000, cancellationToken);
                }
            }
        }

        private async Task HandleClientAsync(string clientId, NamedPipeServerStream pipe, CancellationToken cancellationToken)
        {
            StreamReader reader = null;
            StreamWriter writer = null;

            try
            {
                reader = new StreamReader(pipe, Encoding.UTF8, false, 4096, leaveOpen: false);
                writer = new StreamWriter(pipe, Encoding.UTF8, 4096, leaveOpen: false) { AutoFlush = true };

                LogInfo($"Client connected: {clientId}");

                while (pipe.IsConnected && !cancellationToken.IsCancellationRequested)
                {
                    var requestJson = await reader.ReadLineAsync();
                    if (string.IsNullOrEmpty(requestJson))
                        break;

                    var request = JsonSerializer.Deserialize<CompanionRequest>(requestJson);
                    if (request == null) continue;

                    var response = await ProcessRequestAsync(request, cancellationToken);
                    var responseJson = JsonSerializer.Serialize(response);

                    await writer.WriteLineAsync(responseJson);
                }

                LogInfo($"Client disconnected: {clientId}");
            }
            catch (Exception ex)
            {
                LogError($"Client handler error ({clientId}): {ex.Message}", ex);
            }
            finally
            {
                reader?.Dispose();
                writer?.Dispose();
                pipe?.Close();
                pipe?.Dispose();
            }
        }

        #endregion

        #region Request Processing

        private async Task<CompanionResponse> ProcessRequestAsync(CompanionRequest request, CancellationToken cancellationToken)
        {
            try
            {
                return request.Command switch
                {
                    // Input simulation
                    "input.mouse.move" => await HandleMouseMoveAsync(request),
                    "input.mouse.click" => await HandleMouseClickAsync(request),
                    "input.mouse.scroll" => await HandleMouseScrollAsync(request),
                    "input.keyboard.type" => await HandleKeyboardTypeAsync(request),
                    "input.keyboard.press" => await HandleKeyboardPressAsync(request),
                    "input.keyboard.combo" => await HandleKeyboardComboAsync(request),
                    
                    // UI Automation
                    "ui.find" => await HandleUIFindAsync(request),
                    "ui.click" => await HandleUIClickAsync(request),
                    "ui.read" => await HandleUIReadAsync(request),
                    "ui.list" => await HandleUIListAsync(request),
                    "ui.tree" => await HandleUITreeAsync(request),
                    
                    // Process management
                    "process.list" => await HandleProcessListAsync(request),
                    "process.start" => await HandleProcessStartAsync(request),
                    "process.kill" => await HandleProcessKillAsync(request),
                    "process.info" => await HandleProcessInfoAsync(request),
                    
                    // Screen operations
                    "screen.capture" => await HandleScreenCaptureAsync(request),
                    "screen.list" => await HandleScreenListAsync(request),
                    "screen.info" => await HandleScreenInfoAsync(request),
                    
                    // Audio operations
                    "audio.devices" => await HandleAudioDevicesAsync(request),
                    "audio.record.start" => await HandleAudioRecordStartAsync(request),
                    "audio.record.stop" => await HandleAudioRecordStopAsync(request),
                    "audio.play" => await HandleAudioPlayAsync(request),
                    
                    // System operations
                    "system.wmi.query" => await HandleWMIQueryAsync(request),
                    "system.service.list" => await HandleServiceListAsync(request),
                    "system.service.control" => await HandleServiceControlAsync(request),
                    "system.info" => await HandleSystemInfoAsync(request),
                    
                    // Health check
                    "health.check" => await HandleHealthCheckAsync(request),
                    
                    // PowerShell operations
                    "powershell.execute" => await HandlePowerShellExecuteAsync(request),
                    "powershell.remoting" => await HandlePowerShellRemotingAsync(request),
                    
                    // Registry operations
                    "system.registry.read" => await HandleRegistryReadAsync(request),
                    "system.registry.write" => await HandleRegistryWriteAsync(request),
                    
                    // Environment variables
                    "system.env.get" => await HandleEnvGetAsync(request),
                    "system.env.set" => await HandleEnvSetAsync(request),
                    
                    // Firewall
                    "system.firewall.rule" => await HandleFirewallRuleAsync(request),
                    
                    // Task Scheduler
                    "system.task.schedule" => await HandleTaskScheduleAsync(request),
                    
                    // Hardware info
                    "hardware.gpu.info" => await HandleHardwareGpuAsync(request),
                    "hardware.disk.info" => await HandleHardwareDiskAsync(request),
                    "hardware.network.info" => await HandleHardwareNetworkAsync(request),
                    "hardware.memory.info" => await HandleHardwareMemoryAsync(request),
                    "hardware.battery.info" => await HandleHardwareBatteryAsync(request),
                    "hardware.display.brightness" => await HandleDisplayBrightnessAsync(request),
                    
                    // File operations
                    "file.read" => await HandleFileReadAsync(request),
                    "file.write" => await HandleFileWriteAsync(request),
                    "file.list" => await HandleFileListAsync(request),
                    "file.search" => await HandleFileSearchAsync(request),
                    
                    // Clipboard
                    "clipboard.get" => await HandleClipboardGetAsync(request),
                    "clipboard.set" => await HandleClipboardSetAsync(request),
                    
                    // Window management
                    "window.list" => await HandleWindowListAsync(request),
                    "window.focus" => await HandleWindowFocusAsync(request),
                    "window.resize" => await HandleWindowResizeAsync(request),
                    "window.minimize" => await HandleWindowMinimizeAsync(request),
                    "window.close" => await HandleWindowCloseAsync(request),
                    "window.maximize" => await HandleWindowMaximizeAsync(request),
                    "window.move" => await HandleWindowMoveAsync(request),
                    "window.snap" => await HandleWindowSnapAsync(request),
                    "window.opacity" => await HandleWindowOpacityAsync(request),
                    "window.topmost" => await HandleWindowTopmostAsync(request),
                    "window.title.set" => await HandleWindowTitleSetAsync(request),
                    
                    // System power
                    "system.shutdown" => await HandleSystemShutdownAsync(request),
                    "system.restart" => await HandleSystemRestartAsync(request),
                    "system.sleep" => await HandleSystemSleepAsync(request),
                    "system.hibernate" => await HandleSystemHibernateAsync(request),
                    "system.lock" => await HandleSystemLockAsync(request),
                    "system.logoff" => await HandleSystemLogoffAsync(request),
                    
                    // Audio volume control
                    "audio.volume.get" => await HandleAudioVolumeGetAsync(request),
                    "audio.volume.set" => await HandleAudioVolumeSetAsync(request),
                    "audio.mute" => await HandleAudioMuteAsync(request),
                    "audio.unmute" => await HandleAudioUnmuteAsync(request),
                    
                    // Notifications
                    "system.notification.show" => await HandleNotificationShowAsync(request),
                    
                    // Display
                    "display.resolution.get" => await HandleDisplayResolutionGetAsync(request),
                    "display.resolution.set" => await HandleDisplayResolutionSetAsync(request),
                    "display.list" => await HandleDisplayListAsync(request),
                    
                    // Network
                    "network.adapters" => await HandleNetworkAdaptersAsync(request),
                    "network.ip" => await HandleNetworkIpAsync(request),
                    "network.wifi.list" => await HandleNetworkWifiListAsync(request),
                    "network.wifi.connect" => await HandleNetworkWifiConnectAsync(request),
                    "network.wifi.disconnect" => await HandleNetworkWifiDisconnectAsync(request),
                    "network.dns.flush" => await HandleNetworkDnsFlushAsync(request),
                    
                    // Installed apps
                    "apps.installed" => await HandleAppsInstalledAsync(request),
                    "apps.uninstall" => await HandleAppsUninstallAsync(request),
                    
                    // User accounts
                    "system.users.list" => await HandleUsersListAsync(request),
                    "system.users.current" => await HandleUsersCurrentAsync(request),
                    
                    // Device management
                    "device.list" => await HandleDeviceListAsync(request),
                    "device.enable" => await HandleDeviceEnableAsync(request),
                    "device.disable" => await HandleDeviceDisableAsync(request),
                    
                    // Process enhancements
                    "process.focus" => await HandleProcessFocusAsync(request),
                    "process.priority" => await HandleProcessPriorityAsync(request),
                    
                    // Vision (VLM via Ollama)
                    "vision.analyze" => await HandleVisionAnalyzeAsync(request),
                    "vision.describe" => await HandleVisionDescribeAsync(request),
                    "vision.find_element" => await HandleVisionFindElementAsync(request),
                    "vision.ocr" => await HandleVisionOCRAsync(request),
                    
                    _ => new CompanionResponse
                    {
                        Success = false,
                        Error = $"Unknown command: {request.Command}"
                    }
                };
            }
            catch (Exception ex)
            {
                LogError($"Error processing command '{request.Command}': {ex.Message}", ex);
                return new CompanionResponse
                {
                    Success = false,
                    Error = ex.Message,
                    StackTrace = ex.StackTrace ?? ""
                };
            }
        }

        #endregion

        #region Input Simulation (Hardware-Level)

        // P/Invoke declarations for low-level input
        [DllImport("user32.dll", SetLastError = true)]
        private static extern uint SendInput(uint nInputs, [MarshalAs(UnmanagedType.LPArray)] INPUT[] pInputs, int cbSize);

        [DllImport("user32.dll")]
        private static extern short GetAsyncKeyState(int vKey);

        [DllImport("user32.dll")]
        private static extern bool SetCursorPos(int X, int Y);

        [DllImport("user32.dll")]
        private static extern bool GetCursorPos(out POINT lpPoint);

        [StructLayout(LayoutKind.Sequential)]
        private struct POINT
        {
            public int X;
            public int Y;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct INPUT
        {
            public uint type;
            public InputUnion u;
        }

        [StructLayout(LayoutKind.Explicit)]
        private struct InputUnion
        {
            [FieldOffset(0)] public MOUSEINPUT mi;
            [FieldOffset(0)] public KEYBDINPUT ki;
            [FieldOffset(0)] public HARDWAREINPUT hi;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct MOUSEINPUT
        {
            public int dx;
            public int dy;
            public uint mouseData;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct KEYBDINPUT
        {
            public ushort wVk;
            public ushort wScan;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct HARDWAREINPUT
        {
            public uint uMsg;
            public ushort wParamL;
            public ushort wParamH;
        }

        private const uint INPUT_MOUSE = 0;
        private const uint INPUT_KEYBOARD = 1;
        private const uint INPUT_HARDWARE = 2;

        private const uint MOUSEEVENTF_MOVE = 0x0001;
        private const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
        private const uint MOUSEEVENTF_LEFTUP = 0x0004;
        private const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
        private const uint MOUSEEVENTF_RIGHTUP = 0x0010;
        private const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
        private const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
        private const uint MOUSEEVENTF_WHEEL = 0x0800;
        private const uint MOUSEEVENTF_ABSOLUTE = 0x8000;

        private const uint KEYEVENTF_EXTENDEDKEY = 0x0001;
        private const uint KEYEVENTF_KEYUP = 0x0002;
        private const uint KEYEVENTF_UNICODE = 0x0004;
        private const uint KEYEVENTF_SCANCODE = 0x0008;

        private Task<CompanionResponse> HandleMouseMoveAsync(CompanionRequest request)
        {
            try
            {
                var x = request.Parameters.GetProperty("x").GetInt32();
                var y = request.Parameters.GetProperty("y").GetInt32();
                var absolute = request.Parameters.TryGetProperty("absolute", out var absProp) && absProp.GetBoolean();

                if (absolute)
                {
                    SetCursorPos(x, y);
                }
                else
                {
                    var input = new INPUT
                    {
                        type = INPUT_MOUSE,
                        u = new InputUnion
                        {
                            mi = new MOUSEINPUT
                            {
                                dx = x,
                                dy = y,
                                dwFlags = MOUSEEVENTF_MOVE,
                                time = 0,
                                dwExtraInfo = IntPtr.Zero
                            }
                        }
                    };

                    SendInput(1, new[] { input }, Marshal.SizeOf(typeof(INPUT)));
                }

                return Task.FromResult(new CompanionResponse { Success = true });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        private Task<CompanionResponse> HandleMouseClickAsync(CompanionRequest request)
        {
            try
            {
                var button = request.Parameters.TryGetProperty("button", out var btnProp) 
                    ? btnProp.GetString() : "left";
                var doubleClick = request.Parameters.TryGetProperty("double", out var dblProp) 
                    && dblProp.GetBoolean();

                uint downFlag, upFlag;
                switch (button?.ToLower())
                {
                    case "right":
                        downFlag = MOUSEEVENTF_RIGHTDOWN;
                        upFlag = MOUSEEVENTF_RIGHTUP;
                        break;
                    case "middle":
                        downFlag = MOUSEEVENTF_MIDDLEDOWN;
                        upFlag = MOUSEEVENTF_MIDDLEUP;
                        break;
                    default:
                        downFlag = MOUSEEVENTF_LEFTDOWN;
                        upFlag = MOUSEEVENTF_LEFTUP;
                        break;
                }

                var inputs = new List<INPUT>();

                // First click
                inputs.Add(new INPUT { type = INPUT_MOUSE, u = new InputUnion { mi = new MOUSEINPUT { dwFlags = downFlag } } });
                inputs.Add(new INPUT { type = INPUT_MOUSE, u = new InputUnion { mi = new MOUSEINPUT { dwFlags = upFlag } } });

                // Double click
                if (doubleClick)
                {
                    Thread.Sleep(50);
                    inputs.Add(new INPUT { type = INPUT_MOUSE, u = new InputUnion { mi = new MOUSEINPUT { dwFlags = downFlag } } });
                    inputs.Add(new INPUT { type = INPUT_MOUSE, u = new InputUnion { mi = new MOUSEINPUT { dwFlags = upFlag } } });
                }

                SendInput((uint)inputs.Count, inputs.ToArray(), Marshal.SizeOf(typeof(INPUT)));

                return Task.FromResult(new CompanionResponse { Success = true });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        private Task<CompanionResponse> HandleMouseScrollAsync(CompanionRequest request)
        {
            try
            {
                var delta = request.Parameters.GetProperty("delta").GetInt32();

                var input = new INPUT
                {
                    type = INPUT_MOUSE,
                    u = new InputUnion
                    {
                        mi = new MOUSEINPUT
                        {
                            dwFlags = MOUSEEVENTF_WHEEL,
                            mouseData = (uint)delta,
                            time = 0,
                            dwExtraInfo = IntPtr.Zero
                        }
                    }
                };

                SendInput(1, new[] { input }, Marshal.SizeOf(typeof(INPUT)));

                return Task.FromResult(new CompanionResponse { Success = true });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        private Task<CompanionResponse> HandleKeyboardTypeAsync(CompanionRequest request)
        {
            try
            {
                var text = request.Parameters.GetProperty("text").GetString();
                if (string.IsNullOrEmpty(text))
                    return Task.FromResult(new CompanionResponse { Success = false, Error = "Text is required" });

                var inputs = new List<INPUT>();

                foreach (var ch in text)
                {
                    // Key down
                    inputs.Add(new INPUT
                    {
                        type = INPUT_KEYBOARD,
                        u = new InputUnion
                        {
                            ki = new KEYBDINPUT
                            {
                                wVk = 0,
                                wScan = ch,
                                dwFlags = KEYEVENTF_UNICODE,
                                time = 0,
                                dwExtraInfo = IntPtr.Zero
                            }
                        }
                    });

                    // Key up
                    inputs.Add(new INPUT
                    {
                        type = INPUT_KEYBOARD,
                        u = new InputUnion
                        {
                            ki = new KEYBDINPUT
                            {
                                wVk = 0,
                                wScan = ch,
                                dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP,
                                time = 0,
                                dwExtraInfo = IntPtr.Zero
                            }
                        }
                    });
                }

                SendInput((uint)inputs.Count, inputs.ToArray(), Marshal.SizeOf(typeof(INPUT)));

                return Task.FromResult(new CompanionResponse { Success = true });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        private Task<CompanionResponse> HandleKeyboardPressAsync(CompanionRequest request)
        {
            try
            {
                var keyCode = request.Parameters.GetProperty("key").GetInt32();

                var inputs = new INPUT[]
                {
                    new INPUT
                    {
                        type = INPUT_KEYBOARD,
                        u = new InputUnion
                        {
                            ki = new KEYBDINPUT
                            {
                                wVk = (ushort)keyCode,
                                wScan = 0,
                                dwFlags = 0,
                                time = 0,
                                dwExtraInfo = IntPtr.Zero
                            }
                        }
                    },
                    new INPUT
                    {
                        type = INPUT_KEYBOARD,
                        u = new InputUnion
                        {
                            ki = new KEYBDINPUT
                            {
                                wVk = (ushort)keyCode,
                                wScan = 0,
                                dwFlags = KEYEVENTF_KEYUP,
                                time = 0,
                                dwExtraInfo = IntPtr.Zero
                            }
                        }
                    }
                };

                SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));

                return Task.FromResult(new CompanionResponse { Success = true });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        private Task<CompanionResponse> HandleKeyboardComboAsync(CompanionRequest request)
        {
            try
            {
                var keys = request.Parameters.GetProperty("keys").EnumerateArray()
                    .Select(k => k.GetInt32()).ToArray();

                var inputs = new List<INPUT>();

                // Press all keys
                foreach (var key in keys)
                {
                    inputs.Add(new INPUT
                    {
                        type = INPUT_KEYBOARD,
                        u = new InputUnion
                        {
                            ki = new KEYBDINPUT
                            {
                                wVk = (ushort)key,
                                dwFlags = 0
                            }
                        }
                    });
                }

                // Release all keys in reverse order
                foreach (var key in keys.AsEnumerable().Reverse())
                {
                    inputs.Add(new INPUT
                    {
                        type = INPUT_KEYBOARD,
                        u = new InputUnion
                        {
                            ki = new KEYBDINPUT
                            {
                                wVk = (ushort)key,
                                dwFlags = KEYEVENTF_KEYUP
                            }
                        }
                    });
                }

                SendInput((uint)inputs.Count, inputs.ToArray(), Marshal.SizeOf(typeof(INPUT)));

                return Task.FromResult(new CompanionResponse { Success = true });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        #endregion

        #region UI Automation

        private Task<CompanionResponse> HandleUIFindAsync(CompanionRequest request)
        {
            try
            {
                var selector = request.Parameters.GetProperty("selector").GetString();
                var selectorType = request.Parameters.TryGetProperty("type", out var typeProp) 
                    ? typeProp.GetString() : "name";

                var root = AutomationElement.RootElement;
                System.Windows.Automation.Condition condition = selectorType?.ToLower() switch
                {
                    "class" => new PropertyCondition(AutomationElement.ClassNameProperty, selector),
                    "id" => new PropertyCondition(AutomationElement.AutomationIdProperty, selector),
                    _ => new PropertyCondition(AutomationElement.NameProperty, selector)
                };

                var element = root.FindFirst(TreeScope.Descendants, condition);

                if (element != null)
                {
                    var rect = element.Current.BoundingRectangle;
                    var data = new
                    {
                        found = true,
                        name = element.Current.Name,
                        className = element.Current.ClassName,
                        automationId = element.Current.AutomationId,
                        controlType = element.Current.ControlType.ProgrammaticName,
                        isEnabled = element.Current.IsEnabled,
                        bounds = new { x = rect.X, y = rect.Y, width = rect.Width, height = rect.Height }
                    };

                    return Task.FromResult(new CompanionResponse
                    {
                        Success = true,
                        Data = JsonSerializer.SerializeToElement(data)
                    });
                }

                return Task.FromResult(new CompanionResponse
                {
                    Success = true,
                    Data = JsonSerializer.SerializeToElement(new { found = false })
                });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        private Task<CompanionResponse> HandleUIClickAsync(CompanionRequest request)
        {
            try
            {
                var selector = request.Parameters.GetProperty("selector").GetString();
                
                var root = AutomationElement.RootElement;
                var condition = new PropertyCondition(AutomationElement.NameProperty, selector);
                var element = root.FindFirst(TreeScope.Descendants, condition);

                if (element != null)
                {
                    if (element.TryGetCurrentPattern(InvokePattern.Pattern, out object pattern))
                    {
                        ((InvokePattern)pattern).Invoke();
                        return Task.FromResult(new CompanionResponse { Success = true });
                    }
                    else
                    {
                        // Fallback: click at center of element
                        var rect = element.Current.BoundingRectangle;
                        var centerX = (int)(rect.X + rect.Width / 2);
                        var centerY = (int)(rect.Y + rect.Height / 2);

                        SetCursorPos(centerX, centerY);
                        Thread.Sleep(100);

                        var inputs = new INPUT[]
                        {
                            new INPUT { type = INPUT_MOUSE, u = new InputUnion { mi = new MOUSEINPUT { dwFlags = MOUSEEVENTF_LEFTDOWN } } },
                            new INPUT { type = INPUT_MOUSE, u = new InputUnion { mi = new MOUSEINPUT { dwFlags = MOUSEEVENTF_LEFTUP } } }
                        };

                        SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));

                        return Task.FromResult(new CompanionResponse { Success = true });
                    }
                }

                return Task.FromResult(new CompanionResponse { Success = false, Error = "Element not found" });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        private Task<CompanionResponse> HandleUIReadAsync(CompanionRequest request)
        {
            try
            {
                var selector = request.Parameters.GetProperty("selector").GetString();
                
                var root = AutomationElement.RootElement;
                var condition = new PropertyCondition(AutomationElement.NameProperty, selector);
                var element = root.FindFirst(TreeScope.Descendants, condition);

                if (element != null)
                {
                    string value = null;

                    if (element.TryGetCurrentPattern(ValuePattern.Pattern, out object pattern))
                    {
                        value = ((ValuePattern)pattern).Current.Value;
                    }
                    else if (element.TryGetCurrentPattern(TextPattern.Pattern, out object textPattern))
                    {
                        value = ((TextPattern)textPattern).DocumentRange.GetText(-1);
                    }
                    else
                    {
                        value = element.Current.Name;
                    }

                    return Task.FromResult(new CompanionResponse
                    {
                        Success = true,
                        Data = JsonSerializer.SerializeToElement(new { value })
                    });
                }

                return Task.FromResult(new CompanionResponse { Success = false, Error = "Element not found" });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        private Task<CompanionResponse> HandleUIListAsync(CompanionRequest request)
        {
            try
            {
                var processName = request.Parameters.TryGetProperty("process", out var procProp) 
                    ? procProp.GetString() : null;

                var root = AutomationElement.RootElement;
                var elements = new List<object>();

                var walker = TreeWalker.ControlViewWalker;
                var element = walker.GetFirstChild(root);

                while (element != null)
                {
                    try
                    {
                        if (processName == null || element.Current.ProcessId.ToString() == processName)
                        {
                            elements.Add(new
                            {
                                name = element.Current.Name,
                                className = element.Current.ClassName,
                                automationId = element.Current.AutomationId,
                                controlType = element.Current.ControlType.ProgrammaticName,
                                processId = element.Current.ProcessId
                            });
                        }
                    }
                    catch { }

                    element = walker.GetNextSibling(element);
                }

                return Task.FromResult(new CompanionResponse
                {
                    Success = true,
                    Data = JsonSerializer.SerializeToElement(new { elements })
                });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        private Task<CompanionResponse> HandleUITreeAsync(CompanionRequest request)
        {
            try
            {
                var selector = request.Parameters.TryGetProperty("selector", out var selProp) 
                    ? selProp.GetString() : null;
                var maxDepth = request.Parameters.TryGetProperty("maxDepth", out var depthProp) 
                    ? depthProp.GetInt32() : 3;

                AutomationElement root;
                if (selector != null)
                {
                    var condition = new PropertyCondition(AutomationElement.NameProperty, selector);
                    root = AutomationElement.RootElement.FindFirst(TreeScope.Descendants, condition);
                    if (root == null)
                        return Task.FromResult(new CompanionResponse { Success = false, Error = "Element not found" });
                }
                else
                {
                    root = AutomationElement.RootElement;
                }

                var tree = BuildUITree(root, 0, maxDepth);

                return Task.FromResult(new CompanionResponse
                {
                    Success = true,
                    Data = JsonSerializer.SerializeToElement(tree)
                });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        private object BuildUITree(AutomationElement element, int currentDepth, int maxDepth)
        {
            if (currentDepth >= maxDepth || element == null)
                return null;

            var children = new List<object>();
            var walker = TreeWalker.ControlViewWalker;
            var child = walker.GetFirstChild(element);

            while (child != null)
            {
                try
                {
                    var childTree = BuildUITree(child, currentDepth + 1, maxDepth);
                    if (childTree != null)
                        children.Add(childTree);
                }
                catch { }

                child = walker.GetNextSibling(child);
            }

            return new
            {
                name = element.Current.Name,
                className = element.Current.ClassName,
                automationId = element.Current.AutomationId,
                controlType = element.Current.ControlType.ProgrammaticName,
                isEnabled = element.Current.IsEnabled,
                children = children.Count > 0 ? children : null
            };
        }

        #endregion

        #region Process Management

        private Task<CompanionResponse> HandleProcessListAsync(CompanionRequest request)
        {
            try
            {
                var processes = Process.GetProcesses()
                    .Select(p => new
                    {
                        id = p.Id,
                        name = p.ProcessName,
                        title = GetProcessWindowTitle(p),
                        memory = p.WorkingSet64,
                        cpu = GetProcessCpuUsage(p),
                        threads = p.Threads.Count,
                        startTime = p.StartTime.ToString("o")
                    })
                    .ToList();

                return Task.FromResult(new CompanionResponse
                {
                    Success = true,
                    Data = JsonSerializer.SerializeToElement(new { processes })
                });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        private Task<CompanionResponse> HandleProcessStartAsync(CompanionRequest request)
        {
            try
            {
                var fileName = request.Parameters.GetProperty("file").GetString();
                var arguments = request.Parameters.TryGetProperty("args", out var argsProp) 
                    ? argsProp.GetString() : "";
                var workingDir = request.Parameters.TryGetProperty("cwd", out var cwdProp) 
                    ? cwdProp.GetString() : null;
                var visible = request.Parameters.TryGetProperty("visible", out var visProp) 
                    && visProp.GetBoolean();

                var effectiveDir = workingDir ?? Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);

                // Try launching in the user's interactive session first
                var (success, pid, error) = LaunchInUserSession(fileName, arguments, effectiveDir, visible);

                if (success)
                {
                    return Task.FromResult(new CompanionResponse
                    {
                        Success = true,
                        Data = JsonSerializer.SerializeToElement(new { processId = pid, interactiveSession = true })
                    });
                }

                // Fallback to standard Process.Start (Session 0) if interactive launch fails
                LogInfo($"Interactive launch failed ({error}), falling back to Session 0");

                var startInfo = new ProcessStartInfo
                {
                    FileName = fileName,
                    Arguments = arguments,
                    WorkingDirectory = effectiveDir,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true
                };

                var process = Process.Start(startInfo);
                if (process != null)
                {
                    _managedProcesses.TryAdd(process.Id, process);

                    return Task.FromResult(new CompanionResponse
                    {
                        Success = true,
                        Data = JsonSerializer.SerializeToElement(new { processId = process.Id, interactiveSession = false, fallbackReason = error })
                    });
                }

                return Task.FromResult(new CompanionResponse { Success = false, Error = "Failed to start process" });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        private Task<CompanionResponse> HandleProcessKillAsync(CompanionRequest request)
        {
            try
            {
                var processId = request.Parameters.GetProperty("id").GetInt32();

                var process = Process.GetProcessById(processId);
                process.Kill();
                process.WaitForExit(5000);

                _managedProcesses.TryRemove(processId, out _);

                return Task.FromResult(new CompanionResponse { Success = true });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        private Task<CompanionResponse> HandleProcessInfoAsync(CompanionRequest request)
        {
            try
            {
                var processId = request.Parameters.GetProperty("id").GetInt32();

                var process = Process.GetProcessById(processId);

                var info = new
                {
                    id = process.Id,
                    name = process.ProcessName,
                    title = GetProcessWindowTitle(process),
                    fileName = process.MainModule?.FileName,
                    memory = process.WorkingSet64,
                    cpu = GetProcessCpuUsage(process),
                    threads = process.Threads.Count,
                    handles = process.HandleCount,
                    startTime = process.StartTime.ToString("o"),
                    responding = process.Responding
                };

                return Task.FromResult(new CompanionResponse
                {
                    Success = true,
                    Data = JsonSerializer.SerializeToElement(info)
                });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        private string GetProcessWindowTitle(Process process)
        {
            try
            {
                return process.MainWindowTitle;
            }
            catch
            {
                return "";
            }
        }

        private double GetProcessCpuUsage(Process process)
        {
            try
            {
                var startTime = DateTime.UtcNow;
                var startCpuUsage = process.TotalProcessorTime;

                Thread.Sleep(100);

                var endTime = DateTime.UtcNow;
                var endCpuUsage = process.TotalProcessorTime;

                var cpuUsedMs = (endCpuUsage - startCpuUsage).TotalMilliseconds;
                var totalMsPassed = (endTime - startTime).TotalMilliseconds;
                var cpuUsageTotal = cpuUsedMs / (Environment.ProcessorCount * totalMsPassed);

                return cpuUsageTotal * 100;
            }
            catch
            {
                return 0;
            }
        }

        #endregion

        #region Interactive Session P/Invoke

        // Win32 APIs for launching processes in the user's interactive session
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern uint WTSGetActiveConsoleSessionId();

        [DllImport("wtsapi32.dll", SetLastError = true)]
        private static extern bool WTSQueryUserToken(uint sessionId, out IntPtr phToken);

        [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Auto)]
        private static extern bool DuplicateTokenEx(
            IntPtr hExistingToken,
            uint dwDesiredAccess,
            IntPtr lpTokenAttributes,
            int ImpersonationLevel,
            int TokenType,
            out IntPtr phNewToken);

        [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern bool CreateProcessAsUser(
            IntPtr hToken,
            string lpApplicationName,
            string lpCommandLine,
            IntPtr lpProcessAttributes,
            IntPtr lpThreadAttributes,
            bool bInheritHandles,
            uint dwCreationFlags,
            IntPtr lpEnvironment,
            string lpCurrentDirectory,
            ref STARTUPINFO lpStartupInfo,
            out PROCESS_INFORMATION lpProcessInformation);

        [DllImport("userenv.dll", SetLastError = true)]
        private static extern bool CreateEnvironmentBlock(out IntPtr lpEnvironment, IntPtr hToken, bool bInherit);

        [DllImport("userenv.dll", SetLastError = true)]
        private static extern bool DestroyEnvironmentBlock(IntPtr lpEnvironment);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CloseHandle(IntPtr hObject);

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct STARTUPINFO
        {
            public int cb;
            public string lpReserved;
            public string lpDesktop;
            public string lpTitle;
            public int dwX;
            public int dwY;
            public int dwXSize;
            public int dwYSize;
            public int dwXCountChars;
            public int dwYCountChars;
            public int dwFillAttribute;
            public int dwFlags;
            public short wShowWindow;
            public short cbReserved2;
            public IntPtr lpReserved2;
            public IntPtr hStdInput;
            public IntPtr hStdOutput;
            public IntPtr hStdError;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct PROCESS_INFORMATION
        {
            public IntPtr hProcess;
            public IntPtr hThread;
            public int dwProcessId;
            public int dwThreadId;
        }

        private const uint TOKEN_ALL_ACCESS = 0x000F01FF;
        private const int SecurityImpersonation = 2;
        private const int TokenPrimary = 1;
        private const uint CREATE_UNICODE_ENVIRONMENT = 0x00000400;
        private const uint CREATE_NEW_CONSOLE = 0x00000010;
        private const uint CREATE_NO_WINDOW = 0x08000000;

        /// <summary>
        /// Launch a process in the active user's interactive desktop session.
        /// Falls back to Process.Start if session APIs fail (e.g., no user logged in).
        /// </summary>
        private (bool success, int processId, string error) LaunchInUserSession(
            string fileName, string arguments, string workingDirectory, bool createWindow)
        {
            IntPtr userToken = IntPtr.Zero;
            IntPtr duplicatedToken = IntPtr.Zero;
            IntPtr environment = IntPtr.Zero;

            try
            {
                // Get the active console session (the logged-in user's session)
                uint sessionId = WTSGetActiveConsoleSessionId();
                if (sessionId == 0xFFFFFFFF)
                {
                    return (false, 0, "No active user session found");
                }

                // Get the user's token from that session
                if (!WTSQueryUserToken(sessionId, out userToken))
                {
                    int error = Marshal.GetLastWin32Error();
                    return (false, 0, $"WTSQueryUserToken failed (error {error}). Is a user logged in?");
                }

                // Duplicate the token as a primary token for CreateProcessAsUser
                if (!DuplicateTokenEx(userToken, TOKEN_ALL_ACCESS, IntPtr.Zero,
                    SecurityImpersonation, TokenPrimary, out duplicatedToken))
                {
                    int error = Marshal.GetLastWin32Error();
                    return (false, 0, $"DuplicateTokenEx failed (error {error})");
                }

                // Create the user's environment block
                if (!CreateEnvironmentBlock(out environment, duplicatedToken, false))
                {
                    int error = Marshal.GetLastWin32Error();
                    return (false, 0, $"CreateEnvironmentBlock failed (error {error})");
                }

                // Set up startup info targeting the interactive desktop
                var si = new STARTUPINFO();
                si.cb = Marshal.SizeOf(si);
                si.lpDesktop = @"winsta0\default";  // The interactive desktop

                // Build the command line
                string commandLine = string.IsNullOrEmpty(arguments)
                    ? $"\"{fileName}\""
                    : $"\"{fileName}\" {arguments}";

                uint creationFlags = CREATE_UNICODE_ENVIRONMENT;
                if (createWindow)
                    creationFlags |= CREATE_NEW_CONSOLE;
                else
                    creationFlags |= CREATE_NO_WINDOW;

                // Launch the process in the user's session
                PROCESS_INFORMATION pi;
                bool result = CreateProcessAsUser(
                    duplicatedToken,
                    null!,
                    commandLine,
                    IntPtr.Zero,
                    IntPtr.Zero,
                    false,
                    creationFlags,
                    environment,
                    workingDirectory,
                    ref si,
                    out pi);

                if (!result)
                {
                    int error = Marshal.GetLastWin32Error();
                    return (false, 0, $"CreateProcessAsUser failed (error {error})");
                }

                // Close handles we don't need
                CloseHandle(pi.hProcess);
                CloseHandle(pi.hThread);

                LogInfo($"Launched process in user session {sessionId}: PID={pi.dwProcessId} cmd={commandLine}");
                return (true, pi.dwProcessId, (string?)null);
            }
            finally
            {
                if (environment != IntPtr.Zero) DestroyEnvironmentBlock(environment);
                if (duplicatedToken != IntPtr.Zero) CloseHandle(duplicatedToken);
                if (userToken != IntPtr.Zero) CloseHandle(userToken);
            }
        }

        #endregion

        #region Screen Operations

        [DllImport("user32.dll")]
        private static extern IntPtr GetDC(IntPtr hwnd);

        [DllImport("user32.dll")]
        private static extern int ReleaseDC(IntPtr hwnd, IntPtr hdc);

        [DllImport("gdi32.dll")]
        private static extern uint GetPixel(IntPtr hdc, int nXPos, int nYPos);

        private Task<CompanionResponse> HandleScreenCaptureAsync(CompanionRequest request)
        {
            try
            {
                var screen = request.Parameters.TryGetProperty("screen", out var screenProp) 
                    ? screenProp.GetInt32() : 0;
                var x = request.Parameters.TryGetProperty("x", out var xProp) ? xProp.GetInt32() : 0;
                var y = request.Parameters.TryGetProperty("y", out var yProp) ? yProp.GetInt32() : 0;
                var width = request.Parameters.TryGetProperty("width", out var wProp) 
                    ? wProp.GetInt32() : Screen.AllScreens[screen].Bounds.Width;
                var height = request.Parameters.TryGetProperty("height", out var hProp) 
                    ? hProp.GetInt32() : Screen.AllScreens[screen].Bounds.Height;

                var bounds = new Rectangle(x, y, width, height);
                using var bitmap = new Bitmap(bounds.Width, bounds.Height);
                using var g = Graphics.FromImage(bitmap);
                
                g.CopyFromScreen(bounds.Location, Point.Empty, bounds.Size);

                using var ms = new MemoryStream();
                bitmap.Save(ms, ImageFormat.Png);
                var base64 = Convert.ToBase64String(ms.ToArray());

                return Task.FromResult(new CompanionResponse
                {
                    Success = true,
                    Data = JsonSerializer.SerializeToElement(new { image = base64, format = "png" })
                });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        private Task<CompanionResponse> HandleScreenListAsync(CompanionRequest request)
        {
            try
            {
                var screens = Screen.AllScreens.Select((s, i) => new
                {
                    index = i,
                    primary = s.Primary,
                    bounds = new { x = s.Bounds.X, y = s.Bounds.Y, width = s.Bounds.Width, height = s.Bounds.Height },
                    workingArea = new { x = s.WorkingArea.X, y = s.WorkingArea.Y, width = s.WorkingArea.Width, height = s.WorkingArea.Height },
                    bitsPerPixel = s.BitsPerPixel,
                    deviceName = s.DeviceName
                }).ToList();

                return Task.FromResult(new CompanionResponse
                {
                    Success = true,
                    Data = JsonSerializer.SerializeToElement(new { screens })
                });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        private Task<CompanionResponse> HandleScreenInfoAsync(CompanionRequest request)
        {
            try
            {
                var screen = request.Parameters.TryGetProperty("screen", out var screenProp) 
                    ? screenProp.GetInt32() : 0;

                var s = Screen.AllScreens[screen];

                var info = new
                {
                    index = screen,
                    primary = s.Primary,
                    bounds = new { x = s.Bounds.X, y = s.Bounds.Y, width = s.Bounds.Width, height = s.Bounds.Height },
                    workingArea = new { x = s.WorkingArea.X, y = s.WorkingArea.Y, width = s.WorkingArea.Width, height = s.WorkingArea.Height },
                    bitsPerPixel = s.BitsPerPixel,
                    deviceName = s.DeviceName
                };

                return Task.FromResult(new CompanionResponse
                {
                    Success = true,
                    Data = JsonSerializer.SerializeToElement(info)
                });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        #endregion

        #region Audio Operations

        private Task<CompanionResponse> HandleAudioDevicesAsync(CompanionRequest request)
        {
            try
            {
                var inputDevices = new List<object>();
                var outputDevices = new List<object>();

                // Input devices
                for (int i = 0; i < WaveIn.DeviceCount; i++)
                {
                    var caps = WaveIn.GetCapabilities(i);
                    inputDevices.Add(new
                    {
                        index = i,
                        name = caps.ProductName,
                        channels = caps.Channels
                    });
                }

                // Output devices
                for (int i = 0; i < WaveOut.DeviceCount; i++)
                {
                    var caps = WaveOut.GetCapabilities(i);
                    outputDevices.Add(new
                    {
                        index = i,
                        name = caps.ProductName,
                        channels = caps.Channels
                    });
                }

                return Task.FromResult(new CompanionResponse
                {
                    Success = true,
                    Data = JsonSerializer.SerializeToElement(new { input = inputDevices, output = outputDevices })
                });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        private Task<CompanionResponse> HandleAudioRecordStartAsync(CompanionRequest request)
        {
            try
            {
                var deviceIndex = request.Parameters.TryGetProperty("device", out var devProp) 
                    ? devProp.GetInt32() : 0;
                var sampleRate = request.Parameters.TryGetProperty("sampleRate", out var rateProp) 
                    ? rateProp.GetInt32() : 44100;
                var channels = request.Parameters.TryGetProperty("channels", out var chanProp) 
                    ? chanProp.GetInt32() : 1;

                _audioIn?.Dispose();
                _audioIn = new WaveInEvent
                {
                    DeviceNumber = deviceIndex,
                    WaveFormat = new WaveFormat(sampleRate, channels)
                };

                var outputFile = Path.Combine(Path.GetTempPath(), $"openclaw_audio_{Guid.NewGuid()}.wav");
                var writer = new WaveFileWriter(outputFile, _audioIn.WaveFormat);

                _audioIn.DataAvailable += (s, e) =>
                {
                    writer.Write(e.Buffer, 0, e.BytesRecorded);
                };

                _audioIn.RecordingStopped += (s, e) =>
                {
                    writer?.Dispose();
                };

                _managedResources.TryAdd("audio_writer", writer);
                _audioIn.StartRecording();

                return Task.FromResult(new CompanionResponse
                {
                    Success = true,
                    Data = JsonSerializer.SerializeToElement(new { outputFile })
                });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        private Task<CompanionResponse> HandleAudioRecordStopAsync(CompanionRequest request)
        {
            try
            {
                _audioIn?.StopRecording();
                _audioIn?.Dispose();
                _audioIn = null;

                if (_managedResources.TryRemove("audio_writer", out var writer))
                {
                    writer?.Dispose();
                }

                return Task.FromResult(new CompanionResponse { Success = true });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        private Task<CompanionResponse> HandleAudioPlayAsync(CompanionRequest request)
        {
            try
            {
                var filePath = request.Parameters.GetProperty("file").GetString();
                var deviceIndex = request.Parameters.TryGetProperty("device", out var devProp) 
                    ? devProp.GetInt32() : 0;

                if (!File.Exists(filePath))
                    return Task.FromResult(new CompanionResponse { Success = false, Error = "File not found" });

                _audioOut?.Dispose();
                _audioOut = new WaveOutEvent { DeviceNumber = deviceIndex };

                var reader = new WaveFileReader(filePath);
                _audioOut.Init(reader);
                _audioOut.Play();

                _managedResources.TryAdd("audio_reader", reader);

                return Task.FromResult(new CompanionResponse { Success = true });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        #endregion

        #region System Operations

        private Task<CompanionResponse> HandleWMIQueryAsync(CompanionRequest request)
        {
            try
            {
                var query = request.Parameters.GetProperty("query").GetString();
                var scope = request.Parameters.TryGetProperty("scope", out var scopeProp) 
                    ? scopeProp.GetString() : @"\\.\root\cimv2";

                var results = new List<Dictionary<string, object>>();

                using var searcher = new ManagementObjectSearcher(scope, query);
                using var collection = searcher.Get();

                foreach (ManagementObject obj in collection)
                {
                    var item = new Dictionary<string, object>();
                    foreach (PropertyData prop in obj.Properties)
                    {
                        item[prop.Name] = prop.Value;
                    }
                    results.Add(item);
                }

                return Task.FromResult(new CompanionResponse
                {
                    Success = true,
                    Data = JsonSerializer.SerializeToElement(new { results })
                });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        private Task<CompanionResponse> HandleServiceListAsync(CompanionRequest request)
        {
            try
            {
                var services = ServiceController.GetServices()
                    .Select(s => new
                    {
                        name = s.ServiceName,
                        displayName = s.DisplayName,
                        status = s.Status.ToString(),
                        startType = s.StartType.ToString()
                    })
                    .ToList();

                return Task.FromResult(new CompanionResponse
                {
                    Success = true,
                    Data = JsonSerializer.SerializeToElement(new { services })
                });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        private Task<CompanionResponse> HandleServiceControlAsync(CompanionRequest request)
        {
            try
            {
                var serviceName = request.Parameters.GetProperty("name").GetString();
                var action = request.Parameters.GetProperty("action").GetString();

                using var service = new ServiceController(serviceName);

                switch (action?.ToLower())
                {
                    case "start":
                        service.Start();
                        service.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(30));
                        break;
                    case "stop":
                        service.Stop();
                        service.WaitForStatus(ServiceControllerStatus.Stopped, TimeSpan.FromSeconds(30));
                        break;
                    case "restart":
                        if (service.Status == ServiceControllerStatus.Running)
                        {
                            service.Stop();
                            service.WaitForStatus(ServiceControllerStatus.Stopped, TimeSpan.FromSeconds(30));
                        }
                        service.Start();
                        service.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(30));
                        break;
                    default:
                        return Task.FromResult(new CompanionResponse { Success = false, Error = $"Unknown action: {action}" });
                }

                return Task.FromResult(new CompanionResponse { Success = true });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        private Task<CompanionResponse> HandleSystemInfoAsync(CompanionRequest request)
        {
            try
            {
                var info = new
                {
                    machineName = Environment.MachineName,
                    osVersion = Environment.OSVersion.ToString(),
                    is64Bit = Environment.Is64BitOperatingSystem,
                    processorCount = Environment.ProcessorCount,
                    systemDirectory = Environment.SystemDirectory,
                    userName = Environment.UserName,
                    userDomainName = Environment.UserDomainName,
                    isAdministrator = IsAdministrator(),
                    clusterEnabled = _clusterEnabled,
                    gatewayId = _gatewayId,
                    nodeId = _nodeId
                };

                return Task.FromResult(new CompanionResponse
                {
                    Success = true,
                    Data = JsonSerializer.SerializeToElement(info)
                });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        private bool IsAdministrator()
        {
            try
            {
                using var identity = WindowsIdentity.GetCurrent();
                var principal = new WindowsPrincipal(identity);
                return principal.IsInRole(WindowsBuiltInRole.Administrator);
            }
            catch
            {
                return false;
            }
        }

        #endregion

        #region Health Monitoring

        private async Task HealthMonitorAsync(CancellationToken cancellationToken)
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                try
                {
                    await Task.Delay(60000, cancellationToken); // Every minute

                    // Cleanup dead processes
                    foreach (var kvp in _managedProcesses.ToArray())
                    {
                        try
                        {
                            if (kvp.Value.HasExited)
                            {
                                _managedProcesses.TryRemove(kvp.Key, out var proc);
                                proc?.Dispose();
                            }
                        }
                        catch
                        {
                            _managedProcesses.TryRemove(kvp.Key, out _);
                        }
                    }

                    // Log health status
                    LogInfo($"Health: {_activePipes.Count} active connections, {_managedProcesses.Count} managed processes");
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    LogError($"Health monitor error: {ex.Message}", ex);
                }
            }
        }

        private Task<CompanionResponse> HandleHealthCheckAsync(CompanionRequest request)
        {
            try
            {
                var health = new
                {
                    status = "healthy",
                    uptime = (DateTime.UtcNow - Process.GetCurrentProcess().StartTime.ToUniversalTime()).TotalSeconds,
                    activeConnections = _activePipes.Count,
                    managedProcesses = _managedProcesses.Count,
                    managedResources = _managedResources.Count,
                    clusterEnabled = _clusterEnabled,
                    clusterConnected = _redis?.IsConnected ?? false,
                    memory = GC.GetTotalMemory(false),
                    gcCollections = new
                    {
                        gen0 = GC.CollectionCount(0),
                        gen1 = GC.CollectionCount(1),
                        gen2 = GC.CollectionCount(2)
                    }
                };

                return Task.FromResult(new CompanionResponse
                {
                    Success = true,
                    Data = JsonSerializer.SerializeToElement(health)
                });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        #endregion

        #region Logging

        private void LogInfo(string message)
        {
            try
            {
                EventLog.WriteEntry(_serviceName, message, EventLogEntryType.Information);
            }
            catch { }
        }

        private void LogError(string message, Exception? ex = null)
        {
            try
            {
                var fullMessage = ex != null ? $"{message}\n{ex.StackTrace}" : message;
                EventLog.WriteEntry(_serviceName, fullMessage, EventLogEntryType.Error);
            }
            catch { }
        }

        #endregion

        #region PowerShell Operations

        private async Task<CompanionResponse> HandlePowerShellExecuteAsync(CompanionRequest request)
        {
            try
            {
                var script = request.Parameters.GetProperty("script").GetString();
                var asAdmin = request.Parameters.TryGetProperty("admin", out var adminProp) && adminProp.GetBoolean();
                var timeoutMs = request.Parameters.TryGetProperty("timeout", out var toProp) ? toProp.GetInt32() : 30000;

                var escapedScript = script.Replace("\"", "\\\"");
                var psi = new ProcessStartInfo
                {
                    FileName = "powershell.exe",
                    Arguments = $"-NoProfile -NonInteractive -ExecutionPolicy Bypass -Command \"{escapedScript}\"",
                    UseShellExecute = asAdmin,
                    RedirectStandardOutput = !asAdmin,
                    RedirectStandardError = !asAdmin,
                    CreateNoWindow = true,
                    Verb = asAdmin ? "runas" : null
                };

                using var process = Process.Start(psi);
                if (process == null)
                    return new CompanionResponse { Success = false, Error = "Failed to start PowerShell" };

                string stdout = "", stderr = "";
                if (!asAdmin)
                {
                    stdout = await process.StandardOutput.ReadToEndAsync();
                    stderr = await process.StandardError.ReadToEndAsync();
                }

                process.WaitForExit(timeoutMs);

                var result = new { exitCode = process.ExitCode, stdout, stderr };
                return new CompanionResponse
                {
                    Success = process.ExitCode == 0,
                    Data = JsonSerializer.SerializeToElement(result)
                };
            }
            catch (Exception ex)
            {
                return new CompanionResponse { Success = false, Error = ex.Message };
            }
        }

        private async Task<CompanionResponse> HandlePowerShellRemotingAsync(CompanionRequest request)
        {
            try
            {
                var computerName = request.Parameters.GetProperty("computer").GetString();
                var script = request.Parameters.GetProperty("script").GetString();

                var wrappedScript = $"Invoke-Command -ComputerName {computerName} -ScriptBlock {{ {script} }}";
                request = new CompanionRequest
                {
                    Command = "powershell.execute",
                    Parameters = JsonSerializer.SerializeToElement(new { script = wrappedScript, admin = false })
                };

                return await HandlePowerShellExecuteAsync(request);
            }
            catch (Exception ex)
            {
                return new CompanionResponse { Success = false, Error = ex.Message };
            }
        }

        #endregion

        #region Registry Operations

        private Task<CompanionResponse> HandleRegistryReadAsync(CompanionRequest request)
        {
            try
            {
                var path = request.Parameters.GetProperty("path").GetString();
                var valueName = request.Parameters.TryGetProperty("name", out var nameProp) ? nameProp.GetString() : null;

                using var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(path)
                    ?? Microsoft.Win32.Registry.CurrentUser.OpenSubKey(path);

                if (key == null)
                    return Task.FromResult(new CompanionResponse { Success = false, Error = $"Registry key not found: {path}" });

                if (valueName != null)
                {
                    var value = key.GetValue(valueName);
                    var result = new { name = valueName, value = value?.ToString(), kind = key.GetValueKind(valueName).ToString() };
                    return Task.FromResult(new CompanionResponse { Success = true, Data = JsonSerializer.SerializeToElement(result) });
                }
                else
                {
                    var values = key.GetValueNames().Select(n => new
                    {
                        name = n,
                        value = key.GetValue(n)?.ToString(),
                        kind = key.GetValueKind(n).ToString()
                    }).ToArray();
                    var subKeys = key.GetSubKeyNames();
                    var result = new { values, subKeys };
                    return Task.FromResult(new CompanionResponse { Success = true, Data = JsonSerializer.SerializeToElement(result) });
                }
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        private Task<CompanionResponse> HandleRegistryWriteAsync(CompanionRequest request)
        {
            try
            {
                var path = request.Parameters.GetProperty("path").GetString();
                var valueName = request.Parameters.GetProperty("name").GetString();
                var value = request.Parameters.GetProperty("value").GetString();
                var kindStr = request.Parameters.TryGetProperty("kind", out var kindProp) ? kindProp.GetString() : "String";

                var kind = Enum.Parse<Microsoft.Win32.RegistryValueKind>(kindStr, true);
                using var key = Microsoft.Win32.Registry.LocalMachine.CreateSubKey(path, true)
                    ?? Microsoft.Win32.Registry.CurrentUser.CreateSubKey(path, true);

                key.SetValue(valueName, value, kind);
                return Task.FromResult(new CompanionResponse { Success = true });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        #endregion

        #region Environment Variables

        private Task<CompanionResponse> HandleEnvGetAsync(CompanionRequest request)
        {
            try
            {
                var name = request.Parameters.GetProperty("name").GetString();
                var targetStr = request.Parameters.TryGetProperty("target", out var tProp) ? tProp.GetString() : "process";
                var target = targetStr?.ToLower() switch
                {
                    "machine" => EnvironmentVariableTarget.Machine,
                    "user" => EnvironmentVariableTarget.User,
                    _ => EnvironmentVariableTarget.Process
                };

                var value = Environment.GetEnvironmentVariable(name, target);
                var result = new { name, value, target = target.ToString() };
                return Task.FromResult(new CompanionResponse { Success = true, Data = JsonSerializer.SerializeToElement(result) });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        private Task<CompanionResponse> HandleEnvSetAsync(CompanionRequest request)
        {
            try
            {
                var name = request.Parameters.GetProperty("name").GetString();
                var value = request.Parameters.GetProperty("value").GetString();
                var targetStr = request.Parameters.TryGetProperty("target", out var tProp) ? tProp.GetString() : "user";
                var target = targetStr?.ToLower() switch
                {
                    "machine" => EnvironmentVariableTarget.Machine,
                    "process" => EnvironmentVariableTarget.Process,
                    _ => EnvironmentVariableTarget.User
                };

                Environment.SetEnvironmentVariable(name, value, target);
                return Task.FromResult(new CompanionResponse { Success = true });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        #endregion

        #region Firewall and Task Scheduler

        private async Task<CompanionResponse> HandleFirewallRuleAsync(CompanionRequest request)
        {
            try
            {
                var action = request.Parameters.GetProperty("action").GetString(); // add, remove, list
                var name = request.Parameters.TryGetProperty("name", out var nProp) ? nProp.GetString() : null;
                var port = request.Parameters.TryGetProperty("port", out var pProp) ? pProp.GetInt32() : 0;
                var direction = request.Parameters.TryGetProperty("direction", out var dProp) ? dProp.GetString() : "Inbound";
                var ruleAction = request.Parameters.TryGetProperty("ruleAction", out var raProp) ? raProp.GetString() : "Allow";

                string script = action?.ToLower() switch
                {
                    "add" => $"New-NetFirewallRule -DisplayName '{name}' -Direction {direction} -Action {ruleAction} -LocalPort {port} -Protocol TCP",
                    "remove" => $"Remove-NetFirewallRule -DisplayName '{name}'",
                    "list" => "Get-NetFirewallRule | Select-Object DisplayName,Direction,Action,Enabled | ConvertTo-Json",
                    _ => throw new ArgumentException($"Unknown firewall action: {action}")
                };

                var psRequest = new CompanionRequest
                {
                    Command = "powershell.execute",
                    Parameters = JsonSerializer.SerializeToElement(new { script, admin = true })
                };
                return await HandlePowerShellExecuteAsync(psRequest);
            }
            catch (Exception ex)
            {
                return new CompanionResponse { Success = false, Error = ex.Message };
            }
        }

        private async Task<CompanionResponse> HandleTaskScheduleAsync(CompanionRequest request)
        {
            try
            {
                var action = request.Parameters.GetProperty("action").GetString(); // create, delete, list
                var taskName = request.Parameters.TryGetProperty("name", out var nProp) ? nProp.GetString() : null;

                string script = action?.ToLower() switch
                {
                    "create" =>
                        $"$action = New-ScheduledTaskAction -Execute '{request.Parameters.GetProperty("execute").GetString()}'" +
                        (request.Parameters.TryGetProperty("arguments", out var argProp) ? $" -Argument '{argProp.GetString()}'" : "") +
                        $"; $trigger = New-ScheduledTaskTrigger -{request.Parameters.GetProperty("trigger").GetString()}" +
                        $"; Register-ScheduledTask -TaskName '{taskName}' -Action $action -Trigger $trigger -Force",
                    "delete" => $"Unregister-ScheduledTask -TaskName '{taskName}' -Confirm:$false",
                    "list" => "Get-ScheduledTask | Select-Object TaskName,State,LastRunTime | ConvertTo-Json",
                    _ => throw new ArgumentException($"Unknown scheduler action: {action}")
                };

                var psRequest = new CompanionRequest
                {
                    Command = "powershell.execute",
                    Parameters = JsonSerializer.SerializeToElement(new { script, admin = true })
                };
                return await HandlePowerShellExecuteAsync(psRequest);
            }
            catch (Exception ex)
            {
                return new CompanionResponse { Success = false, Error = ex.Message };
            }
        }

        #endregion

        #region Hardware Info

        private async Task<CompanionResponse> HandleHardwareGpuAsync(CompanionRequest request)
        {
            return await WmiQueryToResponse("SELECT Name,AdapterRAM,DriverVersion,Status FROM Win32_VideoController");
        }

        private async Task<CompanionResponse> HandleHardwareDiskAsync(CompanionRequest request)
        {
            return await WmiQueryToResponse("SELECT DeviceID,Size,FreeSpace,FileSystem,VolumeName FROM Win32_LogicalDisk WHERE DriveType=3");
        }

        private async Task<CompanionResponse> HandleHardwareNetworkAsync(CompanionRequest request)
        {
            return await WmiQueryToResponse("SELECT Name,MACAddress,Speed,NetConnectionStatus FROM Win32_NetworkAdapter WHERE NetConnectionStatus IS NOT NULL");
        }

        private async Task<CompanionResponse> HandleHardwareMemoryAsync(CompanionRequest request)
        {
            return await WmiQueryToResponse("SELECT TotalVisibleMemorySize,FreePhysicalMemory FROM Win32_OperatingSystem");
        }

        private async Task<CompanionResponse> HandleHardwareBatteryAsync(CompanionRequest request)
        {
            return await WmiQueryToResponse("SELECT EstimatedChargeRemaining,BatteryStatus,EstimatedRunTime FROM Win32_Battery");
        }

        private async Task<CompanionResponse> HandleDisplayBrightnessAsync(CompanionRequest request)
        {
            try
            {
                var set = request.Parameters.TryGetProperty("level", out var levelProp);
                if (set)
                {
                    var level = levelProp.GetInt32();
                    var wmiScript = $"(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1,{level})";
                    var psRequest = new CompanionRequest
                    {
                        Command = "powershell.execute",
                        Parameters = JsonSerializer.SerializeToElement(new { script = wmiScript, admin = false })
                    };
                    return await HandlePowerShellExecuteAsync(psRequest);
                }
                else
                {
                    return await WmiQueryToResponse("SELECT CurrentBrightness FROM WmiMonitorBrightness", "root\\WMI");
                }
            }
            catch (Exception ex)
            {
                return new CompanionResponse { Success = false, Error = ex.Message };
            }
        }

        private Task<CompanionResponse> WmiQueryToResponse(string query, string scope = "root\\CIMV2")
        {
            try
            {
                var searcher = new ManagementObjectSearcher(scope, query);
                var results = new List<Dictionary<string, object>>();

                foreach (ManagementObject obj in searcher.Get())
                {
                    var dict = new Dictionary<string, object>();
                    foreach (var prop in obj.Properties)
                    {
                        dict[prop.Name] = prop.Value;
                    }
                    results.Add(dict);
                }

                return Task.FromResult(new CompanionResponse
                {
                    Success = true,
                    Data = JsonSerializer.SerializeToElement(results)
                });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        #endregion

        #region File Operations

        private Task<CompanionResponse> HandleFileReadAsync(CompanionRequest request)
        {
            try
            {
                var path = request.Parameters.GetProperty("path").GetString();
                if (!File.Exists(path))
                    return Task.FromResult(new CompanionResponse { Success = false, Error = $"File not found: {path}" });

                var content = File.ReadAllText(path);
                var result = new { path, size = new FileInfo(path).Length, content };
                return Task.FromResult(new CompanionResponse { Success = true, Data = JsonSerializer.SerializeToElement(result) });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        private Task<CompanionResponse> HandleFileWriteAsync(CompanionRequest request)
        {
            try
            {
                var path = request.Parameters.GetProperty("path").GetString();
                var content = request.Parameters.GetProperty("content").GetString();
                var append = request.Parameters.TryGetProperty("append", out var appProp) && appProp.GetBoolean();

                if (append)
                    File.AppendAllText(path, content);
                else
                    File.WriteAllText(path, content);

                return Task.FromResult(new CompanionResponse { Success = true });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        private Task<CompanionResponse> HandleFileListAsync(CompanionRequest request)
        {
            try
            {
                var path = request.Parameters.GetProperty("path").GetString();
                if (!Directory.Exists(path))
                    return Task.FromResult(new CompanionResponse { Success = false, Error = $"Directory not found: {path}" });

                var entries = Directory.GetFileSystemEntries(path).Select(e =>
                {
                    var isDir = Directory.Exists(e);
                    var info = isDir ? null : new FileInfo(e);
                    return new
                    {
                        name = Path.GetFileName(e),
                        path = e,
                        isDirectory = isDir,
                        size = info?.Length ?? 0,
                        modified = (isDir ? Directory.GetLastWriteTimeUtc(e) : info.LastWriteTimeUtc).ToString("o")
                    };
                }).ToArray();

                return Task.FromResult(new CompanionResponse { Success = true, Data = JsonSerializer.SerializeToElement(entries) });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        private Task<CompanionResponse> HandleFileSearchAsync(CompanionRequest request)
        {
            try
            {
                var directory = request.Parameters.GetProperty("directory").GetString();
                var pattern = request.Parameters.TryGetProperty("pattern", out var patProp) ? patProp.GetString() : "*";
                var recursive = request.Parameters.TryGetProperty("recursive", out var recProp) && recProp.GetBoolean();
                var maxResults = request.Parameters.TryGetProperty("max", out var maxProp) ? maxProp.GetInt32() : 100;

                var options = recursive ? SearchOption.AllDirectories : SearchOption.TopDirectoryOnly;
                var files = Directory.GetFiles(directory, pattern, options)
                    .Take(maxResults)
                    .Select(f => new { path = f, name = Path.GetFileName(f), size = new FileInfo(f).Length })
                    .ToArray();

                return Task.FromResult(new CompanionResponse { Success = true, Data = JsonSerializer.SerializeToElement(files) });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        #endregion

        #region Clipboard

        private Task<CompanionResponse> HandleClipboardGetAsync(CompanionRequest request)
        {
            try
            {
                string text = null;
                var thread = new Thread(() =>
                {
                    if (System.Windows.Forms.Clipboard.ContainsText())
                        text = System.Windows.Forms.Clipboard.GetText();
                });
                thread.SetApartmentState(ApartmentState.STA);
                thread.Start();
                thread.Join(5000);

                var result = new { text, hasText = text != null };
                return Task.FromResult(new CompanionResponse { Success = true, Data = JsonSerializer.SerializeToElement(result) });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        private Task<CompanionResponse> HandleClipboardSetAsync(CompanionRequest request)
        {
            try
            {
                var text = request.Parameters.GetProperty("text").GetString();
                var thread = new Thread(() =>
                {
                    System.Windows.Forms.Clipboard.SetText(text);
                });
                thread.SetApartmentState(ApartmentState.STA);
                thread.Start();
                thread.Join(5000);

                return Task.FromResult(new CompanionResponse { Success = true });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        #endregion

        #region Window Management

        [DllImport("user32.dll")]
        private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
        private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        [DllImport("user32.dll")]
        private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

        [DllImport("user32.dll")]
        private static extern int GetWindowTextLength(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool IsWindowVisible(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        [DllImport("user32.dll")]
        private static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);

        [DllImport("user32.dll")]
        private static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

        [DllImport("user32.dll")]
        private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

        [StructLayout(LayoutKind.Sequential)]
        private struct RECT { public int Left, Top, Right, Bottom; }

        private const int SW_MINIMIZE = 6;
        private const int SW_MAXIMIZE = 3;
        private const int SW_RESTORE = 9;

        private Task<CompanionResponse> HandleWindowListAsync(CompanionRequest request)
        {
            try
            {
                var windows = new List<object>();
                EnumWindows((hWnd, lParam) =>
                {
                    if (!IsWindowVisible(hWnd)) return true;
                    var length = GetWindowTextLength(hWnd);
                    if (length == 0) return true;

                    var sb = new StringBuilder(length + 1);
                    GetWindowText(hWnd, sb, sb.Capacity);
                    GetWindowRect(hWnd, out RECT rect);
                    GetWindowThreadProcessId(hWnd, out uint pid);

                    windows.Add(new
                    {
                        handle = hWnd.ToInt64(),
                        title = sb.ToString(),
                        pid = (int)pid,
                        x = rect.Left,
                        y = rect.Top,
                        width = rect.Right - rect.Left,
                        height = rect.Bottom - rect.Top
                    });
                    return true;
                }, IntPtr.Zero);

                return Task.FromResult(new CompanionResponse { Success = true, Data = JsonSerializer.SerializeToElement(windows) });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        private Task<CompanionResponse> HandleWindowFocusAsync(CompanionRequest request)
        {
            try
            {
                var handle = new IntPtr(request.Parameters.GetProperty("handle").GetInt64());
                ShowWindow(handle, SW_RESTORE);
                SetForegroundWindow(handle);
                return Task.FromResult(new CompanionResponse { Success = true });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        private Task<CompanionResponse> HandleWindowResizeAsync(CompanionRequest request)
        {
            try
            {
                var handle = new IntPtr(request.Parameters.GetProperty("handle").GetInt64());
                var x = request.Parameters.GetProperty("x").GetInt32();
                var y = request.Parameters.GetProperty("y").GetInt32();
                var w = request.Parameters.GetProperty("width").GetInt32();
                var h = request.Parameters.GetProperty("height").GetInt32();

                MoveWindow(handle, x, y, w, h, true);
                return Task.FromResult(new CompanionResponse { Success = true });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        private Task<CompanionResponse> HandleWindowMinimizeAsync(CompanionRequest request)
        {
            try
            {
                var handle = new IntPtr(request.Parameters.GetProperty("handle").GetInt64());
                var action = request.Parameters.TryGetProperty("action", out var actProp) ? actProp.GetString() : "minimize";

                int cmd = action?.ToLower() switch
                {
                    "maximize" => SW_MAXIMIZE,
                    "restore" => SW_RESTORE,
                    _ => SW_MINIMIZE
                };

                ShowWindow(handle, cmd);
                return Task.FromResult(new CompanionResponse { Success = true });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        // ── Additional Window P/Invoke ──────────────────────────────────

        [DllImport("user32.dll")]
        private static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

        [DllImport("user32.dll", CharSet = CharSet.Auto)]
        private static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

        [DllImport("user32.dll")]
        private static extern bool SetLayeredWindowAttributes(IntPtr hwnd, uint crKey, byte bAlpha, uint dwFlags);

        [DllImport("user32.dll")]
        private static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);

        [DllImport("user32.dll")]
        private static extern int GetWindowLong(IntPtr hWnd, int nIndex);

        [DllImport("user32.dll", CharSet = CharSet.Auto)]
        private static extern bool SetWindowText(IntPtr hWnd, string lpString);

        [DllImport("user32.dll")]
        private static extern bool LockWorkStation();

        [DllImport("PowrProf.dll", SetLastError = true)]
        private static extern bool SetSuspendState(bool hibernate, bool forceCritical, bool disableWakeEvent);

        private static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
        private static readonly IntPtr HWND_NOTOPMOST = new IntPtr(-2);
        private const uint SWP_NOMOVE = 0x0002;
        private const uint SWP_NOSIZE = 0x0001;
        private const uint SWP_NOACTIVATE = 0x0010;
        private const int GWL_EXSTYLE = -20;
        private const int WS_EX_LAYERED = 0x80000;
        private const uint LWA_ALPHA = 0x2;
        private const uint WM_CLOSE = 0x0010;
        private const int SW_SHOW = 5;
        private const int SW_HIDE = 0;

        private Task<CompanionResponse> HandleWindowCloseAsync(CompanionRequest request)
        {
            try
            {
                var handle = new IntPtr(request.Parameters.GetProperty("handle").GetInt64());
                SendMessage(handle, WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
                return Task.FromResult(new CompanionResponse { Success = true });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        private Task<CompanionResponse> HandleWindowMaximizeAsync(CompanionRequest request)
        {
            try
            {
                var handle = new IntPtr(request.Parameters.GetProperty("handle").GetInt64());
                ShowWindow(handle, SW_MAXIMIZE);
                return Task.FromResult(new CompanionResponse { Success = true });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        private Task<CompanionResponse> HandleWindowMoveAsync(CompanionRequest request)
        {
            try
            {
                var handle = new IntPtr(request.Parameters.GetProperty("handle").GetInt64());
                var x = request.Parameters.GetProperty("x").GetInt32();
                var y = request.Parameters.GetProperty("y").GetInt32();

                GetWindowRect(handle, out RECT rect);
                int width = rect.Right - rect.Left;
                int height = rect.Bottom - rect.Top;
                MoveWindow(handle, x, y, width, height, true);
                return Task.FromResult(new CompanionResponse { Success = true });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        private Task<CompanionResponse> HandleWindowSnapAsync(CompanionRequest request)
        {
            try
            {
                var handle = new IntPtr(request.Parameters.GetProperty("handle").GetInt64());
                var position = request.Parameters.GetProperty("position").GetString()?.ToLower(); // left, right, top-left, top-right, bottom-left, bottom-right

                var screen = Screen.FromHandle(handle);
                var wa = screen.WorkingArea;

                int x = wa.Left, y = wa.Top, w = wa.Width, h = wa.Height;

                switch (position)
                {
                    case "left":
                        w = wa.Width / 2;
                        break;
                    case "right":
                        x = wa.Left + wa.Width / 2;
                        w = wa.Width / 2;
                        break;
                    case "top-left":
                        w = wa.Width / 2;
                        h = wa.Height / 2;
                        break;
                    case "top-right":
                        x = wa.Left + wa.Width / 2;
                        w = wa.Width / 2;
                        h = wa.Height / 2;
                        break;
                    case "bottom-left":
                        y = wa.Top + wa.Height / 2;
                        w = wa.Width / 2;
                        h = wa.Height / 2;
                        break;
                    case "bottom-right":
                        x = wa.Left + wa.Width / 2;
                        y = wa.Top + wa.Height / 2;
                        w = wa.Width / 2;
                        h = wa.Height / 2;
                        break;
                    case "top":
                        h = wa.Height / 2;
                        break;
                    case "bottom":
                        y = wa.Top + wa.Height / 2;
                        h = wa.Height / 2;
                        break;
                    case "full":
                    case "maximize":
                        // Full working area
                        break;
                    default:
                        return Task.FromResult(new CompanionResponse { Success = false, Error = $"Unknown snap position: {position}. Use: left, right, top-left, top-right, bottom-left, bottom-right, top, bottom, full" });
                }

                ShowWindow(handle, SW_RESTORE);
                MoveWindow(handle, x, y, w, h, true);
                return Task.FromResult(new CompanionResponse { Success = true });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        private Task<CompanionResponse> HandleWindowOpacityAsync(CompanionRequest request)
        {
            try
            {
                var handle = new IntPtr(request.Parameters.GetProperty("handle").GetInt64());
                var opacity = request.Parameters.GetProperty("opacity").GetDouble(); // 0.0 to 1.0
                byte alpha = (byte)(Math.Clamp(opacity, 0.0, 1.0) * 255);

                int exStyle = GetWindowLong(handle, GWL_EXSTYLE);
                SetWindowLong(handle, GWL_EXSTYLE, exStyle | WS_EX_LAYERED);
                SetLayeredWindowAttributes(handle, 0, alpha, LWA_ALPHA);

                return Task.FromResult(new CompanionResponse { Success = true });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        private Task<CompanionResponse> HandleWindowTopmostAsync(CompanionRequest request)
        {
            try
            {
                var handle = new IntPtr(request.Parameters.GetProperty("handle").GetInt64());
                var topmost = request.Parameters.TryGetProperty("topmost", out var tProp) ? tProp.GetBoolean() : true;

                var insertAfter = topmost ? HWND_TOPMOST : HWND_NOTOPMOST;
                SetWindowPos(handle, insertAfter, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);

                return Task.FromResult(new CompanionResponse { Success = true });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        private Task<CompanionResponse> HandleWindowTitleSetAsync(CompanionRequest request)
        {
            try
            {
                var handle = new IntPtr(request.Parameters.GetProperty("handle").GetInt64());
                var title = request.Parameters.GetProperty("title").GetString();
                SetWindowText(handle, title);
                return Task.FromResult(new CompanionResponse { Success = true });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        #endregion

        #region System Power

        private async Task<CompanionResponse> HandleSystemShutdownAsync(CompanionRequest request)
        {
            try
            {
                var delaySec = request.Parameters.TryGetProperty("delay", out var dProp) ? dProp.GetInt32() : 0;
                var force = request.Parameters.TryGetProperty("force", out var fProp) && fProp.GetBoolean();
                var script = force
                    ? $"Stop-Computer -Force"
                    : $"shutdown /s /t {delaySec}";
                var psRequest = new CompanionRequest
                {
                    Command = "powershell.execute",
                    Parameters = JsonSerializer.SerializeToElement(new { script, admin = true })
                };
                return await HandlePowerShellExecuteAsync(psRequest);
            }
            catch (Exception ex) { return new CompanionResponse { Success = false, Error = ex.Message }; }
        }

        private async Task<CompanionResponse> HandleSystemRestartAsync(CompanionRequest request)
        {
            try
            {
                var delaySec = request.Parameters.TryGetProperty("delay", out var dProp) ? dProp.GetInt32() : 0;
                var force = request.Parameters.TryGetProperty("force", out var fProp) && fProp.GetBoolean();
                var script = force
                    ? $"Restart-Computer -Force"
                    : $"shutdown /r /t {delaySec}";
                var psRequest = new CompanionRequest
                {
                    Command = "powershell.execute",
                    Parameters = JsonSerializer.SerializeToElement(new { script, admin = true })
                };
                return await HandlePowerShellExecuteAsync(psRequest);
            }
            catch (Exception ex) { return new CompanionResponse { Success = false, Error = ex.Message }; }
        }

        private Task<CompanionResponse> HandleSystemSleepAsync(CompanionRequest request)
        {
            try
            {
                SetSuspendState(false, false, false);
                return Task.FromResult(new CompanionResponse { Success = true });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        private Task<CompanionResponse> HandleSystemHibernateAsync(CompanionRequest request)
        {
            try
            {
                SetSuspendState(true, false, false);
                return Task.FromResult(new CompanionResponse { Success = true });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        private Task<CompanionResponse> HandleSystemLockAsync(CompanionRequest request)
        {
            try
            {
                LockWorkStation();
                return Task.FromResult(new CompanionResponse { Success = true });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        private async Task<CompanionResponse> HandleSystemLogoffAsync(CompanionRequest request)
        {
            try
            {
                var psRequest = new CompanionRequest
                {
                    Command = "powershell.execute",
                    Parameters = JsonSerializer.SerializeToElement(new { script = "logoff", admin = false })
                };
                return await HandlePowerShellExecuteAsync(psRequest);
            }
            catch (Exception ex) { return new CompanionResponse { Success = false, Error = ex.Message }; }
        }

        #endregion

        #region Audio Volume Control

        private async Task<CompanionResponse> HandleAudioVolumeGetAsync(CompanionRequest request)
        {
            try
            {
                var script = @"
                    Add-Type -TypeDefinition '
                    using System.Runtime.InteropServices;
                    [Guid(""5CDF2C82-841E-4546-9722-0CF74078229A""), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
                    interface IAudioEndpointVolume {
                        int _0(); int _1(); int _2(); int _3(); int _4(); int _5(); int _6(); int _7(); int _8(); int _9(); int _10(); int _11();
                        int GetMasterVolumeLevelScalar(out float pfLevel);
                        int SetMasterVolumeLevelScalar(float fLevel, System.Guid pguidEventContext);
                        int GetMute(out bool pbMute);
                    }
                    [Guid(""D666063F-1587-4E43-81F1-B948E807363F""), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
                    interface IMMDevice { int Activate(ref System.Guid iid, int dwClsCtx, System.IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface); }
                    [Guid(""A95664D2-9614-4F35-A746-DE8DB63617E6""), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
                    interface IMMDeviceEnumerator { int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice); }
                    [ComImport, Guid(""BCDE0395-E52F-467C-8E3D-C4579291692E"")] class MMDeviceEnumerator {}
                    ' -ErrorAction SilentlyContinue
                    $enumerator = New-Object MMDeviceEnumerator
                    $device = $null; $enumerator.GetDefaultAudioEndpoint(0, 1, [ref]$device)
                    $iid = [Guid]'5CDF2C82-841E-4546-9722-0CF74078229A'; $obj = $null
                    $device.Activate([ref]$iid, 1, [IntPtr]::Zero, [ref]$obj)
                    $vol = [IAudioEndpointVolume]$obj
                    $level = 0.0; $vol.GetMasterVolumeLevelScalar([ref]$level)
                    $muted = $false; $vol.GetMute([ref]$muted)
                    ConvertTo-Json @{ volume = [math]::Round($level * 100); muted = $muted }
                ";
                var psRequest = new CompanionRequest
                {
                    Command = "powershell.execute",
                    Parameters = JsonSerializer.SerializeToElement(new { script, admin = false })
                };
                return await HandlePowerShellExecuteAsync(psRequest);
            }
            catch (Exception ex) { return new CompanionResponse { Success = false, Error = ex.Message }; }
        }

        private async Task<CompanionResponse> HandleAudioVolumeSetAsync(CompanionRequest request)
        {
            try
            {
                var level = request.Parameters.GetProperty("level").GetInt32(); // 0-100
                var script = $@"
                    Add-Type -TypeDefinition '
                    using System.Runtime.InteropServices;
                    [Guid(""5CDF2C82-841E-4546-9722-0CF74078229A""), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
                    interface IAudioEndpointVolume {{
                        int _0(); int _1(); int _2(); int _3(); int _4(); int _5(); int _6(); int _7(); int _8(); int _9(); int _10(); int _11();
                        int GetMasterVolumeLevelScalar(out float pfLevel);
                        int SetMasterVolumeLevelScalar(float fLevel, System.Guid pguidEventContext);
                    }}
                    [Guid(""D666063F-1587-4E43-81F1-B948E807363F""), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
                    interface IMMDevice {{ int Activate(ref System.Guid iid, int dwClsCtx, System.IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface); }}
                    [Guid(""A95664D2-9614-4F35-A746-DE8DB63617E6""), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
                    interface IMMDeviceEnumerator {{ int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice); }}
                    [ComImport, Guid(""BCDE0395-E52F-467C-8E3D-C4579291692E"")] class MMDeviceEnumerator {{}}
                    ' -ErrorAction SilentlyContinue
                    $enumerator = New-Object MMDeviceEnumerator
                    $device = $null; $enumerator.GetDefaultAudioEndpoint(0, 1, [ref]$device)
                    $iid = [Guid]'5CDF2C82-841E-4546-9722-0CF74078229A'; $obj = $null
                    $device.Activate([ref]$iid, 1, [IntPtr]::Zero, [ref]$obj)
                    $vol = [IAudioEndpointVolume]$obj
                    $vol.SetMasterVolumeLevelScalar({level / 100.0:F2}, [Guid]::Empty)
                ";
                var psRequest = new CompanionRequest
                {
                    Command = "powershell.execute",
                    Parameters = JsonSerializer.SerializeToElement(new { script, admin = false })
                };
                return await HandlePowerShellExecuteAsync(psRequest);
            }
            catch (Exception ex) { return new CompanionResponse { Success = false, Error = ex.Message }; }
        }

        private async Task<CompanionResponse> HandleAudioMuteAsync(CompanionRequest request)
        {
            try
            {
                var script = @"
                    $obj = New-Object -ComObject WScript.Shell
                    $obj.SendKeys([char]173)
                    Start-Sleep -Milliseconds 100
                    ConvertTo-Json @{ muted = $true }
                ";
                var psRequest = new CompanionRequest
                {
                    Command = "powershell.execute",
                    Parameters = JsonSerializer.SerializeToElement(new { script, admin = false })
                };
                return await HandlePowerShellExecuteAsync(psRequest);
            }
            catch (Exception ex) { return new CompanionResponse { Success = false, Error = ex.Message }; }
        }

        private async Task<CompanionResponse> HandleAudioUnmuteAsync(CompanionRequest request)
        {
            try
            {
                // Same as mute — the mute key is a toggle
                var script = @"
                    $obj = New-Object -ComObject WScript.Shell
                    $obj.SendKeys([char]173)
                    Start-Sleep -Milliseconds 100
                    ConvertTo-Json @{ muted = $false }
                ";
                var psRequest = new CompanionRequest
                {
                    Command = "powershell.execute",
                    Parameters = JsonSerializer.SerializeToElement(new { script, admin = false })
                };
                return await HandlePowerShellExecuteAsync(psRequest);
            }
            catch (Exception ex) { return new CompanionResponse { Success = false, Error = ex.Message }; }
        }

        #endregion

        #region Notifications

        private Task<CompanionResponse> HandleNotificationShowAsync(CompanionRequest request)
        {
            try
            {
                var title = request.Parameters.TryGetProperty("title", out var tProp) ? tProp.GetString() : "OpenClaw";
                var message = request.Parameters.GetProperty("message").GetString();
                var iconStr = request.Parameters.TryGetProperty("icon", out var iProp) ? iProp.GetString() : "info";

                var icon = iconStr?.ToLower() switch
                {
                    "warning" => ToolTipIcon.Warning,
                    "error" => ToolTipIcon.Error,
                    _ => ToolTipIcon.Info
                };

                var thread = new Thread(() =>
                {
                    using var notifyIcon = new NotifyIcon
                    {
                        Visible = true,
                        Icon = SystemIcons.Information,
                        BalloonTipTitle = title ?? "OpenClaw",
                        BalloonTipText = message ?? "",
                        BalloonTipIcon = icon
                    };
                    notifyIcon.ShowBalloonTip(5000);
                    Thread.Sleep(6000);
                    notifyIcon.Visible = false;
                });
                thread.SetApartmentState(ApartmentState.STA);
                thread.Start();

                return Task.FromResult(new CompanionResponse { Success = true });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        #endregion

        #region Display

        private Task<CompanionResponse> HandleDisplayResolutionGetAsync(CompanionRequest request)
        {
            try
            {
                var screenIdx = request.Parameters.TryGetProperty("screen", out var sProp) ? sProp.GetInt32() : 0;
                var screens = Screen.AllScreens;
                if (screenIdx < 0 || screenIdx >= screens.Length)
                    return Task.FromResult(new CompanionResponse { Success = false, Error = $"Screen index {screenIdx} out of range (0-{screens.Length - 1})" });

                var s = screens[screenIdx];
                var result = new
                {
                    width = s.Bounds.Width,
                    height = s.Bounds.Height,
                    bitsPerPixel = s.BitsPerPixel,
                    primary = s.Primary,
                    deviceName = s.DeviceName
                };
                return Task.FromResult(new CompanionResponse { Success = true, Data = JsonSerializer.SerializeToElement(result) });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        private async Task<CompanionResponse> HandleDisplayResolutionSetAsync(CompanionRequest request)
        {
            try
            {
                var width = request.Parameters.GetProperty("width").GetInt32();
                var height = request.Parameters.GetProperty("height").GetInt32();
                var script = $@"
                    Add-Type @'
                    using System; using System.Runtime.InteropServices;
                    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
                    public struct DEVMODE {{
                        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmDeviceName;
                        public short dmSpecVersion; public short dmDriverVersion; public short dmSize;
                        public short dmDriverExtra; public int dmFields; public int dmPositionX; public int dmPositionY;
                        public int dmDisplayOrientation; public int dmDisplayFixedOutput;
                        public short dmColor; public short dmDuplex; public short dmYResolution;
                        public short dmTTOption; public short dmCollate;
                        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmFormName;
                        public short dmLogPixels; public int dmBitsPerPel; public int dmPelsWidth;
                        public int dmPelsHeight; public int dmDisplayFlags; public int dmDisplayFrequency;
                    }}
                    public class Display {{
                        [DllImport(""user32.dll"")] public static extern int ChangeDisplaySettings(ref DEVMODE devMode, int flags);
                        [DllImport(""user32.dll"")] public static extern bool EnumDisplaySettings(string lpszDeviceName, int iModeNum, ref DEVMODE lpDevMode);
                    }}
'@
                    $dm = New-Object DEVMODE; $dm.dmSize = [System.Runtime.InteropServices.Marshal]::SizeOf($dm)
                    [Display]::EnumDisplaySettings($null, -1, [ref]$dm)
                    $dm.dmPelsWidth = {width}; $dm.dmPelsHeight = {height}
                    $dm.dmFields = 0x180000
                    $result = [Display]::ChangeDisplaySettings([ref]$dm, 0)
                    ConvertTo-Json @{{ result = $result; width = {width}; height = {height} }}
                ";
                var psRequest = new CompanionRequest
                {
                    Command = "powershell.execute",
                    Parameters = JsonSerializer.SerializeToElement(new { script, admin = false })
                };
                return await HandlePowerShellExecuteAsync(psRequest);
            }
            catch (Exception ex) { return new CompanionResponse { Success = false, Error = ex.Message }; }
        }

        private Task<CompanionResponse> HandleDisplayListAsync(CompanionRequest request)
        {
            try
            {
                var screens = Screen.AllScreens.Select((s, i) => new
                {
                    index = i,
                    name = s.DeviceName,
                    primary = s.Primary,
                    width = s.Bounds.Width,
                    height = s.Bounds.Height,
                    workingArea = new { x = s.WorkingArea.X, y = s.WorkingArea.Y, width = s.WorkingArea.Width, height = s.WorkingArea.Height },
                    bitsPerPixel = s.BitsPerPixel
                }).ToArray();

                return Task.FromResult(new CompanionResponse { Success = true, Data = JsonSerializer.SerializeToElement(screens) });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        #endregion

        #region Network

        private async Task<CompanionResponse> HandleNetworkAdaptersAsync(CompanionRequest request)
        {
            return await WmiQueryToResponse("SELECT Name,MACAddress,Speed,NetConnectionStatus,NetConnectionID FROM Win32_NetworkAdapter WHERE NetConnectionID IS NOT NULL");
        }

        private async Task<CompanionResponse> HandleNetworkIpAsync(CompanionRequest request)
        {
            try
            {
                var script = "Get-NetIPAddress | Select-Object InterfaceAlias,IPAddress,AddressFamily,PrefixLength | ConvertTo-Json";
                var psRequest = new CompanionRequest
                {
                    Command = "powershell.execute",
                    Parameters = JsonSerializer.SerializeToElement(new { script, admin = false })
                };
                return await HandlePowerShellExecuteAsync(psRequest);
            }
            catch (Exception ex) { return new CompanionResponse { Success = false, Error = ex.Message }; }
        }

        private async Task<CompanionResponse> HandleNetworkWifiListAsync(CompanionRequest request)
        {
            try
            {
                var script = "netsh wlan show networks mode=bssid | Out-String";
                var psRequest = new CompanionRequest
                {
                    Command = "powershell.execute",
                    Parameters = JsonSerializer.SerializeToElement(new { script, admin = false })
                };
                return await HandlePowerShellExecuteAsync(psRequest);
            }
            catch (Exception ex) { return new CompanionResponse { Success = false, Error = ex.Message }; }
        }

        private async Task<CompanionResponse> HandleNetworkWifiConnectAsync(CompanionRequest request)
        {
            try
            {
                var ssid = request.Parameters.GetProperty("ssid").GetString();
                var password = request.Parameters.TryGetProperty("password", out var pProp) ? pProp.GetString() : null;

                string script;
                if (password != null)
                {
                    // Create temp profile XML and connect
                    script = $@"
                        $profileXml = @'
<?xml version=""1.0""?>
<WLANProfile xmlns=""http://www.microsoft.com/networking/WLAN/profile/v1"">
    <name>{ssid}</name>
    <SSIDConfig><SSID><name>{ssid}</name></SSID></SSIDConfig>
    <connectionType>ESS</connectionType>
    <connectionMode>auto</connectionMode>
    <MSM><security><authEncryption><authentication>WPA2PSK</authentication><encryption>AES</encryption><useOneX>false</useOneX></authEncryption><sharedKey><keyType>passPhrase</keyType><protected>false</protected><keyMaterial>{password}</keyMaterial></sharedKey></security></MSM>
</WLANProfile>
'@
                        $profilePath = ""$env:TEMP\wifi_profile.xml""
                        $profileXml | Out-File -FilePath $profilePath -Encoding UTF8
                        netsh wlan add profile filename=$profilePath
                        netsh wlan connect name=""{ssid}""
                        Remove-Item $profilePath -ErrorAction SilentlyContinue
                    ";
                }
                else
                {
                    script = $"netsh wlan connect name=\"{ssid}\"";
                }

                var psRequest = new CompanionRequest
                {
                    Command = "powershell.execute",
                    Parameters = JsonSerializer.SerializeToElement(new { script, admin = true })
                };
                return await HandlePowerShellExecuteAsync(psRequest);
            }
            catch (Exception ex) { return new CompanionResponse { Success = false, Error = ex.Message }; }
        }

        private async Task<CompanionResponse> HandleNetworkWifiDisconnectAsync(CompanionRequest request)
        {
            try
            {
                var script = "netsh wlan disconnect";
                var psRequest = new CompanionRequest
                {
                    Command = "powershell.execute",
                    Parameters = JsonSerializer.SerializeToElement(new { script, admin = false })
                };
                return await HandlePowerShellExecuteAsync(psRequest);
            }
            catch (Exception ex) { return new CompanionResponse { Success = false, Error = ex.Message }; }
        }

        private async Task<CompanionResponse> HandleNetworkDnsFlushAsync(CompanionRequest request)
        {
            try
            {
                var script = "Clear-DnsClientCache; ConvertTo-Json @{ flushed = $true }";
                var psRequest = new CompanionRequest
                {
                    Command = "powershell.execute",
                    Parameters = JsonSerializer.SerializeToElement(new { script, admin = true })
                };
                return await HandlePowerShellExecuteAsync(psRequest);
            }
            catch (Exception ex) { return new CompanionResponse { Success = false, Error = ex.Message }; }
        }

        #endregion

        #region Installed Apps

        private async Task<CompanionResponse> HandleAppsInstalledAsync(CompanionRequest request)
        {
            try
            {
                var script = @"
                    $apps = @()
                    $paths = @(
                        'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
                        'HKLM:\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
                        'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
                    )
                    foreach ($path in $paths) {
                        $apps += Get-ItemProperty $path -ErrorAction SilentlyContinue |
                            Where-Object { $_.DisplayName } |
                            Select-Object DisplayName,DisplayVersion,Publisher,InstallDate,InstallLocation,UninstallString
                    }
                    $apps | Sort-Object DisplayName -Unique | ConvertTo-Json -Depth 2
                ";
                var psRequest = new CompanionRequest
                {
                    Command = "powershell.execute",
                    Parameters = JsonSerializer.SerializeToElement(new { script, admin = false })
                };
                return await HandlePowerShellExecuteAsync(psRequest);
            }
            catch (Exception ex) { return new CompanionResponse { Success = false, Error = ex.Message }; }
        }

        private async Task<CompanionResponse> HandleAppsUninstallAsync(CompanionRequest request)
        {
            try
            {
                var name = request.Parameters.GetProperty("name").GetString();
                var silent = request.Parameters.TryGetProperty("silent", out var sProp) && sProp.GetBoolean();

                var script = $@"
                    $app = Get-ItemProperty 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*','HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue |
                        Where-Object {{ $_.DisplayName -like '*{name}*' }} |
                        Select-Object -First 1
                    if ($app -and $app.UninstallString) {{
                        $uninstall = $app.UninstallString
                        {(silent ? "$uninstall = $uninstall -replace '/I','/X'; Start-Process msiexec -ArgumentList \"$uninstall /quiet /norestart\" -Wait -NoNewWindow" : "Start-Process cmd -ArgumentList \"/c $uninstall\" -Wait")}
                        ConvertTo-Json @{{ uninstalled = $true; name = $app.DisplayName }}
                    }} else {{
                        ConvertTo-Json @{{ uninstalled = $false; error = 'Application not found' }}
                    }}
                ";
                var psRequest = new CompanionRequest
                {
                    Command = "powershell.execute",
                    Parameters = JsonSerializer.SerializeToElement(new { script, admin = true })
                };
                return await HandlePowerShellExecuteAsync(psRequest);
            }
            catch (Exception ex) { return new CompanionResponse { Success = false, Error = ex.Message }; }
        }

        #endregion

        #region User Accounts

        private async Task<CompanionResponse> HandleUsersListAsync(CompanionRequest request)
        {
            try
            {
                var script = "Get-LocalUser | Select-Object Name,Enabled,LastLogon,Description | ConvertTo-Json";
                var psRequest = new CompanionRequest
                {
                    Command = "powershell.execute",
                    Parameters = JsonSerializer.SerializeToElement(new { script, admin = false })
                };
                return await HandlePowerShellExecuteAsync(psRequest);
            }
            catch (Exception ex) { return new CompanionResponse { Success = false, Error = ex.Message }; }
        }

        private Task<CompanionResponse> HandleUsersCurrentAsync(CompanionRequest request)
        {
            try
            {
                var identity = WindowsIdentity.GetCurrent();
                var result = new
                {
                    name = identity.Name,
                    isAuthenticated = identity.IsAuthenticated,
                    isSystem = identity.IsSystem,
                    isAdmin = IsAdministrator(),
                    groups = identity.Groups?.Select(g =>
                    {
                        try { return g.Translate(typeof(NTAccount))?.Value; } catch { return g.Value; }
                    }).Where(g => g != null).ToArray()
                };
                return Task.FromResult(new CompanionResponse { Success = true, Data = JsonSerializer.SerializeToElement(result) });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        #endregion

        #region Device Management

        private async Task<CompanionResponse> HandleDeviceListAsync(CompanionRequest request)
        {
            try
            {
                var category = request.Parameters.TryGetProperty("category", out var cProp) ? cProp.GetString() : null;
                var filter = category != null ? $" WHERE PNPClass = '{category}'" : "";
                return await WmiQueryToResponse($"SELECT Name,DeviceID,Status,PNPClass,Manufacturer FROM Win32_PnPEntity{filter}");
            }
            catch (Exception ex) { return new CompanionResponse { Success = false, Error = ex.Message }; }
        }

        private async Task<CompanionResponse> HandleDeviceEnableAsync(CompanionRequest request)
        {
            try
            {
                var deviceId = request.Parameters.GetProperty("deviceId").GetString();
                var script = $"Get-PnpDevice -InstanceId '{deviceId}' | Enable-PnpDevice -Confirm:$false";
                var psRequest = new CompanionRequest
                {
                    Command = "powershell.execute",
                    Parameters = JsonSerializer.SerializeToElement(new { script, admin = true })
                };
                return await HandlePowerShellExecuteAsync(psRequest);
            }
            catch (Exception ex) { return new CompanionResponse { Success = false, Error = ex.Message }; }
        }

        private async Task<CompanionResponse> HandleDeviceDisableAsync(CompanionRequest request)
        {
            try
            {
                var deviceId = request.Parameters.GetProperty("deviceId").GetString();
                var script = $"Get-PnpDevice -InstanceId '{deviceId}' | Disable-PnpDevice -Confirm:$false";
                var psRequest = new CompanionRequest
                {
                    Command = "powershell.execute",
                    Parameters = JsonSerializer.SerializeToElement(new { script, admin = true })
                };
                return await HandlePowerShellExecuteAsync(psRequest);
            }
            catch (Exception ex) { return new CompanionResponse { Success = false, Error = ex.Message }; }
        }

        #endregion

        #region Process Enhancements

        private Task<CompanionResponse> HandleProcessFocusAsync(CompanionRequest request)
        {
            try
            {
                var pid = request.Parameters.GetProperty("pid").GetInt32();
                var process = Process.GetProcessById(pid);

                if (process.MainWindowHandle != IntPtr.Zero)
                {
                    ShowWindow(process.MainWindowHandle, SW_RESTORE);
                    SetForegroundWindow(process.MainWindowHandle);
                    return Task.FromResult(new CompanionResponse { Success = true });
                }
                else
                {
                    return Task.FromResult(new CompanionResponse { Success = false, Error = "Process has no visible main window" });
                }
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        private Task<CompanionResponse> HandleProcessPriorityAsync(CompanionRequest request)
        {
            try
            {
                var pid = request.Parameters.GetProperty("pid").GetInt32();
                var priorityStr = request.Parameters.GetProperty("priority").GetString()?.ToLower();

                var priority = priorityStr switch
                {
                    "idle" => ProcessPriorityClass.Idle,
                    "below-normal" or "belownormal" => ProcessPriorityClass.BelowNormal,
                    "normal" => ProcessPriorityClass.Normal,
                    "above-normal" or "abovenormal" => ProcessPriorityClass.AboveNormal,
                    "high" => ProcessPriorityClass.High,
                    "realtime" => ProcessPriorityClass.RealTime,
                    _ => throw new ArgumentException($"Unknown priority: {priorityStr}. Use: idle, below-normal, normal, above-normal, high, realtime")
                };

                var process = Process.GetProcessById(pid);
                process.PriorityClass = priority;

                var result = new { pid, priority = priority.ToString() };
                return Task.FromResult(new CompanionResponse { Success = true, Data = JsonSerializer.SerializeToElement(result) });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse { Success = false, Error = ex.Message });
            }
        }

        #endregion

        #region Vision (VLM via Ollama)

        private static readonly System.Net.Http.HttpClient _ollamaClient = new System.Net.Http.HttpClient
        {
            Timeout = TimeSpan.FromSeconds(120)
        };

        private string GetOllamaEndpoint()
        {
            return Environment.GetEnvironmentVariable("HOC_OLLAMA_ENDPOINT") ?? "http://localhost:11434";
        }

        private string GetVisionModel()
        {
            return Environment.GetEnvironmentVariable("HOC_VISION_MODEL") ?? "qwen3-vl:4b";
        }

        private async Task<string> CaptureScreenBase64Async()
        {
            return await Task.Run(() =>
            {
                var bounds = Screen.PrimaryScreen.Bounds;
                using var bitmap = new Bitmap(bounds.Width, bounds.Height, PixelFormat.Format32bppArgb);
                using var graphics = Graphics.FromImage(bitmap);
                graphics.CopyFromScreen(bounds.Location, System.Drawing.Point.Empty, bounds.Size);

                using var ms = new MemoryStream();
                bitmap.Save(ms, ImageFormat.Png);
                return Convert.ToBase64String(ms.ToArray());
            });
        }

        private async Task<string> CallOllamaVisionAsync(string prompt, string imageBase64)
        {
            var endpoint = GetOllamaEndpoint();
            var model = GetVisionModel();

            var requestBody = new
            {
                model,
                prompt,
                images = new[] { imageBase64 },
                stream = false,
                options = new { temperature = 0.1 }
            };

            var json = JsonSerializer.Serialize(requestBody);
            var content = new System.Net.Http.StringContent(json, Encoding.UTF8, "application/json");

            var response = await _ollamaClient.PostAsync($"{endpoint}/api/generate", content);
            var responseJson = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
                throw new Exception($"Ollama returned {response.StatusCode}: {responseJson}");

            var doc = JsonDocument.Parse(responseJson);
            return doc.RootElement.GetProperty("response").GetString();
        }

        private async Task<CompanionResponse> HandleVisionAnalyzeAsync(CompanionRequest request)
        {
            try
            {
                var prompt = request.Parameters.TryGetProperty("prompt", out var pProp)
                    ? pProp.GetString()
                    : "Analyze this screenshot. Describe what you see, including UI elements, text, and any notable features.";

                var imageBase64 = await CaptureScreenBase64Async();
                var analysis = await CallOllamaVisionAsync(prompt, imageBase64);

                var result = new { analysis, model = GetVisionModel(), timestamp = DateTimeOffset.UtcNow.ToString("o") };
                return new CompanionResponse { Success = true, Data = JsonSerializer.SerializeToElement(result) };
            }
            catch (Exception ex)
            {
                return new CompanionResponse { Success = false, Error = ex.Message };
            }
        }

        private async Task<CompanionResponse> HandleVisionDescribeAsync(CompanionRequest request)
        {
            try
            {
                var imageBase64 = await CaptureScreenBase64Async();
                var description = await CallOllamaVisionAsync(
                    "Describe exactly what is visible on this screen. List all windows, applications, text content, buttons, menus, and UI elements you can identify. Be precise and structured.",
                    imageBase64);

                var result = new { description, model = GetVisionModel() };
                return new CompanionResponse { Success = true, Data = JsonSerializer.SerializeToElement(result) };
            }
            catch (Exception ex)
            {
                return new CompanionResponse { Success = false, Error = ex.Message };
            }
        }

        private async Task<CompanionResponse> HandleVisionFindElementAsync(CompanionRequest request)
        {
            try
            {
                var elementDescription = request.Parameters.GetProperty("element").GetString();
                var imageBase64 = await CaptureScreenBase64Async();

                var prompt = $"Find the UI element matching this description: '{elementDescription}'. " +
                    "Return the approximate coordinates as JSON: {{\"found\": true/false, \"x\": number, \"y\": number, \"confidence\": 0-1, \"description\": \"what you found\"}}. " +
                    "Coordinates should be pixel positions on screen. Return ONLY the JSON, no other text.";

                var response = await CallOllamaVisionAsync(prompt, imageBase64);

                // Try to parse the JSON response
                try
                {
                    var parsed = JsonDocument.Parse(response);
                    return new CompanionResponse { Success = true, Data = parsed.RootElement.Clone() };
                }
                catch
                {
                    var result = new { raw = response, parsed = false };
                    return new CompanionResponse { Success = true, Data = JsonSerializer.SerializeToElement(result) };
                }
            }
            catch (Exception ex)
            {
                return new CompanionResponse { Success = false, Error = ex.Message };
            }
        }

        private async Task<CompanionResponse> HandleVisionOCRAsync(CompanionRequest request)
        {
            try
            {
                var imageBase64 = await CaptureScreenBase64Async();

                var prompt = "Extract ALL text visible on this screen. Return it organized by visual region/window. " +
                    "Include menu items, button labels, status bar text, title bars — everything readable.";

                var text = await CallOllamaVisionAsync(prompt, imageBase64);

                var result = new { text, model = GetVisionModel() };
                return new CompanionResponse { Success = true, Data = JsonSerializer.SerializeToElement(result) };
            }
            catch (Exception ex)
            {
                return new CompanionResponse { Success = false, Error = ex.Message };
            }
        }

        #endregion

    }

    #region Data Models

    public class CompanionRequest
    {
        public string Command { get; set; } = "";
        public JsonElement Parameters { get; set; }
    }

    public class CompanionResponse
    {
        public bool Success { get; set; }
        public JsonElement? Data { get; set; }
        public string? Error { get; set; }
        public string? StackTrace { get; set; }
    }

    #endregion

    #region Service Entry Point

    public static class Program
    {
        public static void Main(string[] args)
        {
            if (args.Length > 0 && args[0] == "--console")
            {
                // Run in console mode for testing
                var service = new CompanionServiceEnhanced();
                service.RunConsole(args);
                Console.WriteLine("Service running in console mode. Press Enter to stop...");
                Console.ReadLine();
                service.StopConsole();
            }
            else
            {
                // Run as Windows Service
                ServiceBase.Run(new CompanionServiceEnhanced());
            }
        }
    }

    #endregion
}
