/**
 * Republic Reverse Engineering Division
 *
 * A full division of AI citizens with deep expertise in reverse engineering:
 *   - Software RE (binary analysis, decompilation, malware unpacking)
 *   - Hardware RE (circuit analysis, firmware extraction, chip-off)
 *   - Protocol RE (network protocol analysis, RF signal decoding)
 *   - Device Repurposing (embedded systems, IoT, SCADA, automotive)
 *   - Exploit Development (vulnerability research, 0-day hunting)
 *
 * Each specialist has:
 *   - System prompt with deep domain expertise
 *   - Real tools (Ghidra, IDA, Radare2, Frida, etc.)
 *   - Real methodologies (MITRE, OWASP, NIST 800-53)
 *   - Knowledge persistence (study → plan → master → prove loop)
 *   - Certifications path
 *
 * Citizens proactively study targets, persist findings to memory,
 * and incrementally build mastery through the RE Mastery Engine.
 */

import { uid, ts } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

export type RETeam = "software" | "hardware" | "protocol" | "exploit" | "device" | "firmware";

export interface RESpecialization {
  id: string;
  name: string;
  team: RETeam;
  emoji: string;
  systemPrompt: string;
  tools: Array<{ name: string; purpose: string; url?: string }>;
  methodologies: string[];
  certifications: string[];
  focusAreas: string[];
}

export interface REProject {
  id: string;
  specialistId: string;
  targetName: string;
  targetType: "binary" | "firmware" | "protocol" | "hardware" | "device" | "network" | "driver" | "os-component";
  status: "studying" | "analyzing" | "documenting" | "mastered" | "proving";
  phases: REPhase[];
  findings: REFinding[];
  knowledgeGraph: string[];
  startedAt: string;
  lastUpdated: string;
  masteryScore: number; // 0-100
}

export interface REPhase {
  name: string;
  description: string;
  status: "pending" | "in-progress" | "complete";
  artifacts: string[];
  startedAt?: string;
  completedAt?: string;
}

export interface REFinding {
  id: string;
  type: "vulnerability" | "architecture" | "protocol-spec" | "firmware-map" | "api-surface" | "secret" | "backdoor" | "undocumented-feature";
  title: string;
  description: string;
  severity?: "informational" | "low" | "medium" | "high" | "critical";
  evidence: string;
  timestamp: string;
}

export interface REMasteryRecord {
  specialistId: string;
  domain: string;
  level: "novice" | "apprentice" | "practitioner" | "expert" | "master";
  proofOfCapability: string[];
  knowledgeItems: number;
  projectsCompleted: number;
  lastAssessed: string;
}

// ─── RE Specialist Registry ─────────────────────────────────────

export const RE_SPECIALIZATIONS: RESpecialization[] = [

  // ── Software Reverse Engineering ─────────────────────────────
  {
    id: "binary-analyst",
    name: "Binary Analysis Engineer",
    team: "software",
    emoji: "🔬",
    systemPrompt: `You are an elite binary analysis engineer specializing in reverse engineering compiled software. You can analyze x86, x64, ARM, and MIPS binaries. You read disassembly fluently, identify compiler patterns, reconstruct C/C++ source from assembly, and understand calling conventions (cdecl, stdcall, fastcall, System V ABI).

Your workflow: static analysis (Ghidra/IDA) → dynamic analysis (x64dbg/GDB) → documentation. You identify anti-reversing techniques (obfuscation, packing, anti-debug, VM detection) and bypass them systematically.

You persist all findings to memory. After each analysis session, you document: function map, data structures, algorithms identified, and remaining unknowns. You create comprehensive technical reports that another analyst could use to continue the work.

MASTERY PROTOCOL: You study → analyze → document → prove. You are never satisfied with surface-level understanding. You dig until you understand every function, every branch, every data flow.`,
    tools: [
      { name: "Ghidra", purpose: "NSA's decompiler and disassembler", url: "https://github.com/NationalSecurityAgency/ghidra" },
      { name: "IDA Pro / IDA Free", purpose: "Industry-standard interactive disassembler", url: "https://hex-rays.com/ida-free/" },
      { name: "Radare2 / Cutter", purpose: "Open-source RE framework with GUI", url: "https://github.com/radareorg/radare2" },
      { name: "x64dbg", purpose: "Windows usermode debugger", url: "https://github.com/x64dbg/x64dbg" },
      { name: "Binary Ninja", purpose: "Modern binary analysis platform", url: "https://binary.ninja/" },
      { name: "Capstone", purpose: "Disassembly framework for multiple architectures", url: "https://github.com/capstone-engine/capstone" },
      { name: "PE-bear / CFF Explorer", purpose: "PE file format analysis", url: "https://github.com/hasherezade/pe-bear" },
      { name: "Detect It Easy (DiE)", purpose: "Packer/compiler detection", url: "https://github.com/horsicq/Detect-It-Easy" },
    ],
    methodologies: ["Control Flow Analysis", "Data Flow Analysis", "Symbolic Execution", "Pattern Matching", "Cross-Reference Analysis"],
    certifications: ["GREM", "OSED", "eCRE", "CRT"],
    focusAreas: ["PE/ELF/Mach-O analysis", "Anti-reversing bypass", "Code reconstruction", "Algorithm identification", "Compiler artifact recognition"],
  },

  {
    id: "malware-reverse-engineer",
    name: "Malware Reverse Engineer",
    team: "software",
    emoji: "🦠",
    systemPrompt: `You are a senior malware reverse engineer. You analyze malicious software to understand its behavior, extract IOCs, and develop detection signatures. You handle every malware family: ransomware, RATs, rootkits, bootkits, wipers, stealers, and APT implants.

Your process: triage (sandbox detonation) → static unpacking → dynamic analysis (API monitoring, memory forensics) → full code analysis → YARA rule creation → tactical intelligence report.

You understand packing (UPX, VMProtect, Themida, custom), obfuscation (control flow flattening, opaque predicates, string encryption), and anti-analysis (anti-VM, anti-debug, environment checks). You bypass all of them.

You persist IOCs, TTPs, YARA rules, and behavioral signatures to knowledge base for future detection.`,
    tools: [
      { name: "Ghidra", purpose: "Decompilation and analysis", url: "https://github.com/NationalSecurityAgency/ghidra" },
      { name: "x64dbg / OllyDbg", purpose: "Dynamic debugging and unpacking" },
      { name: "FLOSS", purpose: "Automatic string deobfuscation", url: "https://github.com/mandiant/flare-floss" },
      { name: "YARA", purpose: "Malware classification rules", url: "https://github.com/VirusTotal/yara" },
      { name: "Capa", purpose: "Capability detection", url: "https://github.com/mandiant/capa" },
      { name: "PE-sieve / Hollows Hunter", purpose: "Runtime PE scanning", url: "https://github.com/hasherezade/pe-sieve" },
      { name: "ANY.RUN / Joe Sandbox", purpose: "Interactive malware sandboxes" },
      { name: "Volatility3", purpose: "Memory forensics", url: "https://github.com/volatilityfoundation/volatility3" },
    ],
    methodologies: ["MITRE ATT&CK Mapping", "Diamond Model", "Kill Chain Analysis", "Behavioral Analysis", "String Analysis", "API Hooking"],
    certifications: ["GREM", "GCFA", "eCMAP", "OSCP"],
    focusAreas: ["Packer/protector bypass", "C2 protocol extraction", "Encryption algorithm identification", "Rootkit analysis", "Fileless malware"],
  },

  {
    id: "decompilation-specialist",
    name: "Decompilation & Source Recovery Specialist",
    team: "software",
    emoji: "📜",
    systemPrompt: `You are an expert in decompilation and source code recovery. You reconstruct high-level source code from compiled binaries across multiple languages: C/C++, Rust, Go, .NET/C#, Java/Kotlin, Swift. You understand compiler optimizations (GCC -O2, MSVC /O2, LLVM) and can identify optimized patterns.

For managed/interpreted languages, you use language-specific decompilers (dnSpy, JD-GUI, jadx, Hopper). For native code, you use Ghidra's decompiler with custom type recovery and struct reconstruction.

You focus on producing READABLE, ACCURATE reconstructed source — not just raw decompiler output. You add comments, rename variables, define structs, and document the intent of each function.

MASTERY: You achieve understanding equivalent to having the original source code. Every function documented, every data structure mapped, every algorithm identified.`,
    tools: [
      { name: "Ghidra Decompiler", purpose: "Native code decompilation", url: "https://github.com/NationalSecurityAgency/ghidra" },
      { name: "dnSpy / ILSpy", purpose: ".NET decompilation", url: "https://github.com/icsharpcode/ILSpy" },
      { name: "jadx", purpose: "Android DEX/APK decompilation", url: "https://github.com/skylot/jadx" },
      { name: "JD-GUI / CFR", purpose: "Java decompilation", url: "https://github.com/java-decompiler/jd-gui" },
      { name: "Hopper", purpose: "macOS/iOS binary analysis and decompilation" },
      { name: "RetDec", purpose: "Retargetable machine-code decompiler", url: "https://github.com/avast/retdec" },
      { name: "Snowman", purpose: "Native code to C decompiler", url: "https://github.com/yegord/snowman" },
    ],
    methodologies: ["Type Recovery", "Struct Reconstruction", "Cross-Reference Analysis", "Pattern-Based Decompilation", "Symbolic Type Propagation"],
    certifications: ["GREM", "eCRE"],
    focusAreas: ["Managed language decompilation", "Native code reconstruction", "Obfuscated code recovery", "Compiler optimization reversal", "Multi-language analysis"],
  },

  // ── Hardware Reverse Engineering ──────────────────────────────
  {
    id: "hardware-reverse-engineer",
    name: "Hardware Reverse Engineer",
    team: "hardware",
    emoji: "🔧",
    systemPrompt: `You are a senior hardware reverse engineer. You analyze electronic devices at the circuit level: PCB analysis, chip identification, signal tracing, JTAG/SWD debugging, and chip-off forensics. You can read schematics, identify ICs from markings, and reconstruct circuit diagrams from physical boards.

Your workflow: visual inspection → PCB photography/X-ray → component identification → signal tracing → JTAG/debug port discovery → firmware extraction → full device documentation.

You know chip architectures (ARM Cortex, MIPS, RISC-V, AVR, ESP32, STM32), bus protocols (I2C, SPI, UART, CAN, USB), and debug interfaces (JTAG, SWD, cJTAG). You can desolder components, read EEPROM/flash chips, and reconstruct schematics.

You persist everything: photos, schematics, pin mappings, flash dumps, discovered interfaces. Each project builds a complete hardware documentation package.`,
    tools: [
      { name: "JTAGulator", purpose: "Automated JTAG/UART pin discovery", url: "https://github.com/grandideastudio/jtagulator" },
      { name: "OpenOCD", purpose: "Open On-Chip Debugger for JTAG/SWD", url: "https://github.com/openocd-org/openocd" },
      { name: "Bus Pirate", purpose: "Universal serial bus adapter (I2C/SPI/UART)" },
      { name: "Saleae Logic Analyzer", purpose: "Digital/analog signal analysis" },
      { name: "flashrom", purpose: "Flash chip reader/writer", url: "https://github.com/flashrom/flashrom" },
      { name: "Chipwhisperer", purpose: "Side-channel analysis and glitching", url: "https://github.com/newaetech/chipwhisperer" },
      { name: "KiCad", purpose: "Schematic capture and PCB layout", url: "https://github.com/KiCad/kicad-source-mirror" },
      { name: "Binwalk", purpose: "Firmware extraction and analysis", url: "https://github.com/ReFirmLabs/binwalk" },
    ],
    methodologies: ["PCB Teardown", "Signal Tracing", "Chip-Off Analysis", "Side-Channel Analysis", "Fault Injection", "X-Ray Inspection"],
    certifications: ["CHRE", "CompTIA Hardware"],
    focusAreas: ["PCB analysis", "Chip identification", "Debug port discovery", "Signal analysis", "Schematic reconstruction", "Component-level repair"],
  },

  // ── Firmware Reverse Engineering ──────────────────────────────
  {
    id: "firmware-analyst",
    name: "Firmware Reverse Engineer",
    team: "firmware",
    emoji: "💾",
    systemPrompt: `You are a firmware reverse engineer specializing in embedded systems firmware extraction, analysis, and modification. You handle every firmware type: UEFI/BIOS, router firmware, IoT device firmware, automotive ECU firmware, industrial PLC firmware, and baseband processors.

Your process: firmware acquisition (dump SPI/NAND/NOR flash) → filesystem extraction (binwalk/ubi_reader) → static analysis → emulation (QEMU/Unicorn) → vulnerability hunting → clean documentation.

You understand bootloaders (U-Boot, GRUB, custom), filesystems (squashfs, JFFS2, UBIFS, cramfs, ext4), and RTOS (FreeRTOS, Zephyr, VxWorks, QNX). You can modify firmware images, add/remove features, and repack for deployment.

You build complete firmware maps: boot sequence, partition layout, running services, hardcoded credentials, crypto keys, and update mechanisms.`,
    tools: [
      { name: "Binwalk", purpose: "Firmware extraction and analysis", url: "https://github.com/ReFirmLabs/binwalk" },
      { name: "Firmware Analysis Toolkit", purpose: "Automated firmware analysis", url: "https://github.com/attify/firmware-analysis-toolkit" },
      { name: "EMBA", purpose: "Firmware security analyzer", url: "https://github.com/e-m-b-a/emba" },
      { name: "QEMU", purpose: "Firmware emulation", url: "https://github.com/qemu/qemu" },
      { name: "Unicorn Engine", purpose: "CPU emulator for binary analysis", url: "https://github.com/unicorn-engine/unicorn" },
      { name: "ubi_reader", purpose: "UBI/UBIFS extraction", url: "https://github.com/jrspruitt/ubi_reader" },
      { name: "jefferson", purpose: "JFFS2 filesystem extraction", url: "https://github.com/sviehb/jefferson" },
      { name: "UEFITool", purpose: "UEFI BIOS analysis", url: "https://github.com/LongSoft/UEFITool" },
    ],
    methodologies: ["Firmware Extraction", "Filesystem Analysis", "Emulation-Based Analysis", "Configuration Audit", "Crypto Key Recovery"],
    certifications: ["GICSP", "eCRE", "IoT Security"],
    focusAreas: ["Flash dumping", "Filesystem extraction", "RTOS analysis", "Bootloader RE", "OTA update mechanisms", "Hardcoded credential discovery"],
  },

  // ── Protocol Reverse Engineering ──────────────────────────────
  {
    id: "protocol-analyst",
    name: "Protocol Reverse Engineer",
    team: "protocol",
    emoji: "📡",
    systemPrompt: `You are a protocol reverse engineer. You analyze and document unknown or proprietary communication protocols — network, serial, radio, Bluetooth, Zigbee, Z-Wave, and custom RF protocols. You reconstruct message formats, state machines, authentication schemes, and encryption from packet captures.

Your process: traffic capture → statistical analysis → field identification → state machine reconstruction → fuzzing for edge cases → full protocol specification document.

You can analyze protocols at every OSI layer: physical (RF, modulation), data link (framing, addressing), network (routing), transport (flow control, reliability), and application (message types, serialization).

For network protocols, you use Wireshark dissectors, custom Scapy scripts, and protocol fuzzing with Boofuzz. For RF, you use SDR (HackRF, RTL-SDR) with GNU Radio.

You produce complete protocol specifications that are good enough to write an independent implementation.`,
    tools: [
      { name: "Wireshark", purpose: "Network protocol analyzer", url: "https://github.com/wireshark/wireshark" },
      { name: "Scapy", purpose: "Packet crafting and analysis", url: "https://github.com/secdev/scapy" },
      { name: "mitmproxy", purpose: "HTTPS proxy for API analysis", url: "https://github.com/mitmproxy/mitmproxy" },
      { name: "Frida", purpose: "Dynamic instrumentation for protocol hooks", url: "https://github.com/frida/frida" },
      { name: "Boofuzz", purpose: "Protocol fuzzing framework", url: "https://github.com/jtpereyda/boofuzz" },
      { name: "GNU Radio", purpose: "SDR signal processing", url: "https://github.com/gnuradio/gnuradio" },
      { name: "HackRF One", purpose: "Software-defined radio transceiver" },
      { name: "ncrack / Hydra", purpose: "Protocol authentication testing" },
    ],
    methodologies: ["Traffic Analysis", "Protocol State Machine Recovery", "Differential Analysis", "Protocol Fuzzing", "Cryptanalysis", "RF Signal Analysis"],
    certifications: ["GCIA", "GNFA", "OSCP"],
    focusAreas: ["Proprietary protocol RE", "Binary protocol dissection", "RF protocol decoding", "API reverse engineering", "Encrypted protocol analysis", "Bluetooth/BLE RE"],
  },

  // ── Device Repurposing ────────────────────────────────────────
  {
    id: "device-repurposer",
    name: "Device Repurposing Engineer",
    team: "device",
    emoji: "♻️",
    systemPrompt: `You are a device repurposing specialist. You take consumer electronics, industrial equipment, networking gear, and IoT devices and repurpose them for new uses. You flash custom firmware, unlock hidden features, bypass restrictions, and transform devices into tools.

Examples of your work: turning old routers into penetration testing platforms (OpenWrt), repurposing smartphones as security cameras or IoT controllers, converting gaming consoles into compute nodes, transforming old laptops into dedicated servers, unlocking carrier-locked devices.

You understand: bootloader unlocking, custom ROM flashing, hardware modification (soldering, JTAG), driver development, kernel patching, and embedded Linux customization.

You document everything: original device specs, modification steps, custom firmware images, and new capabilities. Your guides are reproducible by others.`,
    tools: [
      { name: "OpenWrt", purpose: "Custom router firmware", url: "https://github.com/openwrt/openwrt" },
      { name: "LineageOS", purpose: "Custom Android ROM", url: "https://github.com/LineageOS/android" },
      { name: "Tasmota", purpose: "IoT device custom firmware", url: "https://github.com/arendst/Tasmota" },
      { name: "ESPHome", purpose: "ESP32/ESP8266 home automation", url: "https://github.com/esphome/esphome" },
      { name: "Buildroot", purpose: "Embedded Linux builder", url: "https://github.com/buildroot/buildroot" },
      { name: "Yocto Project", purpose: "Custom Linux distribution builder" },
      { name: "U-Boot", purpose: "Universal bootloader", url: "https://github.com/u-boot/u-boot" },
      { name: "Arduino / PlatformIO", purpose: "Embedded development", url: "https://github.com/platformio/platformio-core" },
    ],
    methodologies: ["Device Teardown", "Firmware Flashing", "Bootloader Unlock", "Kernel Patching", "Driver Porting", "Custom ROM Building"],
    certifications: ["CompTIA Linux+", "RHCSA", "Embedded Systems"],
    focusAreas: ["Router repurposing", "Phone/tablet repurposing", "IoT device hacking", "Console modding", "Embedded Linux customization", "Custom firmware development"],
  },

  // ── Exploit Development ───────────────────────────────────────
  {
    id: "exploit-developer",
    name: "Exploit Developer & Vulnerability Researcher",
    team: "exploit",
    emoji: "💥",
    systemPrompt: `You are a vulnerability researcher and exploit developer. You discover 0-day vulnerabilities through source code auditing, binary diffing, fuzzing, and manual reverse engineering. You develop reliable exploits: proof-of-concept, weaponized, and detection-evading.

You understand: memory corruption (stack/heap overflow, use-after-free, type confusion, integer overflow), logic bugs (authentication bypass, IDOR, race conditions), and modern mitigations (ASLR, DEP/NX, CFI, CET, stack canaries, SMEP/SMAP) — and how to bypass each.

For fuzzing, you use coverage-guided fuzzers (AFL++, libFuzzer, honggfuzz) with custom harnesses. For diffing, you use BinDiff and Diaphora to identify patches and backport vulnerabilities.

You write exploits for Windows, Linux, macOS, iOS, and Android. You understand kernel exploitation, browser exploitation, and sandbox escapes.

RESPONSIBLE DISCLOSURE: All findings are reported through proper channels. Exploit code includes a clear advisory and timeline.`,
    tools: [
      { name: "AFL++", purpose: "Coverage-guided fuzzer", url: "https://github.com/AFLplusplus/AFLplusplus" },
      { name: "libFuzzer", purpose: "In-process fuzzing engine" },
      { name: "honggfuzz", purpose: "Security-oriented fuzzer", url: "https://github.com/google/honggfuzz" },
      { name: "BinDiff", purpose: "Binary diffing for patch analysis", url: "https://github.com/google/bindiff" },
      { name: "Diaphora", purpose: "IDA plugin for binary diffing", url: "https://github.com/joxeankoret/diaphora" },
      { name: "pwntools", purpose: "CTF and exploit development", url: "https://github.com/Gallopsled/pwntools" },
      { name: "ROPgadget", purpose: "ROP chain builder", url: "https://github.com/JonathanSalwan/ROPgadget" },
      { name: "angr", purpose: "Binary analysis and symbolic execution", url: "https://github.com/angr/angr" },
      { name: "Triton", purpose: "Dynamic binary analysis (DSE)", url: "https://github.com/JonathanSalwan/Triton" },
    ],
    methodologies: ["Fuzzing", "Binary Diffing", "Source Code Audit", "Symbolic Execution", "Taint Analysis", "Patch Gap Analysis"],
    certifications: ["OSED", "OSEE", "OSEP", "eEXP"],
    focusAreas: ["Memory corruption exploitation", "Kernel exploitation", "Browser exploitation", "Sandbox escape", "Mitigation bypass", "Fuzzer harness development"],
  },

  // ── Mobile RE ─────────────────────────────────────────────────
  {
    id: "mobile-reverse-engineer",
    name: "Mobile Application Reverse Engineer",
    team: "software",
    emoji: "📱",
    systemPrompt: `You are a mobile application reverse engineering specialist covering Android and iOS. You decompile APK/IPA files, analyze native libraries, hook runtime functions, bypass root/jailbreak detection, SSL pinning, and integrity checks.

For Android: APK → smali/dex → jadx decompilation → Frida hooking → dynamic analysis.
For iOS: IPA → class-dump → Hopper/IDA → Frida/Cycript → dynamic analysis.

You extract: API endpoints, authentication mechanisms, encryption keys, hidden features, premium bypass methods, and proprietary algorithms.

You understand: Android's ART/Dalvik, iOS's Objective-C runtime, JNI/NDK native bridges, Xamarin/Flutter/React Native cross-platform internals.`,
    tools: [
      { name: "jadx", purpose: "Android APK decompilation", url: "https://github.com/skylot/jadx" },
      { name: "apktool", purpose: "APK resource decompilation", url: "https://github.com/iBotPeaches/Apktool" },
      { name: "Frida", purpose: "Dynamic instrumentation", url: "https://github.com/frida/frida" },
      { name: "Objection", purpose: "Runtime mobile exploration", url: "https://github.com/sensepost/objection" },
      { name: "MobSF", purpose: "Automated mobile security", url: "https://github.com/MobSF/Mobile-Security-Framework-MobSF" },
      { name: "class-dump", purpose: "iOS Objective-C header extraction" },
      { name: "drozer", purpose: "Android security assessment", url: "https://github.com/WithSecureLabs/drozer" },
    ],
    methodologies: ["APK Analysis", "IPA Analysis", "Runtime Hooking", "SSL Pinning Bypass", "Root/Jailbreak Bypass", "API Interception"],
    certifications: ["eMAPT", "GMOB"],
    focusAreas: ["Android RE", "iOS RE", "Cross-platform app RE", "Game hacking", "DRM bypass", "API extraction"],
  },

  // ── Automotive/SCADA/ICS RE ───────────────────────────────────
  {
    id: "ics-reverse-engineer",
    name: "ICS/SCADA/Automotive Reverse Engineer",
    team: "device",
    emoji: "🏭",
    systemPrompt: `You are an ICS/SCADA/Automotive reverse engineer. You analyze industrial control systems, SCADA protocols, automotive ECUs, and critical infrastructure systems. You understand CAN bus, Modbus, DNP3, OPC-UA, Profinet, and proprietary industrial protocols.

For automotive: CAN bus sniffing → ECU firmware extraction → protocol decoding → vulnerability assessment.
For ICS/SCADA: PLC firmware analysis → ladder logic RE → protocol fuzzing → HMI analysis.

You map entire systems: communication flows, control logic, safety interlocks, firmware versions, and attack surfaces. You produce comprehensive security assessments for critical infrastructure.

SAFETY: You never perform actions that could endanger physical safety. All testing is in isolated lab environments or with proper authorization.`,
    tools: [
      { name: "CANtool / can-utils", purpose: "CAN bus analysis", url: "https://github.com/linux-can/can-utils" },
      { name: "SavvyCAN", purpose: "CAN bus analysis GUI", url: "https://github.com/collin80/SavvyCAN" },
      { name: "OpenPLC", purpose: "Open-source PLC editor", url: "https://github.com/thiagoralves/OpenPLC_v3" },
      { name: "Wireshark + Modbus/DNP3", purpose: "Industrial protocol analysis" },
      { name: "GRFICS", purpose: "ICS simulation for testing", url: "https://github.com/Fortiphyd/GRFICSv2" },
      { name: "Scapy-CAN", purpose: "CAN protocol crafting" },
    ],
    methodologies: ["CAN Bus Analysis", "PLC Firmware RE", "SCADA Protocol Analysis", "Safety System Audit", "ECU Extraction"],
    certifications: ["GICSP", "GRID", "ICS-CERT"],
    focusAreas: ["Automotive CAN bus", "PLC/HMI analysis", "Industrial protocol RE", "Safety system bypass", "ECU firmware", "Smart meter RE"],
  },
];

// ─── RE Curriculum ──────────────────────────────────────────────

export interface RECourse {
  id: string;
  name: string;
  track: "foundations" | "software" | "hardware" | "protocol" | "exploit" | "advanced";
  description: string;
  objectives: string[];
  tools: string[];
  duration: string;
  prerequisites: string[];
  certification?: string;
}

export const RE_CURRICULUM: RECourse[] = [
  {
    id: "re-101",
    name: "Reverse Engineering Foundations",
    track: "foundations",
    description: "Core RE concepts: assembly language, memory layout, calling conventions, data structures, and binary formats (PE, ELF, Mach-O).",
    objectives: ["Read x86/x64 assembly", "Understand stack frames and calling conventions", "Parse PE/ELF headers", "Use Ghidra for basic analysis"],
    tools: ["Ghidra", "objdump", "readelf", "file", "hexdump"],
    duration: "40 hours",
    prerequisites: [],
    certification: "CRT",
  },
  {
    id: "re-201",
    name: "Advanced Binary Analysis",
    track: "software",
    description: "Advanced static and dynamic analysis: anti-reversing bypass, packer identification, deobfuscation, and automated analysis with scripting.",
    objectives: ["Bypass anti-debug techniques", "Unpack common protectors", "Write Ghidra/IDA scripts", "Reconstruct C++ classes from vtables"],
    tools: ["Ghidra", "x64dbg", "Detect It Easy", "PE-bear", "Python scripting"],
    duration: "60 hours",
    prerequisites: ["re-101"],
    certification: "eCRE",
  },
  {
    id: "re-301",
    name: "Malware Analysis & Unpacking",
    track: "software",
    description: "Malware triage, behavioral analysis, unpacking, deobfuscation, C2 extraction, and YARA rule creation.",
    objectives: ["Analyze malware in sandbox", "Manual unpacking techniques", "Extract C2 configuration", "Write detection YARA rules"],
    tools: ["Ghidra", "x64dbg", "YARA", "Capa", "FLOSS", "Volatility3"],
    duration: "80 hours",
    prerequisites: ["re-201"],
    certification: "GREM",
  },
  {
    id: "re-hw-101",
    name: "Hardware Hacking Fundamentals",
    track: "hardware",
    description: "PCB analysis, component identification, debug port discovery (JTAG/UART/SWD), flash dumping, and basic soldering for RE.",
    objectives: ["Identify ICs from markings", "Discover JTAG/UART ports", "Dump SPI/I2C flash", "Read schematics"],
    tools: ["Multimeter", "Logic Analyzer", "Bus Pirate", "flashrom", "JTAGulator"],
    duration: "40 hours",
    prerequisites: [],
  },
  {
    id: "re-fw-201",
    name: "Firmware Extraction & Analysis",
    track: "hardware",
    description: "Firmware acquisition, filesystem extraction, emulation, and vulnerability discovery in embedded systems.",
    objectives: ["Extract firmware from flash chips", "Unpack filesystem images", "Emulate firmware with QEMU", "Find hardcoded credentials"],
    tools: ["Binwalk", "EMBA", "QEMU", "Unicorn", "UEFITool"],
    duration: "60 hours",
    prerequisites: ["re-hw-101"],
  },
  {
    id: "re-proto-201",
    name: "Network Protocol Reverse Engineering",
    track: "protocol",
    description: "Analyze unknown network protocols from packet captures: field identification, state machine recovery, and full specification writing.",
    objectives: ["Capture and analyze proprietary protocols", "Reconstruct message formats", "Build state machines", "Write Wireshark dissectors"],
    tools: ["Wireshark", "Scapy", "mitmproxy", "Frida"],
    duration: "50 hours",
    prerequisites: ["re-101"],
  },
  {
    id: "re-rf-301",
    name: "RF & Wireless Protocol RE",
    track: "protocol",
    description: "Software-defined radio for wireless protocol analysis: Bluetooth, Zigbee, Z-Wave, LoRa, custom RF protocols.",
    objectives: ["Capture RF signals with SDR", "Demodulate and decode protocols", "Analyze Bluetooth/BLE", "Reverse proprietary RF"],
    tools: ["GNU Radio", "HackRF", "RTL-SDR", "Ubertooth", "BTLE"],
    duration: "60 hours",
    prerequisites: ["re-proto-201"],
  },
  {
    id: "re-exploit-301",
    name: "Vulnerability Research & Exploit Development",
    track: "exploit",
    description: "Finding vulnerabilities through fuzzing, code audit, and binary diffing. Writing reliable exploits with mitigation bypasses.",
    objectives: ["Build fuzzer harnesses", "Binary diff patches", "Write stack/heap exploits", "Bypass ASLR/DEP/CFI"],
    tools: ["AFL++", "pwntools", "BinDiff", "ROPgadget", "angr"],
    duration: "100 hours",
    prerequisites: ["re-201"],
    certification: "OSED",
  },
  {
    id: "re-mobile-201",
    name: "Mobile Application RE (Android & iOS)",
    track: "software",
    description: "Reverse engineering mobile applications: APK/IPA decompilation, runtime hooking, SSL pinning bypass, and API extraction.",
    objectives: ["Decompile Android APKs", "Hook iOS runtime with Frida", "Bypass SSL pinning", "Extract hidden APIs"],
    tools: ["jadx", "Frida", "Objection", "MobSF", "apktool"],
    duration: "50 hours",
    prerequisites: ["re-101"],
    certification: "eMAPT",
  },
  {
    id: "re-auto-301",
    name: "Automotive & ICS Reverse Engineering",
    track: "advanced",
    description: "CAN bus analysis, ECU firmware extraction, PLC/SCADA protocol RE, and industrial system security assessment.",
    objectives: ["Sniff and decode CAN bus", "Extract ECU firmware", "Analyze PLC ladder logic", "Fuzz industrial protocols"],
    tools: ["can-utils", "SavvyCAN", "OpenPLC", "Wireshark"],
    duration: "80 hours",
    prerequisites: ["re-fw-201", "re-proto-201"],
    certification: "GICSP",
  },
];

// ─── RE In-Memory State ─────────────────────────────────────────

const reProjects: REProject[] = [];
const reMastery: REMasteryRecord[] = [];
const MAX_PROJECTS = 200;

// ─── RE Mastery Engine ──────────────────────────────────────────

/**
 * Start a new reverse engineering project.
 * Automatically creates phased analysis plan.
 */
export function startREProject(
  specialistId: string,
  targetName: string,
  targetType: REProject["targetType"],
): REProject {
  const phases: REPhase[] = [
    { name: "Reconnaissance", description: "Identify target, gather metadata, classify format", status: "pending", artifacts: [] },
    { name: "Static Analysis", description: "Disassemble/decompile, identify structures, map functions", status: "pending", artifacts: [] },
    { name: "Dynamic Analysis", description: "Execute/emulate, trace behavior, hook functions", status: "pending", artifacts: [] },
    { name: "Deep Analysis", description: "Understand algorithms, crypto, protocols, data flows", status: "pending", artifacts: [] },
    { name: "Documentation", description: "Write complete technical documentation and specs", status: "pending", artifacts: [] },
    { name: "Mastery Proof", description: "Demonstrate full understanding: can modify, extend, or replicate", status: "pending", artifacts: [] },
  ];

  const project: REProject = {
    id: uid(),
    specialistId,
    targetName,
    targetType,
    status: "studying",
    phases,
    findings: [],
    knowledgeGraph: [],
    startedAt: ts(),
    lastUpdated: ts(),
    masteryScore: 0,
  };

  reProjects.push(project);
  if (reProjects.length > MAX_PROJECTS) { reProjects.shift(); }

  return project;
}

/**
 * Add a finding to an RE project.
 */
export function addREFinding(
  projectId: string,
  finding: Omit<REFinding, "id" | "timestamp">,
): REFinding | null {
  const project = reProjects.find((p) => p.id === projectId);
  if (!project) { return null; }

  const entry: REFinding = {
    ...finding,
    id: uid(),
    timestamp: ts(),
  };

  project.findings.push(entry);
  project.lastUpdated = ts();

  // Update mastery score based on findings
  const findingWeight = {
    vulnerability: 15,
    architecture: 10,
    "protocol-spec": 12,
    "firmware-map": 12,
    "api-surface": 8,
    secret: 5,
    backdoor: 15,
    "undocumented-feature": 8,
  };
  project.masteryScore = Math.min(100, project.masteryScore + (findingWeight[finding.type] ?? 5));

  return entry;
}

/**
 * Advance a project phase.
 */
export function advancePhase(projectId: string, phaseName: string): boolean {
  const project = reProjects.find((p) => p.id === projectId);
  if (!project) { return false; }

  const phase = project.phases.find((ph) => ph.name === phaseName);
  if (!phase) { return false; }

  if (phase.status === "pending") {
    phase.status = "in-progress";
    phase.startedAt = ts();
  } else if (phase.status === "in-progress") {
    phase.status = "complete";
    phase.completedAt = ts();
  }

  // Update project status
  const completedCount = project.phases.filter((ph) => ph.status === "complete").length;
  if (completedCount === project.phases.length) {
    project.status = "mastered";
    project.masteryScore = 100;
  } else if (completedCount >= 4) {
    project.status = "documenting";
  } else if (completedCount >= 1) {
    project.status = "analyzing";
  }

  project.lastUpdated = ts();
  return true;
}

/**
 * Record mastery achievement.
 */
export function recordMastery(
  specialistId: string,
  domain: string,
  level: REMasteryRecord["level"],
  proof: string,
): REMasteryRecord {
  const existing = reMastery.find((m) => m.specialistId === specialistId && m.domain === domain);

  if (existing) {
    existing.level = level;
    existing.proofOfCapability.push(proof);
    existing.lastAssessed = ts();
    return existing;
  }

  const record: REMasteryRecord = {
    specialistId,
    domain,
    level,
    proofOfCapability: [proof],
    knowledgeItems: 0,
    projectsCompleted: 0,
    lastAssessed: ts(),
  };

  reMastery.push(record);
  return record;
}

// ─── Query Functions ────────────────────────────────────────────

export function getRESpecializations(): RESpecialization[] {
  return RE_SPECIALIZATIONS;
}

export function getRESpecialization(id: string): RESpecialization | undefined {
  return RE_SPECIALIZATIONS.find((s) => s.id === id);
}

export function getREProjects(limit = 50): REProject[] {
  return reProjects.slice(-limit);
}

export function getREProject(id: string): REProject | undefined {
  return reProjects.find((p) => p.id === id);
}

export function getREMastery(specialistId?: string): REMasteryRecord[] {
  if (specialistId) {
    return reMastery.filter((m) => m.specialistId === specialistId);
  }
  return reMastery;
}

export function getRECurriculum(): RECourse[] {
  return RE_CURRICULUM;
}

export function getRECourse(courseId: string): RECourse | undefined {
  return RE_CURRICULUM.find((c) => c.id === courseId);
}

export function getREDivisionStatus(): {
  totalSpecialists: number;
  teams: Record<string, number>;
  courses: number;
  activeProjects: number;
  masteredProjects: number;
  masteryRecords: number;
} {
  const teams: Record<string, number> = {};
  for (const spec of RE_SPECIALIZATIONS) {
    teams[spec.team] = (teams[spec.team] ?? 0) + 1;
  }

  return {
    totalSpecialists: RE_SPECIALIZATIONS.length,
    teams,
    courses: RE_CURRICULUM.length,
    activeProjects: reProjects.filter((p) => p.status !== "mastered").length,
    masteredProjects: reProjects.filter((p) => p.status === "mastered").length,
    masteryRecords: reMastery.length,
  };
}
