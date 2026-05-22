# OpenClaw Windows Companion Service

## Overview

The OpenClaw Windows Companion Service is a C#/.NET application that provides high-privilege Windows-specific capabilities to the OpenClaw agent. It runs as a Windows Service with NT AUTHORITY\SYSTEM privileges and communicates with the TypeScript node-host via Named Pipes.

## Features

### Physical-Level Input Simulation
- Hardware-level mouse and keyboard input via Windows SendInput API
- Prepared for FakerInput kernel driver integration for truly undetectable input
- Bypasses application-level input detection and anti-cheat systems

### Full Desktop UI Automation
- Microsoft UI Automation (UIA) framework integration
- Programmatic access to any Windows application UI
- Element discovery, interaction, and text reading
- Works with native Windows applications, not just web browsers

### Deep System Management
- Windows Management Instrumentation (WMI) queries
- Service control and management
- Registry access
- Process management
- Network configuration

### Secure Command Execution
- Controlled command execution with SYSTEM privileges
- Fine-grained environment control
- Security policy enforcement
- Audit logging

## Requirements

- Windows 10/11 or Windows Server 2019/2022
- .NET 8.0 SDK (for building)
- .NET 8.0 Runtime (for running)
- Administrator privileges (for installation)

## Building

### Prerequisites

1. Install .NET 8.0 SDK from https://dotnet.microsoft.com/download/dotnet/8.0

2. Verify installation:
```powershell
dotnet --version
```

### Build Commands

```powershell
# Navigate to the windows-companion directory
cd windows-companion

# Restore dependencies
dotnet restore

# Build the project
dotnet build --configuration Release

# Publish as a self-contained executable
dotnet publish --configuration Release --runtime win-x64 --self-contained true -p:PublishSingleFile=true
```

The compiled executable will be in `bin/Release/net8.0-windows/win-x64/publish/OpenClawCompanion.exe`

## Installation

### Install as Windows Service

Run PowerShell as Administrator:

```powershell
# Create the service
sc.exe create OpenClawCompanion binPath= "C:\Path\To\OpenClawCompanion.exe" start= auto DisplayName= "OpenClaw Companion Service"

# Set the service to run as LocalSystem
sc.exe config OpenClawCompanion obj= LocalSystem

# Configure failure recovery (restart on failure)
sc.exe failure OpenClawCompanion reset= 86400 actions= restart/60000/restart/60000/restart/60000

# Set service description
sc.exe description OpenClawCompanion "Provides high-privilege Windows capabilities for OpenClaw agent"

# Start the service
sc.exe start OpenClawCompanion
```

### Verify Installation

```powershell
# Check service status
sc.exe query OpenClawCompanion

# View service configuration
sc.exe qc OpenClawCompanion
```

## Uninstallation

Run PowerShell as Administrator:

```powershell
# Stop the service
sc.exe stop OpenClawCompanion

# Delete the service
sc.exe delete OpenClawCompanion
```

## Configuration

### Named Pipe

The service listens on the named pipe: `\\.\pipe\OpenClawCompanion`

To change the pipe name, modify the `_pipeName` variable in `OpenClawCompanion.cs` and rebuild.

### Security

The service runs with NT AUTHORITY\SYSTEM privileges, which provides:
- Full access to local system resources
- Ability to interact with all user sessions
- Bypass of User Account Control (UAC)
- Access to protected system files and registry keys

**Important**: Ensure proper validation of all commands sent to the companion service to prevent security vulnerabilities.

## IPC Protocol

### Request Format

```json
{
  "command": "command.name",
  "parameters": {
    "param1": "value1",
    "param2": "value2"
  }
}
```

### Response Format

```json
{
  "success": true,
  "data": {
    "result": "data"
  }
}
```

Or on error:

```json
{
  "success": false,
  "error": "Error message",
  "stackTrace": "Stack trace details"
}
```

## Supported Commands

### Input Simulation

- `input.mouse.move` - Move mouse cursor
  - Parameters: `x` (int), `y` (int)
  
- `input.mouse.click` - Click mouse button
  - Parameters: `button` (string: "left", "right", "middle")
  
- `input.keyboard.type` - Type text
  - Parameters: `text` (string)
  
- `input.keyboard.press` - Press keyboard key
  - Parameters: `key` (string), `modifiers` (string[])

### UI Automation

- `ui.automation.find` - Find UI element
  - Parameters: `selector` (string)
  - Returns: `{ found, name, className, bounds }`
  
- `ui.automation.click` - Click UI element
  - Parameters: `selector` (string)
  
- `ui.automation.read` - Read text from UI element
  - Parameters: `selector` (string)
  - Returns: `{ text }`

### System Management

- `system.run` - Execute command
  - Parameters: `command` (string), `args` (string[])
  - Returns: `{ exitCode, stdout, stderr }`
  
- `system.wmi.query` - Execute WMI query
  - Parameters: `query` (string)
  - Returns: Array of objects with query results
  
- `screen.capture` - Capture screen
  - Parameters: none
  - Returns: `{ image }` (base64 encoded)

## Troubleshooting

### Service Won't Start

1. Check Event Viewer → Windows Logs → Application for error messages
2. Verify the executable path is correct
3. Ensure .NET 8.0 Runtime is installed
4. Check file permissions on the executable

### Named Pipe Connection Failed

1. Verify the service is running: `sc.exe query OpenClawCompanion`
2. Check that no firewall is blocking named pipe communication
3. Verify the pipe name matches in both C# and TypeScript code

### Permission Denied Errors

1. Confirm the service is running as LocalSystem
2. Check UAC settings
3. Verify the service has the necessary privileges

### High CPU Usage

1. Check for infinite loops in the server task
2. Verify proper cleanup of pipe connections
3. Review Event Log for repeated errors

## Development

### Adding New Commands

1. Add a new case to the `ProcessRequestAsync` switch statement
2. Implement the handler method (e.g., `HandleNewCommandAsync`)
3. Update the TypeScript bridge in `src/infra/companion-bridge.ts`
4. Add a high-level API method in `src/node-host/runner-enhanced.ts`
5. Rebuild and redeploy the service

### Debugging

To debug the service:

1. Build in Debug configuration
2. Attach Visual Studio debugger to the running service process
3. Or run the executable directly (not as a service) for console debugging

### Testing

Create a simple test client in C# or PowerShell to send commands via named pipe:

```csharp
using System.IO.Pipes;

var client = new NamedPipeClientStream(".", "OpenClawCompanion", PipeDirection.InOut);
await client.ConnectAsync();

var writer = new StreamWriter(client) { AutoFlush = true };
var reader = new StreamReader(client);

await writer.WriteLineAsync("{\"command\":\"system.run\",\"parameters\":{\"command\":\"whoami\"}}");
var response = await reader.ReadLineAsync();
Console.WriteLine(response);
```

## FakerInput Integration

### Overview

FakerInput is a kernel-mode driver that provides hardware-level input simulation. It makes input appear to come from actual physical devices, making it undetectable by applications.

### Installation Steps

1. Download FakerInput from https://github.com/Chaoses-Ib/FakerInput
2. Build the driver using Windows Driver Kit (WDK)
3. Sign the driver with a valid certificate (or enable test signing)
4. Install the driver:
   ```cmd
   sc create FakerInput type= kernel binPath= "C:\Path\To\FakerInput.sys"
   sc start FakerInput
   ```
5. Update `OpenClawCompanion.cs` to use FakerInput APIs instead of SendInput

### Benefits

- Truly hardware-level input simulation
- Bypasses all application-level detection
- Works with games and anti-cheat systems
- Indistinguishable from physical input

## Security Best Practices

1. **Validate All Commands**: Implement a whitelist of allowed commands
2. **Audit Logging**: Log all privileged operations to Event Log
3. **Secure the Pipe**: Set appropriate ACLs on the named pipe
4. **Rate Limiting**: Implement rate limiting to prevent abuse
5. **Input Validation**: Sanitize all parameters before execution
6. **Least Privilege**: Consider running specific operations with reduced privileges when possible

## License

This component is part of the OpenClaw project. Refer to the main project LICENSE file.

## Support

For issues and questions:
- GitHub Issues: https://github.com/openclaw/openclaw/issues
- Documentation: https://docs.openclaw.ai

## Changelog

### Version 1.0.0 (2026-02-08)
- Initial implementation
- Named pipe IPC server
- Input simulation via SendInput
- UI Automation integration
- WMI query support
- Secure command execution
