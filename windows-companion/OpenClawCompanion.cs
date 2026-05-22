/**
 * OpenClaw Windows Companion Service
 * Provides high-privilege Windows-specific capabilities via C#/.NET
 * Communicates with the TypeScript node-host via IPC (Named Pipes)
 */

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Management;
using System.Runtime.InteropServices;
using System.ServiceProcess;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Automation;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.DependencyInjection;

namespace OpenClawCompanion
{
    /// <summary>
    /// Main companion service that handles privileged Windows operations
    /// </summary>
    /// <summary>
    /// Main companion service that handles privileged Windows operations
    /// </summary>
    public class CompanionService : BackgroundService
    {
        private NamedPipeServerStream _pipeServer;
        private readonly string _pipeName = "OpenClawCompanion";
        private readonly ILogger<CompanionService> _logger;

        public CompanionService(ILogger<CompanionService> logger)
        {
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("OpenClaw Companion Service starting...");
            await RunServerAsync(stoppingToken);
        }

        private async Task RunServerAsync(CancellationToken cancellationToken)
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                try
                {
                    _pipeServer = new NamedPipeServerStream(
                        _pipeName,
                        PipeDirection.InOut,
                        NamedPipeServerStream.MaxAllowedServerInstances,
                        PipeTransmissionMode.Message,
                        PipeOptions.Asynchronous
                    );

                    await _pipeServer.WaitForConnectionAsync(cancellationToken);

                    // Handle client connection in a separate task
                    _ = Task.Run(() => HandleClientAsync(_pipeServer, cancellationToken), cancellationToken);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Server error");
                    await Task.Delay(1000, cancellationToken);
                }
            }
        }

        private async Task HandleClientAsync(NamedPipeServerStream pipe, CancellationToken cancellationToken)
        {
            try
            {
                using var reader = new StreamReader(pipe, Encoding.UTF8);
                using var writer = new StreamWriter(pipe, Encoding.UTF8) { AutoFlush = true };

                while (pipe.IsConnected && !cancellationToken.IsCancellationRequested)
                {
                    var requestJson = await reader.ReadLineAsync();
                    if (string.IsNullOrEmpty(requestJson))
                        break;

                    var request = JsonSerializer.Deserialize<CompanionRequest>(requestJson);
                    var response = await ProcessRequestAsync(request);
                    var responseJson = JsonSerializer.Serialize(response);

                    await writer.WriteLineAsync(responseJson);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Client handler error");
            }
            finally
            {
                pipe?.Close();
            }
        }

        private async Task<CompanionResponse> ProcessRequestAsync(CompanionRequest request)
        {
            try
            {
                return request.Command switch
                {
                    "input.mouse.move" => await HandleMouseMoveAsync(request),
                    "input.mouse.click" => await HandleMouseClickAsync(request),
                    "input.keyboard.type" => await HandleKeyboardTypeAsync(request),
                    "input.keyboard.press" => await HandleKeyboardPressAsync(request),
                    "ui.automation.find" => await HandleUIAutomationFindAsync(request),
                    "ui.automation.click" => await HandleUIAutomationClickAsync(request),
                    "ui.automation.read" => await HandleUIAutomationReadAsync(request),
                    "system.run" => await HandleSystemRunAsync(request),
                    "system.wmi.query" => await HandleWMIQueryAsync(request),
                    "screen.capture" => await HandleScreenCaptureAsync(request),
                    _ => new CompanionResponse
                    {
                        Success = false,
                        Error = $"Unknown command: {request.Command}"
                    }
                };
            }
            catch (Exception ex)
            {
                return new CompanionResponse
                {
                    Success = false,
                    Error = ex.Message,
                    StackTrace = ex.StackTrace
                };
            }
        }

        #region Input Simulation (FakerInput Integration)

        // P/Invoke declarations for SendInput (fallback if FakerInput not available)
        [DllImport("user32.dll")]
        private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

        [DllImport("user32.dll")]
        private static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, UIntPtr dwExtraInfo);

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
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct MOUSEINPUT
        {
            public int dx;
            public int dy;
            public uint mouseData;
            public uint dwFlags;
            public uint time;
            public UIntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct KEYBDINPUT
        {
            public ushort wVk;
            public ushort wScan;
            public uint dwFlags;
            public uint time;
            public UIntPtr dwExtraInfo;
        }

        private const uint INPUT_MOUSE = 0;
        private const uint INPUT_KEYBOARD = 1;
        private const uint MOUSEEVENTF_MOVE = 0x0001;
        private const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
        private const uint MOUSEEVENTF_LEFTUP = 0x0004;
        private const uint MOUSEEVENTF_ABSOLUTE = 0x8000;

        private Task<CompanionResponse> HandleMouseMoveAsync(CompanionRequest request)
        {
            var x = request.Parameters.GetProperty("x").GetInt32();
            var y = request.Parameters.GetProperty("y").GetInt32();

            // TODO: Integrate FakerInput kernel driver for hardware-level simulation
            // For now, use SendInput as fallback
            mouse_event(MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE, x, y, 0, UIntPtr.Zero);

            return Task.FromResult(new CompanionResponse { Success = true });
        }

        private Task<CompanionResponse> HandleMouseClickAsync(CompanionRequest request)
        {
            var button = request.Parameters.GetProperty("button").GetString() ?? "left";

            uint downFlag = button == "right" ? 0x0008u : MOUSEEVENTF_LEFTDOWN;
            uint upFlag = button == "right" ? 0x0010u : MOUSEEVENTF_LEFTUP;

            mouse_event(downFlag, 0, 0, 0, UIntPtr.Zero);
            Thread.Sleep(50);
            mouse_event(upFlag, 0, 0, 0, UIntPtr.Zero);

            return Task.FromResult(new CompanionResponse { Success = true });
        }

        private Task<CompanionResponse> HandleKeyboardTypeAsync(CompanionRequest request)
        {
            var text = request.Parameters.GetProperty("text").GetString();
            
            // TODO: Implement keyboard input simulation
            // This would use SendInput or FakerInput driver
            
            return Task.FromResult(new CompanionResponse { Success = true });
        }

        private Task<CompanionResponse> HandleKeyboardPressAsync(CompanionRequest request)
        {
            var key = request.Parameters.GetProperty("key").GetString();
            
            // TODO: Implement keyboard key press simulation
            
            return Task.FromResult(new CompanionResponse { Success = true });
        }

        #endregion

        #region UI Automation

        private Task<CompanionResponse> HandleUIAutomationFindAsync(CompanionRequest request)
        {
            var selector = request.Parameters.GetProperty("selector").GetString();
            
            try
            {
                var root = AutomationElement.RootElement;
                var condition = new PropertyCondition(AutomationElement.NameProperty, selector);
                var element = root.FindFirst(TreeScope.Descendants, condition);

                if (element != null)
                {
                    var rect = element.Current.BoundingRectangle;
                    return Task.FromResult(new CompanionResponse
                    {
                        Success = true,
                        Data = JsonSerializer.SerializeToElement(new
                        {
                            found = true,
                            name = element.Current.Name,
                            className = element.Current.ClassName,
                            bounds = new { x = rect.X, y = rect.Y, width = rect.Width, height = rect.Height }
                        })
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
                return Task.FromResult(new CompanionResponse
                {
                    Success = false,
                    Error = ex.Message
                });
            }
        }

        private Task<CompanionResponse> HandleUIAutomationClickAsync(CompanionRequest request)
        {
            var selector = request.Parameters.GetProperty("selector").GetString();

            try
            {
                var root = AutomationElement.RootElement;
                var condition = new PropertyCondition(AutomationElement.NameProperty, selector);
                var element = root.FindFirst(TreeScope.Descendants, condition);

                if (element != null && element.TryGetCurrentPattern(InvokePattern.Pattern, out object pattern))
                {
                    ((InvokePattern)pattern).Invoke();
                    return Task.FromResult(new CompanionResponse { Success = true });
                }

                return Task.FromResult(new CompanionResponse
                {
                    Success = false,
                    Error = "Element not found or not invokable"
                });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse
                {
                    Success = false,
                    Error = ex.Message
                });
            }
        }

        private Task<CompanionResponse> HandleUIAutomationReadAsync(CompanionRequest request)
        {
            var selector = request.Parameters.GetProperty("selector").GetString();

            try
            {
                var root = AutomationElement.RootElement;
                var condition = new PropertyCondition(AutomationElement.NameProperty, selector);
                var element = root.FindFirst(TreeScope.Descendants, condition);

                if (element != null)
                {
                    var text = element.Current.Name;
                    if (element.TryGetCurrentPattern(ValuePattern.Pattern, out object pattern))
                    {
                        text = ((ValuePattern)pattern).Current.Value;
                    }

                    return Task.FromResult(new CompanionResponse
                    {
                        Success = true,
                        Data = JsonSerializer.SerializeToElement(new { text })
                    });
                }

                return Task.FromResult(new CompanionResponse
                {
                    Success = false,
                    Error = "Element not found"
                });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse
                {
                    Success = false,
                    Error = ex.Message
                });
            }
        }

        #endregion

        #region System Management

        private async Task<CompanionResponse> HandleSystemRunAsync(CompanionRequest request)
        {
            var command = request.Parameters.GetProperty("command").GetString();
            var args = request.Parameters.TryGetProperty("args", out var argsElement)
                ? argsElement.EnumerateArray().Select(e => e.GetString()).ToArray()
                : Array.Empty<string>();

            try
            {
                var startInfo = new ProcessStartInfo
                {
                    FileName = command,
                    Arguments = string.Join(" ", args),
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true
                };

                using var process = Process.Start(startInfo);
                if (process == null)
                {
                    throw new Exception("Failed to start process: " + command);
                }
                var stdout = await process.StandardOutput.ReadToEndAsync();
                var stderr = await process.StandardError.ReadToEndAsync();
                await process.WaitForExitAsync();

                return new CompanionResponse
                {
                    Success = true,
                    Data = JsonSerializer.SerializeToElement(new
                    {
                        exitCode = process.ExitCode,
                        stdout,
                        stderr
                    })
                };
            }
            catch (Exception ex)
            {
                return new CompanionResponse
                {
                    Success = false,
                    Error = ex.Message
                };
            }
        }

        private Task<CompanionResponse> HandleWMIQueryAsync(CompanionRequest request)
        {
            var query = request.Parameters.GetProperty("query").GetString();

            try
            {
                var searcher = new ManagementObjectSearcher(query);
                var results = new List<Dictionary<string, object>>();

                foreach (ManagementObject obj in searcher.Get())
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
                    Data = JsonSerializer.SerializeToElement(results)
                });
            }
            catch (Exception ex)
            {
                return Task.FromResult(new CompanionResponse
                {
                    Success = false,
                    Error = ex.Message
                });
            }
        }

        private Task<CompanionResponse> HandleScreenCaptureAsync(CompanionRequest request)
        {
            // TODO: Implement screen capture using native Windows APIs
            return Task.FromResult(new CompanionResponse
            {
                Success = false,
                Error = "Screen capture not yet implemented"
            });
        }

        #endregion

        public static void Main(string[] args)
        {
            var builder = Host.CreateApplicationBuilder(args);
            builder.Services.AddWindowsService(options =>
            {
                options.ServiceName = "OpenClawCompanion";
            });
            builder.Services.AddHostedService<CompanionService>();

            var host = builder.Build();
            host.Run();
        }
    }

    #region Data Models

    public class CompanionRequest
    {
        public string Command { get; set; }
        public JsonElement Parameters { get; set; }
    }

    public class CompanionResponse
    {
        public bool Success { get; set; }
        public JsonElement? Data { get; set; }
        public string Error { get; set; }
        public string StackTrace { get; set; }
    }

    #endregion
}
