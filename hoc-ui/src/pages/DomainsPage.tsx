import { useState } from "react";
import { useRpc, rpc, mutateRpc } from "@/lib/rpc";
import {
  PageHeader,
  Card,
  Button,
  Badge,
  StatCard,
  Tabs,
  RpcStatus,
  EmptyState,
  ConfirmDialog,
  Alert,
} from "@/components/ui";
import {
  Globe,
  Network,
  Link as LinkIcon,
  Search,
  RefreshCw,
  Plus,
  Trash2,
  CheckCircle,
  XCircle,
  ExternalLink,
  Server,
  Shield,
} from "lucide-react";

interface Domain {
  domain: string;
  status: string;
  expires: string;
  privacy: boolean;
  renewAuto: boolean;
  locked: boolean;
  nameServers?: string[];
}

interface DnsRecord {
  type: string;
  name: string;
  data: string;
  ttl: number;
  priority?: number;
}

interface ProjectBinding {
  id: string;
  domain: string;
  subdomain: string;
  fqdn: string;
  targetType: string;
  targetValue: string;
  projectName: string;
  tunnelUrl?: string;
  createdAt: number;
  verified: boolean;
}

export function DomainsPage() {
  const [activeTab, setActiveTab] = useState("portfolio");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [showAddDns, setShowAddDns] = useState(false);
  const [showBind, setShowBind] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  // DNS form state
  const [dnsType, setDnsType] = useState("A");
  const [dnsName, setDnsName] = useState("");
  const [dnsDataInput, setDnsDataInput] = useState("");
  const [dnsTtl, setDnsTtl] = useState(600);

  // Binding form state
  const [bindDomain, setBindDomain] = useState("");
  const [bindSubdomain, setBindSubdomain] = useState("");
  const [bindProject, setBindProject] = useState("");
  const [bindTarget, setBindTarget] = useState("");

  const {
    data: domainsData,
    loading: domainsLoading,
    error: domainsError,
    refetch: refetchDomains,
  } = useRpc<{ domains: Domain[]; total: number }>("republic.domains.list", {});

  const {
    data: statsData,
    loading: statsLoading,
    error: statsError,
    refetch: refetchStats,
  } = useRpc<{
    totalDomains: number;
    activeDomains: number;
    parkedDomains: number;
    expiredDomains: number;
    projectBindings: number;
  }>("republic.domains.stats", {});

  const {
    data: dnsData,
    loading: dnsLoading,
    error: dnsError,
    refetch: refetchDns,
  } = useRpc<{ records: DnsRecord[]; total: number }>(
    "republic.domains.dns.list",
    { domain: selectedDomain },
    [selectedDomain],
    { staleTimeMs: 0 }
  );

  const {
    data: bindingsData,
    loading: bindingsLoading,
    error: bindingsError,
    refetch: refetchBindings,
  } = useRpc<{ bindings: ProjectBinding[]; total: number }>(
    "republic.domains.project.list",
    {}
  );

  if (
    (domainsLoading && !domainsData) ||
    (statsLoading && !statsData) ||
    domainsError ||
    statsError
  ) {
    return (
      <RpcStatus
        loading={domainsLoading || statsLoading}
        error={domainsError || statsError}
        onRetry={() => { refetchDomains(); refetchStats(); }}
      />
    );
  }

  const domains = domainsData?.domains ?? [];
  const stats = statsData ?? {
    totalDomains: 0, activeDomains: 0, parkedDomains: 0,
    expiredDomains: 0, projectBindings: 0,
  };

  const filtered = domains.filter(
    (d) =>
      !searchTerm ||
      d.domain.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const statusBadge = (status: string) => {
    const variant =
      status === "ACTIVE" ? "success" :
      status === "PARKED" ? "neutral" :
      status === "EXPIRED" ? "danger" : "warning";
    return <Badge variant={variant}>{status}</Badge>;
  };

  const handleAddDns = async () => {
    if (!selectedDomain || !dnsName || !dnsDataInput) { return; }
    try {
      await rpc("republic.domains.dns.set", {
        domain: selectedDomain, type: dnsType, name: dnsName, data: dnsDataInput, ttl: dnsTtl,
      });
      setShowAddDns(false);
      setDnsName(""); setDnsDataInput("");
      refetchDns();
    } catch (err) {
      console.error("Failed to add DNS record:", err);
    }
  };

  const handleDeleteDns = async (type: string, name: string) => {
    if (!selectedDomain) { return; }
    try {
      await rpc("republic.domains.dns.delete", { domain: selectedDomain, type, name });
      refetchDns();
    } catch (err) {
      console.error("Failed to delete DNS record:", err);
    }
  };

  const handleBind = async () => {
    if (!bindDomain || !bindSubdomain || !bindProject || !bindTarget) { return; }
    try {
      await rpc("republic.domains.project.bind", {
        domain: bindDomain, subdomain: bindSubdomain,
        projectName: bindProject, target: bindTarget,
      });
      setShowBind(false);
      setBindDomain(""); setBindSubdomain(""); setBindProject(""); setBindTarget("");
      refetchBindings();
    } catch (err) {
      console.error("Failed to bind project:", err);
    }
  };

  const handleUnbind = async (bindingId: string) => {
    try {
      await mutateRpc("republic.domains.project.unbind", { bindingId });
      setShowDeleteConfirm(null);
      refetchBindings();
    } catch (err) {
      console.error("Failed to unbind:", err);
    }
  };

  const handleVerify = async (bindingId: string) => {
    await rpc("republic.domains.project.verify", { bindingId });
    refetchBindings();
  };

  const tabs = [
    { id: "portfolio", label: "Portfolio", icon: <Globe size={16} /> },
    { id: "dns", label: "DNS Manager", icon: <Network size={16} /> },
    { id: "bindings", label: "Project Bindings", icon: <LinkIcon size={16} /> },
  ];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Domain Management"
        description={`${stats.totalDomains} domains · ${stats.activeDomains} active · ${stats.projectBindings} project bindings`}
        icon={<Globe size={28} />}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { refetchDomains(); refetchStats(); }}>
              <RefreshCw size={14} className="mr-1" /> Refresh
            </Button>
            <Button variant="primary" size="sm" onClick={() => setShowBind(true)}>
              <Plus size={14} className="mr-1" /> Bind Project
            </Button>
          </div>
        }
      />

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="Total Domains" value={stats.totalDomains} icon={<Globe size={20} />} />
        <StatCard label="Active" value={stats.activeDomains} icon={<CheckCircle size={20} />} />
        <StatCard label="Parked" value={stats.parkedDomains} icon={<Server size={20} />} />
        <StatCard label="Expired" value={stats.expiredDomains} icon={<XCircle size={20} />} />
        <StatCard label="Bindings" value={stats.projectBindings} icon={<LinkIcon size={20} />} />
      </div>

      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {/* Portfolio Tab */}
      {activeTab === "portfolio" && (
        <div className="space-y-4">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Search domains..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-bg-input border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
            />
          </div>

          <div className="grid gap-2">
            {filtered.map((d) => (
              <Card
                key={d.domain}
                hover
                onClick={() => { setSelectedDomain(d.domain); setActiveTab("dns"); }}
                className="cursor-pointer"
              >
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <Globe size={18} className="text-accent" />
                    <div>
                      <p className="text-text-primary font-medium">{d.domain}</p>
                      <p className="text-text-muted text-xs">
                        Expires: {new Date(d.expires).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {d.privacy && (
                      <Shield size={14} className="text-success" title="Privacy protection" />
                    )}
                    {d.locked && (
                      <Badge variant="info">Locked</Badge>
                    )}
                    {statusBadge(d.status)}
                  </div>
                </div>
              </Card>
            ))}
            {filtered.length === 0 && (
              <EmptyState
                title="No domains found"
                description={searchTerm ? "Try a different search term" : "Configure GODADDY_API_KEY and GODADDY_API_SECRET in .env"}
                icon={<Globe size={40} />}
              />
            )}
          </div>
        </div>
      )}

      {/* DNS Manager Tab */}
      {activeTab === "dns" && (
        <div className="space-y-4">
          {!selectedDomain ? (
            <Alert variant="info">
              Select a domain from the Portfolio tab to manage its DNS records.
            </Alert>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h3 className="text-text-heading text-lg font-semibold">
                  DNS Records: {selectedDomain}
                </h3>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={refetchDns}>
                    <RefreshCw size={14} className="mr-1" /> Refresh
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => setShowAddDns(true)}>
                    <Plus size={14} className="mr-1" /> Add Record
                  </Button>
                </div>
              </div>

              {dnsLoading && !dnsData ? (
                <RpcStatus loading={dnsLoading} error={dnsError} onRetry={refetchDns} />
              ) : (
                <div className="space-y-2">
                  {(dnsData?.records ?? []).map((r, i) => (
                    <Card key={`${r.type}-${r.name}-${i}`}>
                      <div className="flex items-center justify-between p-3">
                        <div className="flex items-center gap-3">
                          <Badge variant="purple">{r.type}</Badge>
                          <span className="text-text-primary font-mono text-sm">{r.name}</span>
                          <span className="text-text-muted">→</span>
                          <span className="text-text-secondary text-sm font-mono truncate max-w-[300px]">
                            {r.data}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-text-muted text-xs">TTL: {r.ttl}</span>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleDeleteDns(r.type, r.name)}
                            aria-label={`Delete ${r.type} record ${r.name}`}
                          >
                            <Trash2 size={12} />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                  {(dnsData?.records ?? []).length === 0 && (
                    <EmptyState
                      title="No DNS records"
                      description="Add A, CNAME, MX, TXT, or other records"
                      icon={<Network size={40} />}
                    />
                  )}
                </div>
              )}

              {/* Add DNS Record Modal */}
              {showAddDns && (
                <Card glass className="p-6 space-y-4">
                  <h4 className="text-text-heading font-semibold">Add DNS Record</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-text-secondary text-sm block mb-1">Type</label>
                      <select
                        value={dnsType}
                        onChange={(e) => setDnsType(e.target.value)}
                        className="w-full px-3 py-2 bg-bg-input border border-border rounded-lg text-text-primary"
                      >
                        {["A", "AAAA", "CNAME", "MX", "TXT", "SRV", "NS", "CAA"].map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-text-secondary text-sm block mb-1">Name</label>
                      <input
                        type="text"
                        value={dnsName}
                        onChange={(e) => setDnsName(e.target.value)}
                        placeholder="@ or subdomain"
                        className="w-full px-3 py-2 bg-bg-input border border-border rounded-lg text-text-primary"
                      />
                    </div>
                    <div>
                      <label className="text-text-secondary text-sm block mb-1">Data</label>
                      <input
                        type="text"
                        value={dnsDataInput}
                        onChange={(e) => setDnsDataInput(e.target.value)}
                        placeholder="IP or hostname"
                        className="w-full px-3 py-2 bg-bg-input border border-border rounded-lg text-text-primary"
                      />
                    </div>
                    <div>
                      <label className="text-text-secondary text-sm block mb-1">TTL</label>
                      <input
                        type="number"
                        value={dnsTtl}
                        onChange={(e) => setDnsTtl(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-bg-input border border-border rounded-lg text-text-primary"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="ghost" onClick={() => setShowAddDns(false)}>Cancel</Button>
                    <Button variant="primary" onClick={handleAddDns}>Add Record</Button>
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* Project Bindings Tab */}
      {activeTab === "bindings" && (
        <div className="space-y-4">
          {bindingsLoading && !bindingsData ? (
            <RpcStatus loading={bindingsLoading} error={bindingsError} onRetry={refetchBindings} />
          ) : (
            <>
              {(bindingsData?.bindings ?? []).map((b) => (
                <Card key={b.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <LinkIcon size={18} className="text-accent" />
                      <div>
                        <p className="text-text-primary font-medium">
                          {b.projectName}
                          <span className="text-text-muted ml-2">→</span>
                          <a
                            href={`https://${b.fqdn}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent ml-2 hover:underline"
                          >
                            {b.fqdn} <ExternalLink size={12} className="inline" />
                          </a>
                        </p>
                        <p className="text-text-muted text-xs">
                          {b.targetType.toUpperCase()} → {b.targetValue}
                          {" · "}
                          Created {new Date(b.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {b.verified ? (
                        <Badge variant="success">Verified</Badge>
                      ) : (
                        <Badge variant="warning">Unverified</Badge>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleVerify(b.id)}
                        aria-label={`Verify binding ${b.fqdn}`}
                      >
                        <CheckCircle size={14} />
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setShowDeleteConfirm(b.id)}
                        aria-label={`Unbind ${b.fqdn}`}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
              {(bindingsData?.bindings ?? []).length === 0 && (
                <EmptyState
                  title="No project bindings"
                  description="Bind a sandbox project to a subdomain for live preview"
                  icon={<LinkIcon size={40} />}
                  action={
                    <Button variant="primary" onClick={() => setShowBind(true)}>
                      <Plus size={14} className="mr-1" /> Bind First Project
                    </Button>
                  }
                />
              )}
            </>
          )}
        </div>
      )}

      {/* Bind Project Dialog */}
      {showBind && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card glass className="p-6 w-full max-w-md space-y-4">
            <h4 className="text-text-heading font-semibold text-lg">Bind Project to Subdomain</h4>
            <div className="space-y-3">
              <div>
                <label className="text-text-secondary text-sm block mb-1">Domain</label>
                <select
                  value={bindDomain}
                  onChange={(e) => setBindDomain(e.target.value)}
                  className="w-full px-3 py-2 bg-bg-input border border-border rounded-lg text-text-primary"
                >
                  <option value="">Select domain...</option>
                  {domains.filter(d => d.status === "ACTIVE").map(d => (
                    <option key={d.domain} value={d.domain}>{d.domain}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-text-secondary text-sm block mb-1">Subdomain</label>
                <input
                  type="text"
                  value={bindSubdomain}
                  onChange={(e) => setBindSubdomain(e.target.value)}
                  placeholder="e.g. addressbook"
                  className="w-full px-3 py-2 bg-bg-input border border-border rounded-lg text-text-primary"
                />
                {bindDomain && bindSubdomain && (
                  <p className="text-accent text-xs mt-1">{bindSubdomain}.{bindDomain}</p>
                )}
              </div>
              <div>
                <label className="text-text-secondary text-sm block mb-1">Project Name</label>
                <input
                  type="text"
                  value={bindProject}
                  onChange={(e) => setBindProject(e.target.value)}
                  placeholder="e.g. Address Book App"
                  className="w-full px-3 py-2 bg-bg-input border border-border rounded-lg text-text-primary"
                />
              </div>
              <div>
                <label className="text-text-secondary text-sm block mb-1">Target (IP or hostname)</label>
                <input
                  type="text"
                  value={bindTarget}
                  onChange={(e) => setBindTarget(e.target.value)}
                  placeholder="e.g. 192.168.1.100 or xxx.trycloudflare.com"
                  className="w-full px-3 py-2 bg-bg-input border border-border rounded-lg text-text-primary"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setShowBind(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleBind}>Bind Project</Button>
            </div>
          </Card>
        </div>
      )}

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!showDeleteConfirm}
        title="Unbind Project"
        message="This will remove the DNS record and project binding. The subdomain will no longer resolve."
        onConfirm={() => showDeleteConfirm && handleUnbind(showDeleteConfirm)}
        onCancel={() => setShowDeleteConfirm(null)}
      />
    </div>
  );
}
