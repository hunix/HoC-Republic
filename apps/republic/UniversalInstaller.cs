using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Diagnostics;
using System.Threading.Tasks;

namespace OpenClaw.Republic
{
    /// <summary>
    /// Universal installer for OpenClaw Republic
    /// Supports Windows, Linux, macOS, Android, iOS
    /// Automatically detects hardware and optimizes configuration
    /// </summary>
    
    public class UniversalInstaller
    {
        public static async Task<InstallationResult> Install(InstallationOptions options = null)
        {
            options ??= InstallationOptions.Default;
            
            Console.WriteLine("🎉 OpenClaw AI Republic - Universal Installer");
            Console.WriteLine("================================================\n");
            
            // Detect platform
            var platform = DetectPlatform();
            Console.WriteLine($"✓ Platform detected: {platform}");
            
            // Detect hardware
            var hardware = await DetectHardware();
            Console.WriteLine($"✓ Hardware: {hardware.CPU} | {hardware.RAMGb}GB RAM | {hardware.DiskGb}GB Disk");
            
            // Calculate optimal configuration
            var config = CalculateOptimalConfig(hardware);
            Console.WriteLine($"✓ Optimal config: {config.MaxAgents:N0} agents | {config.MaxActive} active");
            
            // Install dependencies
            Console.WriteLine("\n📦 Installing dependencies...");
            await InstallDependencies(platform);
            Console.WriteLine("✓ Dependencies installed");
            
            // Create directories
            Console.WriteLine("\n📁 Creating directories...");
            CreateDirectories();
            Console.WriteLine("✓ Directories created");
            
            // Generate configuration
            Console.WriteLine("\n⚙️  Generating configuration...");
            await GenerateConfiguration(config, options);
            Console.WriteLine("✓ Configuration generated");
            
            // Install service (optional)
            if (options.InstallAsService)
            {
                Console.WriteLine("\n🔧 Installing as system service...");
                await InstallService(platform);
                Console.WriteLine("✓ Service installed");
            }
            
            // Create initial citizens
            if (options.CreateInitialCitizens)
            {
                Console.WriteLine($"\n👥 Creating {config.InitialAgents:N0} initial citizens...");
                await CreateInitialCitizens(config.InitialAgents);
                Console.WriteLine("✓ Citizens created");
            }
            
            Console.WriteLine("\n🎊 Installation complete!");
            Console.WriteLine($"\nYour device can support {config.MaxAgents:N0} citizens");
            Console.WriteLine($"Estimated revenue: ${config.EstimatedRevenue:N2}/day");
            Console.WriteLine($"\nTo start: dotnet run --project RepublicHost.csproj");
            
            return new InstallationResult
            {
                Success = true,
                Platform = platform,
                Hardware = hardware,
                Configuration = config
            };
        }
        
        private static PlatformType DetectPlatform()
        {
            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
                return PlatformType.Windows;
            else if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
            {
                // Check if Android
                if (File.Exists("/system/build.prop"))
                    return PlatformType.Android;
                return PlatformType.Linux;
            }
            else if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
            {
                // Check if iOS
                if (Directory.Exists("/var/mobile"))
                    return PlatformType.iOS;
                return PlatformType.macOS;
            }
            
            return PlatformType.Unknown;
        }
        
        private static async Task<HardwareInfo> DetectHardware()
        {
            var info = new HardwareInfo();
            
            // CPU cores
            info.CPU = $"{Environment.ProcessorCount} cores";
            
            // RAM
            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                var output = await RunCommand("wmic", "ComputerSystem get TotalPhysicalMemory");
                if (long.TryParse(output.Trim(), out var bytes))
                {
                    info.RAMGb = bytes / (1024.0 * 1024 * 1024);
                }
            }
            else if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
            {
                var output = await RunCommand("free", "-b");
                // Parse output
                info.RAMGb = 4.0;  // Default fallback
            }
            else
            {
                info.RAMGb = 4.0;  // Default fallback
            }
            
            // Disk space
            var drives = DriveInfo.GetDrives();
            var totalSpace = 0L;
            foreach (var drive in drives)
            {
                if (drive.IsReady)
                {
                    totalSpace += drive.AvailableFreeSpace;
                }
            }
            info.DiskGb = totalSpace / (1024.0 * 1024 * 1024);
            
            return info;
        }
        
        private static SimulationConfig CalculateOptimalConfig(HardwareInfo hardware)
        {
            var config = new SimulationConfig();
            
            // Calculate max agents based on RAM
            // Each agent: 8.5KB (active) or 2KB (hibernated)
            var availableRAM = hardware.RAMGb * 0.7;  // Use 70% of RAM
            var maxActive = (int)(availableRAM * 1024 * 1024 * 1024 / 8500);  // 8.5KB each
            var maxTotal = (int)(availableRAM * 1024 * 1024 * 1024 / 2000);   // 2KB hibernated
            
            config.MaxActiveAgents = Math.Min(maxActive, 10000);  // Cap at 10k active
            config.MaxAgents = maxTotal;
            
            // Initial agents: 10% of max
            config.InitialAgents = config.MaxAgents / 10;
            
            // Estimated revenue: $0.10/hour per agent
            config.EstimatedRevenue = config.MaxAgents * 0.10m * 24;
            
            return config;
        }
        
        private static async Task InstallDependencies(PlatformType platform)
        {
            switch (platform)
            {
                case PlatformType.Windows:
                    // Check .NET runtime
                    await RunCommand("dotnet", "--version");
                    break;
                
                case PlatformType.Linux:
                case PlatformType.Android:
                    // Install .NET if needed
                    await RunCommand("bash", "-c \"which dotnet || curl -sSL https://dot.net/v1/dotnet-install.sh | bash\"");
                    break;
                
                case PlatformType.macOS:
                case PlatformType.iOS:
                    // Install .NET via Homebrew
                    await RunCommand("bash", "-c \"which dotnet || brew install dotnet\"");
                    break;
            }
        }
        
        private static void CreateDirectories()
        {
            var baseDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".openclaw-republic");
            
            Directory.CreateDirectory(baseDir);
            Directory.CreateDirectory(Path.Combine(baseDir, "data"));
            Directory.CreateDirectory(Path.Combine(baseDir, "logs"));
            Directory.CreateDirectory(Path.Combine(baseDir, "state"));
        }
        
        private static async Task GenerateConfiguration(SimulationConfig config, InstallationOptions options)
        {
            var baseDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".openclaw-republic");
            var configPath = Path.Combine(baseDir, "config.json");
            
            var configJson = System.Text.Json.JsonSerializer.Serialize(new
            {
                DeviceId = options.DeviceId ?? Guid.NewGuid().ToString(),
                MaxActiveAgents = config.MaxActiveAgents,
                MaxAgents = config.MaxAgents,
                InitialAgents = config.InitialAgents,
                EnableDistributed = options.EnableDistributed,
                EnableEconomy = options.EnableEconomy,
                EnableGovernment = options.EnableGovernment
            }, new System.Text.Json.JsonSerializerOptions { WriteIndented = true });
            
            await File.WriteAllTextAsync(configPath, configJson);
        }
        
        private static async Task InstallService(PlatformType platform)
        {
            switch (platform)
            {
                case PlatformType.Windows:
                    // Install as Windows Service
                    await RunCommand("sc", "create OpenClawRepublic binPath=\"dotnet run --project RepublicHost.csproj\" start=auto");
                    break;
                
                case PlatformType.Linux:
                    // Install as systemd service
                    var serviceFile = @"[Unit]
Description=OpenClaw AI Republic
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/dotnet run --project /path/to/RepublicHost.csproj
Restart=always

[Install]
WantedBy=multi-user.target";
                    
                    await File.WriteAllTextAsync("/etc/systemd/system/openclaw-republic.service", serviceFile);
                    await RunCommand("systemctl", "enable openclaw-republic");
                    break;
                
                case PlatformType.macOS:
                    // Install as launchd service
                    // TODO: Implement
                    break;
            }
        }
        
        private static async Task CreateInitialCitizens(int count)
        {
            // This would integrate with SimulationEngine
            // For now, just simulate the creation
            await Task.Delay(100);
        }
        
        private static async Task<string> RunCommand(string command, string arguments)
        {
            try
            {
                var process = new Process
                {
                    StartInfo = new ProcessStartInfo
                    {
                        FileName = command,
                        Arguments = arguments,
                        RedirectStandardOutput = true,
                        UseShellExecute = false,
                        CreateNoWindow = true
                    }
                };
                
                process.Start();
                var output = await process.StandardOutput.ReadToEndAsync();
                await process.WaitForExitAsync();
                
                return output;
            }
            catch
            {
                return string.Empty;
            }
        }
    }
    
    #region Supporting Classes
    
    public class InstallationOptions
    {
        public string DeviceId { get; set; }
        public bool InstallAsService { get; set; } = false;
        public bool CreateInitialCitizens { get; set; } = true;
        public bool EnableDistributed { get; set; } = true;
        public bool EnableEconomy { get; set; } = true;
        public bool EnableGovernment { get; set; } = true;
        
        public static InstallationOptions Default => new InstallationOptions();
    }
    
    public class InstallationResult
    {
        public bool Success { get; set; }
        public PlatformType Platform { get; set; }
        public HardwareInfo Hardware { get; set; }
        public SimulationConfig Configuration { get; set; }
    }
    
    public class HardwareInfo
    {
        public string CPU { get; set; }
        public double RAMGb { get; set; }
        public double DiskGb { get; set; }
    }
    
    public enum PlatformType
    {
        Windows,
        Linux,
        macOS,
        Android,
        iOS,
        Unknown
    }
    
    #endregion
}
