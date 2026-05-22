/**
 * Network Infrastructure & Device Discovery
 *
 * Dedicated page for:
 * 1. Firewall configuration guidance (Fortigate 101F)
 * 2. TailScale mesh network topology
 * 3. Multi-region scanning configuration (STC Cloud, Oman Data Park, AWS)
 * 4. Device auto-discovery with full service index
 *
 * Uses Kali container nmap/masscan for discovery, stores device inventory
 * in memory with persistence to disk.
 */

import {
  Shield, Network, Globe, Search, Server, Wifi,
  RefreshCw, Monitor, AlertTriangle, ChevronRight,
  Zap, Activity, CheckCircle, XCircle, HardDrive,
  Terminal
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import {
  Button, Card, Badge, PageHeader, StatCard, Alert,
  Tabs, EmptyState, RpcStatus,
} from "@/components/ui";
import { useRpc, rpc } from "@/lib/rpc";

// ─── Types ──────────────────────────────────────────────────────

interface DiscoveredDevice {
  ip: string;
  hostname: string;
  mac?: string;
  os?: string;
  openPorts: Array<{ port: number; protocol: string; service: string; version?: string }>;
  tailscale?: { name: string; tags: string[]; online: boolean };
  hocNode?: { version: string; role: string };
  lastSeen: string;
  network: string;
}

interface NetworkSegment {
  name: string;
  cidr: string;
  type: "local" | "tailscale" | "vpn" | "cloud";
  deviceCount: number;
  status: "discovered" | "scanning" | "unknown";
}

// ─── Main Page ──────────────────────────────────────────────────

export function NetworkInfrastructurePage() {
  const [activeTab, setActiveTab] = useState("discovery");
  const [scanTarget, setScanTarget] = useState("");
  const [scanRunning, setScanRunning] = useState(false);

  const { data: kaliStatus, loading, error, refetch } = useRpc<{
    containerRunning: boolean;
    totalScans: number;
    activeScans: number;
  }>("republic.cyber.kali.status", {});

  const { data: deviceData, refetch: refetchDevices } = useRpc<{
    devices: DiscoveredDevice[];
    segments: NetworkSegment[];
  }>("republic.cyber.kali.network.devices", {});

  const { data: activeTasks } = useRpc<{
    tasks: Array<{ id: string; tool: string; target: string; status: string; elapsed: number; display: string }>;
  }>("republic.cyber.kali.tasks.active", {}, [], { refetchIntervalMs: 5000 });

  const devices = deviceData?.devices ?? [];
  const segments = deviceData?.segments ?? [];
  const tasks = activeTasks?.tasks ?? [];

  const handleDiscoveryScan = useCallback(async () => {
    if (!scanTarget.trim()) { return; }
    setScanRunning(true);
    try {
      await rpc("republic.cyber.kali.network.discover", {
        target: scanTarget.trim(),
        deep: true,
      });
      refetchDevices();
    } catch {
      // Error handled by UI
    } finally {
      setScanRunning(false);
    }
  }, [scanTarget, refetchDevices]);

  // Periodic refetch while scan is running
  useEffect(() => {
    if (!scanRunning) { return; }
    const interval = setInterval(refetchDevices, 10000);
    return () => clearInterval(interval);
  }, [scanRunning, refetchDevices]);

  if (loading || error) {return <RpcStatus loading={loading} error={error} onRetry={refetch} />;}

  const containerOk = kaliStatus?.containerRunning ?? false;

  const tabs = [
    { id: "discovery", label: "🔍 Device Discovery" },
    { id: "inventory", label: "📋 Device Inventory" },
    { id: "firewall", label: "🛡️ Firewall Config" },
    { id: "tailscale", label: "🌐 TailScale Mesh" },
    { id: "regions", label: "🗺️ Multi-Region" },
  ];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Network Infrastructure"
        description="Device discovery, firewall configuration, TailScale mesh, and multi-region scanning"
        icon={<Network size={28} />}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant={containerOk ? "success" : "danger"}>
              {containerOk ? "Kali Online" : "Kali Offline"}
            </Badge>
            <Button variant="ghost" size="sm" onClick={() => { refetch(); refetchDevices(); }} aria-label="Refresh">
              <RefreshCw size={16} />
            </Button>
          </div>
        }
      />

      {/* Live Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Devices Found" value={devices.length} icon={<Monitor size={20} />} />
        <StatCard label="Network Segments" value={segments.length} icon={<Wifi size={20} />} />
        <StatCard label="Open Ports" value={devices.reduce((s, d) => s + d.openPorts.length, 0)} icon={<Server size={20} />} />
        <StatCard label="Active Tasks" value={tasks.length} icon={<Activity size={20} />} />
      </div>

      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {activeTab === "discovery" && (
        <DiscoveryPanel
          scanTarget={scanTarget}
          setScanTarget={setScanTarget}
          scanRunning={scanRunning}
          onScan={handleDiscoveryScan}
          containerOk={containerOk}
          tasks={tasks}
        />
      )}

      {activeTab === "inventory" && <DeviceInventory devices={devices} segments={segments} />}
      {activeTab === "firewall" && <FirewallConfig />}
      {activeTab === "tailscale" && <TailScalePanel devices={devices} />}
      {activeTab === "regions" && <MultiRegionPanel />}
    </div>
  );
}

// ─── Discovery Panel ────────────────────────────────────────────

function DiscoveryPanel({
  scanTarget, setScanTarget, scanRunning, onScan, containerOk, tasks,
}: {
  scanTarget: string;
  setScanTarget: (v: string) => void;
  scanRunning: boolean;
  onScan: () => void;
  containerOk: boolean;
  tasks: Array<{ id: string; tool: string; target: string; status: string; elapsed: number; display: string }>;
}) {
  const presets = [
    { label: "Local Network", value: "192.168.1.0/24" },
    { label: "TailScale", value: "100.64.0.0/10" },
    { label: "Docker Bridge", value: "172.17.0.0/16" },
    { label: "Custom Range", value: "" },
  ];

  return (
    <div className="space-y-4">
      {!containerOk && (
        <Alert variant="warning">
          Kali container is offline. Start it from the <a href="/republic/kali" className="text-accent underline">Kali Linux page</a> to enable network discovery.
        </Alert>
      )}

      <Card glass>
        <div className="p-4 space-y-4">
          <h3 className="text-text-heading font-semibold flex items-center gap-2">
            <Search size={18} className="text-accent" />
            Network Discovery Scan
          </h3>
          <p className="text-text-secondary text-sm">
            Scan an IP range to auto-discover devices, services, versions, OS types, and open ports.
            Uses nmap with service detection (-sV), OS fingerprinting (-O), and script scanning (--script=default).
          </p>

          {/* Presets */}
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <Button
                key={p.label}
                variant={scanTarget === p.value ? "primary" : "outline"}
                size="sm"
                onClick={() => setScanTarget(p.value)}
              >
                {p.label}
              </Button>
            ))}
          </div>

          {/* Input + Scan button */}
          <div className="flex gap-2">
            <input
              type="text"
              className="flex-1 px-3 py-2 rounded-lg bg-bg-input border border-border text-text-primary placeholder:text-text-muted text-sm"
              placeholder="IP address or CIDR range (e.g., 192.168.1.0/24, 10.0.0.1)"
              value={scanTarget}
              onChange={(e) => setScanTarget(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onScan()}
            />
            <Button
              variant="primary"
              onClick={onScan}
              disabled={!containerOk || scanRunning || !scanTarget.trim()}
            >
              {scanRunning ? (
                <>
                  <RefreshCw size={16} className="animate-spin mr-1" />
                  Scanning...
                </>
              ) : (
                <>
                  <Search size={16} className="mr-1" />
                  Discover
                </>
              )}
            </Button>
          </div>
        </div>
      </Card>

      {/* Active Tasks */}
      {tasks.length > 0 && (
        <Card glass>
          <div className="p-4 space-y-3">
            <h3 className="text-text-heading font-semibold flex items-center gap-2">
              <Activity size={18} className="text-warning" />
              Active Scans
            </h3>
            {tasks.map((t) => (
              <div key={t.id} className="flex items-center justify-between p-2 rounded-lg bg-bg-secondary/50 border border-border/30">
                <div className="text-sm text-text-primary">{t.display}</div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => { await rpc("republic.cyber.kali.tasks.cancel", { taskId: t.id }); }}
                  aria-label="Cancel task"
                >
                  <XCircle size={14} className="text-danger" />
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Device Inventory ───────────────────────────────────────────

function DeviceInventory({ devices, segments }: { devices: DiscoveredDevice[]; segments: NetworkSegment[] }) {
  if (devices.length === 0) {
    return (
      <EmptyState
        icon={<Monitor size={48} />}
        title="No Devices Discovered"
        description="Run a network discovery scan to find devices on your network."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Segment Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {segments.map((seg) => (
          <Card key={seg.cidr} glass hover>
            <div className="p-3">
              <div className="text-xs text-text-muted uppercase">{seg.type}</div>
              <div className="text-text-heading font-semibold">{seg.name}</div>
              <div className="text-sm text-text-secondary">{seg.cidr}</div>
              <Badge variant={seg.status === "discovered" ? "success" : seg.status === "scanning" ? "warning" : "neutral"}>
                {seg.deviceCount} devices
              </Badge>
            </div>
          </Card>
        ))}
      </div>

      {/* Device Table */}
      <Card glass>
        <div className="p-4">
          <h3 className="text-text-heading font-semibold mb-3 flex items-center gap-2">
            <HardDrive size={18} className="text-accent" />
            Device Index ({devices.length} devices)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-muted text-left">
                  <th className="p-2">IP</th>
                  <th className="p-2">Hostname</th>
                  <th className="p-2">OS</th>
                  <th className="p-2">Open Ports</th>
                  <th className="p-2">Network</th>
                  <th className="p-2">HoC Node</th>
                  <th className="p-2">Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((d) => (
                  <tr key={d.ip} className="border-b border-border/30 hover:bg-bg-secondary/30">
                    <td className="p-2 font-mono text-accent">{d.ip}</td>
                    <td className="p-2 text-text-primary">{d.hostname || "—"}</td>
                    <td className="p-2 text-text-secondary">{d.os || "Unknown"}</td>
                    <td className="p-2">
                      <div className="flex flex-wrap gap-1">
                        {d.openPorts.slice(0, 5).map((p) => (
                          <Badge key={`${p.port}-${p.protocol}`} variant="info">
                            {p.port}/{p.protocol} {p.service}
                          </Badge>
                        ))}
                        {d.openPorts.length > 5 && (
                          <Badge variant="neutral">+{d.openPorts.length - 5} more</Badge>
                        )}
                      </div>
                    </td>
                    <td className="p-2">
                      <Badge variant={d.network === "tailscale" ? "purple" : "neutral"}>
                        {d.network}
                      </Badge>
                    </td>
                    <td className="p-2">
                      {d.hocNode ? (
                        <Badge variant="success">{d.hocNode.role}</Badge>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="p-2 text-text-muted text-xs">{new Date(d.lastSeen).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ─── Firewall Configuration ─────────────────────────────────────

function FirewallConfig() {
  return (
    <div className="space-y-4">
      <Card glass>
        <div className="p-5 space-y-4">
          <h3 className="text-text-heading font-semibold text-lg flex items-center gap-2">
            <Shield size={20} className="text-accent" />
            Fortigate 101F — Security Assessment Config
          </h3>

          <Alert variant="info">
            These guidelines help configure your Fortigate 101F firewall for scanning from inside and outside the network.
            The scanner IP is the machine running the HoC gateway and Kali container.
          </Alert>

          {/* Inside Network */}
          <div className="space-y-2">
            <h4 className="text-text-heading font-semibold flex items-center gap-2">
              <CheckCircle size={16} className="text-success" /> Scanning From Inside the Network
            </h4>
            <ul className="text-sm text-text-secondary space-y-1 pl-6 list-disc">
              <li>Create a <strong>Security Profile Exception</strong> for the Kali scanner's source IP</li>
              <li>Whitelist the scanner IP in the <strong>IPS policy</strong> — IPS will block nmap/sqlmap signatures otherwise</li>
              <li>Disable <strong>Application Control</strong> blocking for the scanner source IP</li>
              <li>Consider a dedicated <strong>VLAN</strong> for the scanning machine with permissive policy to DMZ/servers</li>
              <li>If UTP subscription is active, create an <strong>IPS sensor exception</strong> for signature IDs related to port scanning, nmap, sqlmap</li>
            </ul>
          </div>

          {/* Outside Network */}
          <div className="space-y-2">
            <h4 className="text-text-heading font-semibold flex items-center gap-2">
              <AlertTriangle size={16} className="text-warning" /> Scanning From Outside the Network
            </h4>
            <ul className="text-sm text-text-secondary space-y-1 pl-6 list-disc">
              <li>Establish <strong>SSL-VPN</strong> or <strong>IPSec VPN</strong> tunnel to reach internal hosts</li>
              <li>Configure <strong>Virtual IP (VIP)</strong> / port forwarding for specific test targets if VPN is not available</li>
              <li>The Kali container can connect through VPN tunnel if you expose the VPN interface to Docker</li>
              <li>Ensure <strong>split tunnel</strong> is disabled so all traffic goes through the VPN</li>
            </ul>
          </div>

          {/* FortiOS API */}
          <div className="space-y-2">
            <h4 className="text-text-heading font-semibold flex items-center gap-2">
              <Terminal size={16} className="text-info" /> Fortigate API Analysis
            </h4>
            <ul className="text-sm text-text-secondary space-y-1 pl-6 list-disc">
              <li><strong>FortiOS REST API</strong> (HTTPS port 443) — query policies, routes, sessions, interfaces</li>
              <li><strong>SNMP v3</strong> — poll interface stats, CPU, memory, session count, HA status</li>
              <li><strong>Syslog feed</strong> → ingest into vector DB for anomaly detection and threat correlation</li>
              <li>Generate an <strong>API admin</strong> user with read-only permissions in FortiGate GUI → System → Administrators</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ─── TailScale Panel ────────────────────────────────────────────

function TailScalePanel({ devices }: { devices: DiscoveredDevice[] }) {
  const tailscaleDevices = devices.filter((d) => d.tailscale);

  return (
    <div className="space-y-4">
      <Card glass>
        <div className="p-5 space-y-4">
          <h3 className="text-text-heading font-semibold text-lg flex items-center gap-2">
            <Globe size={20} className="text-purple" />
            TailScale Mesh Network
          </h3>

          <Alert variant="info">
            Your TailScale network connects devices across multiple physical locations into one mesh.
            The HoC gateway and all nodes communicate through TailScale IPs (100.x.x.x range).
            Scan the TailScale subnet <strong>100.64.0.0/10</strong> to discover all connected devices.
          </Alert>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <StatCard label="TailScale Devices" value={tailscaleDevices.length} icon={<Wifi size={20} />} />
            <StatCard
              label="HoC Nodes"
              value={devices.filter((d) => d.hocNode).length}
              icon={<Zap size={20} />}
            />
            <StatCard
              label="Windows Companions"
              value={devices.filter((d) => d.os?.toLowerCase().includes("windows")).length}
              icon={<Monitor size={20} />}
            />
          </div>

          {/* Considerations */}
          <div className="space-y-2">
            <h4 className="text-text-heading font-semibold">Key Considerations</h4>
            <ul className="text-sm text-text-secondary space-y-1 pl-6 list-disc">
              <li>All HoC nodes connected via TailScale can provide <strong>LLM inference</strong> from their local models</li>
              <li>Windows devices with the <strong>companion app</strong> are accessible via their TailScale IP</li>
              <li>Discovery scan on 100.64.0.0/10 will find all mesh devices including mobile and headless nodes</li>
              <li>Each discovered device running a HoC node shows its <strong>version and role</strong> (primary/secondary)</li>
              <li>For security scans of TailScale devices, the traffic goes through the <strong>encrypted WireGuard tunnel</strong> — no firewall rules needed</li>
            </ul>
          </div>

          {/* Device list */}
          {tailscaleDevices.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-text-heading font-semibold">Mesh Devices</h4>
              {tailscaleDevices.map((d) => (
                <div key={d.ip} className="flex items-center justify-between p-3 rounded-lg bg-bg-secondary/50 border border-border/30">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${d.tailscale?.online ? "bg-success" : "bg-danger"}`} />
                    <div>
                      <div className="text-text-primary font-medium">{d.tailscale?.name ?? d.hostname}</div>
                      <div className="text-xs text-text-muted">{d.ip} · {d.os ?? "Unknown OS"}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {d.hocNode && <Badge variant="success">HoC {d.hocNode.version}</Badge>}
                    {(d.tailscale?.tags ?? []).map((t) => (
                      <Badge key={t} variant="purple">{t}</Badge>
                    ))}
                    <ChevronRight size={14} className="text-text-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Wifi size={40} />}
              title="No TailScale Devices Found"
              description="Scan the TailScale subnet (100.64.0.0/10) to discover your mesh devices."
            />
          )}
        </div>
      </Card>
    </div>
  );
}

// ─── Multi-Region Panel ─────────────────────────────────────────

function MultiRegionPanel() {
  const regions = [
    {
      name: "STC Cloud — Riyadh Data Center",
      icon: "🇸🇦",
      access: "Site-to-site VPN or direct IP",
      requirements: [
        "Whitelist scanner IP in STC Cloud security groups",
        "Ensure VPN tunnel allows nmap/scanning traffic",
        "Configure STC Cloud firewall rules for port range access",
      ],
      tools: ["nmap", "nikto", "sslyze", "gobuster"],
    },
    {
      name: "Oman Data Park",
      icon: "🇴🇲",
      access: "VPN or direct IP connectivity",
      requirements: [
        "Firewall rule: allow scanner IP inbound on required port ranges",
        "DNS resolution: ensure hostnames resolve from scanner network",
        "Bandwidth: dedicated scanning window to avoid production impact",
      ],
      tools: ["nmap", "nikto", "wpscan", "sqlmap"],
    },
    {
      name: "AWS — Multi-Region",
      icon: "☁️",
      access: "VPC Peering / Transit Gateway / Direct Connect",
      requirements: [
        "Security Groups: allow scanner IP inbound in each VPC",
        "IAM: create role for aws inspector + guardduty + config APIs",
        "Use AWS Inspector for native vulnerability assessment",
        "Use Prowler (runs in Kali container) for CIS benchmark audits",
        "GuardDuty findings: query via API for real-time threat detection",
      ],
      tools: ["nmap", "prowler", "aws-inspector", "aws-guardduty", "sslyze"],
    },
  ];

  return (
    <div className="space-y-4">
      {regions.map((region) => (
        <Card key={region.name} glass hover>
          <div className="p-5 space-y-3">
            <h3 className="text-text-heading font-semibold text-lg flex items-center gap-2">
              <span className="text-2xl">{region.icon}</span>
              {region.name}
            </h3>

            <div className="flex items-center gap-2">
              <Badge variant="info">Access: {region.access}</Badge>
            </div>

            <div className="space-y-1">
              <h4 className="text-text-heading font-semibold text-sm">Requirements</h4>
              <ul className="text-sm text-text-secondary space-y-1 pl-6 list-disc">
                {region.requirements.map((req) => (
                  <li key={req}>{req}</li>
                ))}
              </ul>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-text-muted uppercase mr-2">Recommended Tools:</span>
              {region.tools.map((tool) => (
                <Badge key={tool} variant="neutral">{tool}</Badge>
              ))}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
