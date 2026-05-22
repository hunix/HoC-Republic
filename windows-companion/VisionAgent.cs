/**
 * VisionAgent — VLM Computer Vision Integration via Ollama
 *
 * Provides screen analysis, UI element finding, OCR, and action planning
 * using locally-hosted vision language models (Qwen3-VL, LLaVA) via Ollama.
 *
 * Reads configuration from resources/vision.config.json.
 */

using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace OpenClawCompanion
{
    /// <summary>Configuration loaded from resources/vision.config.json</summary>
    public class VisionConfig
    {
        [JsonPropertyName("enabled")]
        public bool Enabled { get; set; }

        [JsonPropertyName("ollamaEndpoint")]
        public string OllamaEndpoint { get; set; } = "http://localhost:11434";

        [JsonPropertyName("model")]
        public string Model { get; set; } = "qwen3-vl:4b";

        [JsonPropertyName("fallbackModel")]
        public string FallbackModel { get; set; } = "llava:7b";

        [JsonPropertyName("temperature")]
        public double Temperature { get; set; } = 0.1;

        [JsonPropertyName("maxTokens")]
        public int MaxTokens { get; set; } = 4096;

        [JsonPropertyName("requestTimeoutSeconds")]
        public int RequestTimeoutSeconds { get; set; } = 120;

        [JsonPropertyName("captureFormat")]
        public string CaptureFormat { get; set; } = "png";

        [JsonPropertyName("captureQuality")]
        public int CaptureQuality { get; set; } = 90;

        [JsonPropertyName("maxImageSizeBytes")]
        public long MaxImageSizeBytes { get; set; } = 10485760;

        [JsonPropertyName("retryAttempts")]
        public int RetryAttempts { get; set; } = 2;

        [JsonPropertyName("retryDelayMs")]
        public int RetryDelayMs { get; set; } = 1000;

        [JsonPropertyName("prompts")]
        public VisionPrompts Prompts { get; set; } = new VisionPrompts();
    }

    public class VisionPrompts
    {
        [JsonPropertyName("analyze")]
        public string Analyze { get; set; } = "Analyze this screenshot. Describe what you see, including UI elements, text, and any notable features. Be precise and structured.";

        [JsonPropertyName("describe")]
        public string Describe { get; set; } = "Describe exactly what is visible on this screen. List all windows, applications, text content, buttons, menus, and UI elements you can identify. Be precise and structured.";

        [JsonPropertyName("findElement")]
        public string FindElement { get; set; } = "Find the UI element matching this description: '{{element}}'. Return the approximate coordinates as JSON.";

        [JsonPropertyName("ocr")]
        public string Ocr { get; set; } = "Extract ALL text visible on this screen. Return it organized by visual region/window. Include menu items, button labels, status bar text, title bars.";
    }

    /// <summary>Ollama API request body for /api/generate</summary>
    internal class OllamaGenerateRequest
    {
        [JsonPropertyName("model")]
        public string Model { get; set; } = "";

        [JsonPropertyName("prompt")]
        public string Prompt { get; set; } = "";

        [JsonPropertyName("images")]
        public List<string> Images { get; set; } = new();

        [JsonPropertyName("stream")]
        public bool Stream { get; set; } = false;

        [JsonPropertyName("options")]
        public OllamaOptions Options { get; set; } = new();
    }

    internal class OllamaOptions
    {
        [JsonPropertyName("temperature")]
        public double Temperature { get; set; }

        [JsonPropertyName("num_predict")]
        public int NumPredict { get; set; }
    }

    /// <summary>Ollama API response body from /api/generate (non-streaming)</summary>
    internal class OllamaGenerateResponse
    {
        [JsonPropertyName("model")]
        public string Model { get; set; } = "";

        [JsonPropertyName("response")]
        public string Response { get; set; } = "";

        [JsonPropertyName("done")]
        public bool Done { get; set; }

        [JsonPropertyName("total_duration")]
        public long TotalDuration { get; set; }

        [JsonPropertyName("eval_count")]
        public int EvalCount { get; set; }

        [JsonPropertyName("prompt_eval_count")]
        public int PromptEvalCount { get; set; }
    }

    /// <summary>Parsed result from vision.find_element</summary>
    public class FindElementResult
    {
        [JsonPropertyName("found")]
        public bool Found { get; set; }

        [JsonPropertyName("x")]
        public int X { get; set; }

        [JsonPropertyName("y")]
        public int Y { get; set; }

        [JsonPropertyName("confidence")]
        public double Confidence { get; set; }

        [JsonPropertyName("description")]
        public string Description { get; set; } = "";
    }

    /// <summary>
    /// VLM-powered vision agent. Captures screenshots and sends them to a local
    /// Ollama instance running a vision-language model for analysis.
    /// </summary>
    public class VisionAgent : IDisposable
    {
        private readonly HttpClient _httpClient;
        private VisionConfig _config;
        private bool _disposed;

        public VisionAgent()
        {
            _config = LoadConfig();
            _httpClient = new HttpClient
            {
                Timeout = TimeSpan.FromSeconds(_config.RequestTimeoutSeconds)
            };
        }

        #region Configuration

        private static VisionConfig LoadConfig()
        {
            // Try user override first, then bundled resource
            var overridePath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                ".openclaw", "resources", "vision.config.json"
            );
            var bundledPath = FindBundledConfigPath();

            string configPath = null;
            if (File.Exists(overridePath))
                configPath = overridePath;
            else if (bundledPath != null && File.Exists(bundledPath))
                configPath = bundledPath;

            if (configPath != null)
            {
                try
                {
                    var json = File.ReadAllText(configPath);
                    return JsonSerializer.Deserialize<VisionConfig>(json) ?? new VisionConfig();
                }
                catch
                {
                    return new VisionConfig();
                }
            }
            return new VisionConfig();
        }

        private static string FindBundledConfigPath()
        {
            // Walk up from executable directory to find resources/vision.config.json
            var dir = AppDomain.CurrentDomain.BaseDirectory;
            for (int i = 0; i < 5; i++)
            {
                var candidate = Path.Combine(dir, "resources", "vision.config.json");
                if (File.Exists(candidate)) return candidate;
                var parent = Directory.GetParent(dir);
                if (parent == null) break;
                dir = parent.FullName;
            }
            return null;
        }

        public void ReloadConfig()
        {
            _config = LoadConfig();
            _httpClient.Timeout = TimeSpan.FromSeconds(_config.RequestTimeoutSeconds);
        }

        public bool IsEnabled => _config.Enabled;

        #endregion

        #region Screen Capture

        /// <summary>Captures the entire primary screen as a PNG base64 string.</summary>
        public string CaptureScreenBase64(int? screenIndex = null, Rectangle? region = null)
        {
            var screen = screenIndex.HasValue && screenIndex.Value < Screen.AllScreens.Length
                ? Screen.AllScreens[screenIndex.Value]
                : Screen.PrimaryScreen;

            var bounds = region ?? screen.Bounds;

            using (var bitmap = new Bitmap(bounds.Width, bounds.Height, PixelFormat.Format32bppArgb))
            using (var graphics = Graphics.FromImage(bitmap))
            {
                graphics.CopyFromScreen(bounds.Location, Point.Empty, bounds.Size);

                using (var stream = new MemoryStream())
                {
                    var format = _config.CaptureFormat?.ToLower() == "jpg" || _config.CaptureFormat?.ToLower() == "jpeg"
                        ? ImageFormat.Jpeg
                        : ImageFormat.Png;

                    if (format == ImageFormat.Jpeg)
                    {
                        var encoder = ImageCodecInfo.GetImageEncoders()
                            .FirstOrDefault(e => e.FormatID == ImageFormat.Jpeg.Guid);
                        if (encoder != null)
                        {
                            var encoderParams = new EncoderParameters(1);
                            encoderParams.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, (int)_config.CaptureQuality);
                            bitmap.Save(stream, encoder, encoderParams);
                        }
                        else
                        {
                            bitmap.Save(stream, format);
                        }
                    }
                    else
                    {
                        bitmap.Save(stream, format);
                    }

                    var bytes = stream.ToArray();
                    if (bytes.Length > _config.MaxImageSizeBytes)
                    {
                        throw new InvalidOperationException(
                            $"Screenshot size ({bytes.Length} bytes) exceeds maximum ({_config.MaxImageSizeBytes} bytes). " +
                            "Try reducing capture quality or capturing a smaller region.");
                    }

                    return Convert.ToBase64String(bytes);
                }
            }
        }

        #endregion

        #region Ollama VLM Client

        /// <summary>
        /// Sends a prompt + image to Ollama's /api/generate endpoint with vision model.
        /// Falls back to the fallback model if the primary model fails.
        /// </summary>
        private async Task<string> QueryVLMAsync(string prompt, string imageBase64, CancellationToken ct = default)
        {
            var models = new[] { _config.Model, _config.FallbackModel };

            Exception lastException = null;

            foreach (var model in models.Where(m => !string.IsNullOrEmpty(m)))
            {
                for (int attempt = 0; attempt <= _config.RetryAttempts; attempt++)
                {
                    try
                    {
                        var request = new OllamaGenerateRequest
                        {
                            Model = model,
                            Prompt = prompt,
                            Images = new List<string> { imageBase64 },
                            Stream = false,
                            Options = new OllamaOptions
                            {
                                Temperature = _config.Temperature,
                                NumPredict = _config.MaxTokens,
                            }
                        };

                        var jsonBody = JsonSerializer.Serialize(request);
                        var content = new StringContent(jsonBody, Encoding.UTF8, "application/json");

                        var endpoint = $"{_config.OllamaEndpoint.TrimEnd('/')}/api/generate";
                        var response = await _httpClient.PostAsync(endpoint, content, ct);
                        response.EnsureSuccessStatusCode();

                        var responseJson = await response.Content.ReadAsStringAsync();
                        var result = JsonSerializer.Deserialize<OllamaGenerateResponse>(responseJson);

                        if (result == null || string.IsNullOrEmpty(result.Response))
                        {
                            throw new InvalidOperationException("Empty response from Ollama");
                        }

                        return result.Response;
                    }
                    catch (Exception ex) when (attempt < _config.RetryAttempts)
                    {
                        lastException = ex;
                        await Task.Delay(_config.RetryDelayMs, ct);
                    }
                    catch (Exception ex)
                    {
                        lastException = ex;
                        break; // Move to next model
                    }
                }
            }

            throw new InvalidOperationException(
                $"All VLM models failed. Last error: {lastException?.Message}", lastException);
        }

        /// <summary>Check if Ollama is reachable and the configured model is available.</summary>
        public async Task<(bool available, string status)> CheckAvailabilityAsync(CancellationToken ct = default)
        {
            try
            {
                var response = await _httpClient.GetAsync(
                    $"{_config.OllamaEndpoint.TrimEnd('/')}/api/tags", ct);
                if (!response.IsSuccessStatusCode)
                    return (false, $"Ollama returned HTTP {response.StatusCode}");

                var json = await response.Content.ReadAsStringAsync();
                var hasModel = json.Contains(_config.Model, StringComparison.OrdinalIgnoreCase);
                var hasFallback = json.Contains(_config.FallbackModel, StringComparison.OrdinalIgnoreCase);

                if (hasModel)
                    return (true, $"Model {_config.Model} available");
                if (hasFallback)
                    return (true, $"Fallback model {_config.FallbackModel} available (primary {_config.Model} not found)");

                return (false, $"Neither {_config.Model} nor {_config.FallbackModel} found in Ollama");
            }
            catch (Exception ex)
            {
                return (false, $"Ollama unavailable: {ex.Message}");
            }
        }

        #endregion

        #region Vision Commands

        /// <summary>Analyze the current screen content.</summary>
        public async Task<CompanionResponse> AnalyzeScreenAsync(
            JsonElement parameters, CancellationToken ct = default)
        {
            if (!_config.Enabled)
                return new CompanionResponse { Success = false, Error = "Vision is disabled in config" };

            try
            {
                var screenIdx = parameters.TryGetProperty("screen", out var sProp) ? (int?)sProp.GetInt32() : null;
                var customPrompt = parameters.TryGetProperty("prompt", out var pProp) ? pProp.GetString() : null;

                var imageBase64 = CaptureScreenBase64(screenIdx);
                var prompt = customPrompt ?? _config.Prompts.Analyze;

                var analysis = await QueryVLMAsync(prompt, imageBase64, ct);

                return new CompanionResponse
                {
                    Success = true,
                    Data = JsonSerializer.SerializeToElement(new
                    {
                        analysis,
                        model = _config.Model,
                        timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                    })
                };
            }
            catch (Exception ex)
            {
                return new CompanionResponse { Success = false, Error = ex.Message };
            }
        }

        /// <summary>Describe everything visible on screen.</summary>
        public async Task<CompanionResponse> DescribeScreenAsync(
            JsonElement parameters, CancellationToken ct = default)
        {
            if (!_config.Enabled)
                return new CompanionResponse { Success = false, Error = "Vision is disabled in config" };

            try
            {
                var screenIdx = parameters.TryGetProperty("screen", out var sProp) ? (int?)sProp.GetInt32() : null;

                var imageBase64 = CaptureScreenBase64(screenIdx);
                var description = await QueryVLMAsync(_config.Prompts.Describe, imageBase64, ct);

                return new CompanionResponse
                {
                    Success = true,
                    Data = JsonSerializer.SerializeToElement(new
                    {
                        description,
                        model = _config.Model,
                        timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                    })
                };
            }
            catch (Exception ex)
            {
                return new CompanionResponse { Success = false, Error = ex.Message };
            }
        }

        /// <summary>Find a UI element by description and return its coordinates.</summary>
        public async Task<CompanionResponse> FindElementAsync(
            JsonElement parameters, CancellationToken ct = default)
        {
            if (!_config.Enabled)
                return new CompanionResponse { Success = false, Error = "Vision is disabled in config" };

            try
            {
                var elementDesc = parameters.TryGetProperty("element", out var eProp)
                    ? eProp.GetString()
                    : parameters.TryGetProperty("description", out var dProp)
                        ? dProp.GetString()
                        : null;

                if (string.IsNullOrEmpty(elementDesc))
                    return new CompanionResponse { Success = false, Error = "element description is required" };

                var screenIdx = parameters.TryGetProperty("screen", out var sProp) ? (int?)sProp.GetInt32() : null;
                var imageBase64 = CaptureScreenBase64(screenIdx);

                var prompt = _config.Prompts.FindElement.Replace("{{element}}", elementDesc);
                var response = await QueryVLMAsync(prompt, imageBase64, ct);

                // Try to parse the VLM response as JSON
                FindElementResult parsedResult = null;
                try
                {
                    // Strip markdown code fences if present
                    var cleanResponse = response.Trim();
                    if (cleanResponse.StartsWith("```"))
                    {
                        var lines = cleanResponse.Split('\n');
                        cleanResponse = string.Join('\n',
                            lines.Skip(1).TakeWhile(l => !l.TrimStart().StartsWith("```")));
                    }
                    parsedResult = JsonSerializer.Deserialize<FindElementResult>(cleanResponse.Trim());
                }
                catch
                {
                    // VLM didn't return valid JSON — return raw text
                }

                if (parsedResult != null)
                {
                    return new CompanionResponse
                    {
                        Success = true,
                        Data = JsonSerializer.SerializeToElement(new
                        {
                            found = parsedResult.Found,
                            x = parsedResult.X,
                            y = parsedResult.Y,
                            confidence = parsedResult.Confidence,
                            description = parsedResult.Description,
                            model = _config.Model,
                            timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                        })
                    };
                }

                return new CompanionResponse
                {
                    Success = true,
                    Data = JsonSerializer.SerializeToElement(new
                    {
                        found = false,
                        rawResponse = response,
                        model = _config.Model,
                        timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                    })
                };
            }
            catch (Exception ex)
            {
                return new CompanionResponse { Success = false, Error = ex.Message };
            }
        }

        /// <summary>Extract all text visible on screen (OCR).</summary>
        public async Task<CompanionResponse> OCRAsync(
            JsonElement parameters, CancellationToken ct = default)
        {
            if (!_config.Enabled)
                return new CompanionResponse { Success = false, Error = "Vision is disabled in config" };

            try
            {
                var screenIdx = parameters.TryGetProperty("screen", out var sProp) ? (int?)sProp.GetInt32() : null;

                // Support optional region for targeted OCR
                Rectangle? region = null;
                if (parameters.TryGetProperty("x", out var xProp) &&
                    parameters.TryGetProperty("y", out var yProp) &&
                    parameters.TryGetProperty("width", out var wProp) &&
                    parameters.TryGetProperty("height", out var hProp))
                {
                    region = new Rectangle(
                        xProp.GetInt32(), yProp.GetInt32(),
                        wProp.GetInt32(), hProp.GetInt32()
                    );
                }

                var imageBase64 = CaptureScreenBase64(screenIdx, region);
                var text = await QueryVLMAsync(_config.Prompts.Ocr, imageBase64, ct);

                return new CompanionResponse
                {
                    Success = true,
                    Data = JsonSerializer.SerializeToElement(new
                    {
                        text,
                        model = _config.Model,
                        hasRegion = region.HasValue,
                        timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                    })
                };
            }
            catch (Exception ex)
            {
                return new CompanionResponse { Success = false, Error = ex.Message };
            }
        }

        /// <summary>Plan a sequence of actions to achieve a goal based on current screen state.</summary>
        public async Task<CompanionResponse> PlanActionAsync(
            JsonElement parameters, CancellationToken ct = default)
        {
            if (!_config.Enabled)
                return new CompanionResponse { Success = false, Error = "Vision is disabled in config" };

            try
            {
                var goal = parameters.TryGetProperty("goal", out var gProp) ? gProp.GetString() : null;
                if (string.IsNullOrEmpty(goal))
                    return new CompanionResponse { Success = false, Error = "goal is required" };

                var imageBase64 = CaptureScreenBase64();

                var prompt = $@"Given the current screen state, plan the steps needed to accomplish this goal: ""{goal}""

Return a JSON array of action steps. Each step should have:
- ""action"": ""click"" | ""type"" | ""scroll"" | ""keypress"" | ""wait""
- ""target"": description of what to interact with
- ""x"": approximate x coordinate (for click)
- ""y"": approximate y coordinate (for click)
- ""text"": text to type (for type action)
- ""key"": key name (for keypress)
- ""reason"": why this step is needed

Return ONLY the JSON array, no other text.";

                var plan = await QueryVLMAsync(prompt, imageBase64, ct);

                return new CompanionResponse
                {
                    Success = true,
                    Data = JsonSerializer.SerializeToElement(new
                    {
                        plan,
                        goal,
                        model = _config.Model,
                        timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                    })
                };
            }
            catch (Exception ex)
            {
                return new CompanionResponse { Success = false, Error = ex.Message };
            }
        }

        /// <summary>Execute a VLM-planned action sequence.</summary>
        public async Task<CompanionResponse> ExecutePlanAsync(
            JsonElement parameters, CancellationToken ct = default)
        {
            if (!_config.Enabled)
                return new CompanionResponse { Success = false, Error = "Vision is disabled in config" };

            try
            {
                // First plan, then attempt to parse and note what actions would be executed.
                // Actual execution is deferred to the companion's input handlers for safety.
                var goal = parameters.TryGetProperty("goal", out var gProp) ? gProp.GetString() : null;
                if (string.IsNullOrEmpty(goal))
                    return new CompanionResponse { Success = false, Error = "goal is required" };

                var planResponse = await PlanActionAsync(parameters, ct);
                if (!planResponse.Success)
                    return planResponse;

                return new CompanionResponse
                {
                    Success = true,
                    Data = JsonSerializer.SerializeToElement(new
                    {
                        status = "plan_generated",
                        message = "Action plan generated. Use individual input commands (input.mouse.click, input.keyboard.type, etc.) to execute each step for safety.",
                        plan = planResponse.Data,
                        timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                    })
                };
            }
            catch (Exception ex)
            {
                return new CompanionResponse { Success = false, Error = ex.Message };
            }
        }

        #endregion

        #region Disposal

        public void Dispose()
        {
            if (!_disposed)
            {
                _disposed = true;
                _httpClient?.Dispose();
            }
        }

        #endregion
    }
}
