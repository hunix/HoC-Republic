/**
 * HoC Node UI — Main Application
 * Client-side SPA router, API client, and all page renderers.
 */

// ─── API Client ──────────────────────────────────────────────────

const API_BASE = "";

async function api(endpoint, opts = {}) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { "Content-Type": "application/json", ...opts.headers },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// ─── Router ─────────────────────────────────────────────────────

const routes = {
  "/": renderDashboard,
  "/pairing": renderPairing,
  "/hardware": renderHardware,
  "/plugins": renderPlugins,
  "/llm": renderLlmStatus,
  "/workloads": renderWorkloads,
  "/citizens": renderCitizens,
  "/config": renderConfig,
  "/logs": renderLogs,
  "/windows": renderWindows,
};

function navigate() {
  const hash = location.hash.slice(1) || "/";
  const render = routes[hash] || renderDashboard;
  const content = document.getElementById("content");

  // Update active nav
  document.querySelectorAll(".nav-item").forEach((item) => {
    const page = item.getAttribute("data-page");
    const isActive = (hash === "/" && page === "dashboard") || hash === `/${page}`;
    item.classList.toggle("active", isActive);
  });

  content.innerHTML =
    '<div class="loading-spinner"><div class="spinner"></div><p>Loading...</p></div>';
  // Slight delay for animation feel
  requestAnimationFrame(() => {
    render(content);
  });
}

window.addEventListener("hashchange", navigate);

// ─── Init ───────────────────────────────────────────────────────

async function init() {
  try {
    const status = await api("/api/status");
    document.getElementById("node-name").textContent = status.displayName || status.nodeId;
    updateConnectionBadge(status);
  } catch {
    document.getElementById("node-name").textContent = "Node (offline)";
  }
  navigate();
  // Refresh connection status every 10s
  setInterval(refreshStatus, 10_000);
}

async function refreshStatus() {
  try {
    const status = await api("/api/status");
    updateConnectionBadge(status);
  } catch {
    /* ignore */
  }
}

function updateConnectionBadge(status) {
  const el = document.getElementById("connection-status");
  const text = el.querySelector(".conn-text");
  if (status.gatewayConnected) {
    el.className = "conn-status connected";
    text.textContent = "Connected";
  } else if (status.pairingState === "pending") {
    el.className = "conn-status pending";
    text.textContent = "Pairing Pending";
  } else {
    el.className = "conn-status disconnected";
    text.textContent = "Disconnected";
  }
}

document.addEventListener("DOMContentLoaded", init);

// ─── Helper: HTML escape ────────────────────────────────────────

function esc(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function progressClass(pct) {
  if (pct > 85) {return "danger";}
  if (pct > 60) {return "warning";}
  return "success";
}

// ═══════════════════════════════════════════════════════════════
//  PAGE: Dashboard
// ═══════════════════════════════════════════════════════════════

async function renderDashboard(el) {
  let status, hw;
  try {
    [status, hw] = await Promise.all([api("/api/status"), api("/api/hardware")]);
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">Failed to load dashboard: ${esc(err.message)}</div>`;
    return;
  }

  const ramPct = hw.ramGb > 0 ? Math.round(((hw.ramGb - hw.freeRamGb) / hw.ramGb) * 100) : 0;
  const vramPct =
    hw.totalVramGb > 0 ? Math.round(((hw.totalVramGb - hw.freeVramGb) / hw.totalVramGb) * 100) : 0;

  el.innerHTML = `
    <div class="page-enter">
      <div class="page-header">
        <h1>📊 Dashboard</h1>
        <p>Node overview — ${esc(status.displayName)}</p>
      </div>

      <div class="grid-4" style="margin-bottom:24px">
        <div class="card stat-card">
          <div class="stat-label">Uptime</div>
          <div class="stat-value sm">${esc(status.uptimeHuman)}</div>
          <div class="stat-sub">${esc(status.platform)} / ${esc(status.arch)}</div>
        </div>
        <div class="card stat-card">
          <div class="stat-label">Gateway</div>
          <div class="stat-value sm">${status.gatewayConnected ? "🟢 Connected" : "🔴 Offline"}</div>
          <div class="stat-sub">${status.gatewayUrl ? esc(status.gatewayUrl) : "Not configured"}</div>
        </div>
        <div class="card stat-card">
          <div class="stat-label">GPUs</div>
          <div class="stat-value sm">${hw.gpus.length}</div>
          <div class="stat-sub">${hw.totalVramGb.toFixed(1)} GB VRAM total</div>
        </div>
        <div class="card stat-card">
          <div class="stat-label">CPU Cores</div>
          <div class="stat-value sm">${hw.cpuCores}</div>
          <div class="stat-sub">${esc(hw.cpuModel)}</div>
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-title">System RAM</div>
          <div style="margin-top:12px">
            <div class="progress-label">
              <span>Used: ${(hw.ramGb - hw.freeRamGb).toFixed(1)} GB</span>
              <span>${hw.ramGb.toFixed(1)} GB total</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill ${progressClass(ramPct)}" style="width:${ramPct}%"></div>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-title">GPU VRAM</div>
          <div style="margin-top:12px">
            <div class="progress-label">
              <span>Used: ${(hw.totalVramGb - hw.freeVramGb).toFixed(1)} GB</span>
              <span>${hw.totalVramGb.toFixed(1)} GB total</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill ${progressClass(vramPct)}" style="width:${vramPct}%"></div>
            </div>
          </div>
        </div>
      </div>

      ${
        hw.gpus.length > 0
          ? `
        <h2 style="margin:24px 0 12px;color:var(--text-heading);font-size:18px">GPU Devices</h2>
        <div class="grid-auto">
          ${hw.gpus
            .map((g) => {
              const usedPct =
                g.vramGb > 0 ? Math.round(((g.vramGb - g.freeVramGb) / g.vramGb) * 100) : 0;
              return `
              <div class="card gpu-card">
                <div class="card-title">${esc(g.name)}</div>
                <div style="margin-top:8px">
                  <div class="progress-label">
                    <span>VRAM ${g.freeVramGb.toFixed(1)} GB free</span>
                    <span>${g.vramGb.toFixed(1)} GB</span>
                  </div>
                  <div class="progress-bar">
                    <div class="progress-fill ${progressClass(usedPct)}" style="width:${usedPct}%"></div>
                  </div>
                  ${g.cuda ? `<span class="badge badge-success" style="margin-top:8px">CUDA ${g.cuda}</span>` : ""}
                  ${g.rocm ? `<span class="badge badge-purple" style="margin-top:8px">ROCm</span>` : ""}
                </div>
              </div>
            `;
            })
            .join("")}
        </div>
      `
          : ""
      }
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
//  PAGE: Gateway Pairing
// ═══════════════════════════════════════════════════════════════

async function renderPairing(el) {
  let pairStatus;
  try {
    pairStatus = await api("/api/pair/status");
  } catch {
    pairStatus = { state: "unpaired", gatewayUrl: "", hasToken: false };
  }

  const stateLabel = {
    unpaired: { text: "Not Paired", badge: "badge-danger" },
    pending: { text: "Pairing Pending...", badge: "badge-warning" },
    paired: { text: "Paired & Authenticated", badge: "badge-success" },
    rejected: { text: "Rejected", badge: "badge-danger" },
  }[pairStatus.state] || { text: "Unknown", badge: "badge-neutral" };

  el.innerHTML = `
    <div class="page-enter">
      <div class="page-header">
        <h1>🔗 Gateway Pairing</h1>
        <p>Connect this node to a HoC gateway for distributed workloads</p>
      </div>

      <div class="card" style="margin-bottom:24px">
        <div class="card-header">
          <div class="card-title">Connection Status</div>
          <span class="badge ${stateLabel.badge}">${stateLabel.text}</span>
        </div>
        ${pairStatus.gatewayUrl ? `<p style="color:var(--text-secondary);font-size:13px">Gateway: <strong>${esc(pairStatus.gatewayUrl)}</strong></p>` : ""}
        ${pairStatus.hasToken ? '<p style="color:var(--success);font-size:13px;margin-top:4px">✓ Auth token stored</p>' : ""}
        ${pairStatus.lastAttempt ? `<p style="color:var(--text-muted);font-size:12px;margin-top:4px">Last attempt: ${new Date(pairStatus.lastAttempt).toLocaleString()}</p>` : ""}
      </div>

      <div class="card">
        <div class="card-title">Request Pairing</div>
        <p style="color:var(--text-secondary);font-size:13px;margin:8px 0 16px">
          Enter the gateway's IP address and port, then click "Request Pairing".<br/>
          The gateway admin will see your request and can approve it — the auth token will be transmitted automatically.
        </p>
        <div class="input-row" style="max-width:600px">
          <div class="input-group" style="flex:1;margin-bottom:0">
            <label for="gateway-url">Gateway URL</label>
            <input type="text" id="gateway-url" class="input" placeholder="http://192.168.1.100:3000" value="${esc(pairStatus.gatewayUrl)}" />
          </div>
          <button id="pair-btn" class="btn btn-primary" style="margin-bottom:0">🔗 Request Pairing</button>
        </div>
        <div id="pair-result" style="margin-top:12px"></div>
      </div>

      ${
        pairStatus.state === "paired"
          ? `
        <div class="alert alert-success" style="margin-top:16px">
          ✅ This node is paired and authenticated with the gateway. Plugins and workloads will be distributed automatically.
        </div>
      `
          : ""
      }
    </div>
  `;

  // Event handler
  document.getElementById("pair-btn").addEventListener("click", async () => {
    const url = document.getElementById("gateway-url").value.trim();
    const resultEl = document.getElementById("pair-result");
    const btn = document.getElementById("pair-btn");

    if (!url) {
      resultEl.innerHTML = '<div class="alert alert-warning">Please enter the gateway URL</div>';
      return;
    }

    btn.disabled = true;
    btn.textContent = "⏳ Pairing...";
    resultEl.innerHTML =
      '<div class="alert alert-info">Sending pairing request to gateway...</div>';

    try {
      const result = await api("/api/pair", {
        method: "POST",
        body: JSON.stringify({ gatewayUrl: url }),
      });

      if (result.status === "pending") {
        resultEl.innerHTML =
          '<div class="alert alert-info">✓ Pairing request sent! Waiting for gateway admin to approve...</div>';
      } else if (result.status === "approved") {
        resultEl.innerHTML =
          '<div class="alert alert-success">✅ Paired successfully! Token received and stored.</div>';
      } else {
        resultEl.innerHTML = `<div class="alert alert-warning">${esc(result.message || result.status)}</div>`;
      }
    } catch (err) {
      resultEl.innerHTML = `<div class="alert alert-danger">Pairing failed: ${esc(err.message)}</div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = "🔗 Request Pairing";
    }
  });
}

// ═══════════════════════════════════════════════════════════════
//  PAGE: Hardware
// ═══════════════════════════════════════════════════════════════

async function renderHardware(el) {
  let hw;
  try {
    hw = await api("/api/hardware");
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">Failed to detect hardware: ${esc(err.message)}</div>`;
    return;
  }

  el.innerHTML = `
    <div class="page-enter">
      <div class="page-header">
        <h1>🖥️ Hardware</h1>
        <p>Detected capabilities of this node</p>
      </div>

      <div class="grid-3" style="margin-bottom:24px">
        <div class="card stat-card">
          <div class="stat-label">Platform</div>
          <div class="stat-value sm">${esc(hw.platform)}</div>
          <div class="stat-sub">${esc(hw.arch)}</div>
        </div>
        <div class="card stat-card">
          <div class="stat-label">CPU</div>
          <div class="stat-value sm">${hw.cpuCores} cores</div>
          <div class="stat-sub">${esc(hw.cpuModel)}</div>
        </div>
        <div class="card stat-card">
          <div class="stat-label">RAM</div>
          <div class="stat-value sm">${hw.ramGb.toFixed(1)} GB</div>
          <div class="stat-sub">${hw.freeRamGb.toFixed(1)} GB free</div>
        </div>
      </div>

      <h2 style="color:var(--text-heading);font-size:18px;margin-bottom:12px">GPU Devices</h2>
      ${
        hw.gpus.length > 0
          ? `
        <div class="grid-auto">
          ${hw.gpus
            // oxlint-disable-next-line no-unused-vars
            .map((g, i) => {
              const usedPct =
                g.vramGb > 0 ? Math.round(((g.vramGb - g.freeVramGb) / g.vramGb) * 100) : 0;
              return `
              <div class="card gpu-card">
                <div class="card-header">
                  <div>
                    <div class="card-title">${esc(g.name)}</div>
                    <div class="card-subtitle">Device #${g.index}</div>
                  </div>
                  ${g.cuda ? `<span class="badge badge-success">CUDA ${g.cuda}</span>` : ""}
                  ${g.rocm ? `<span class="badge badge-purple">ROCm</span>` : ""}
                </div>
                <div class="progress-label">
                  <span>VRAM Used: ${(g.vramGb - g.freeVramGb).toFixed(1)} GB</span>
                  <span>${g.vramGb.toFixed(1)} GB</span>
                </div>
                <div class="progress-bar" style="height:12px">
                  <div class="progress-fill ${progressClass(usedPct)}" style="width:${usedPct}%"></div>
                </div>
                <div style="margin-top:8px;font-size:12px;color:var(--text-muted)">
                  ${g.freeVramGb.toFixed(1)} GB free (${100 - usedPct}%)
                </div>
              </div>
            `;
            })
            .join("")}
        </div>
      `
          : `
        <div class="empty-state">
          <div class="icon">🖥️</div>
          <p>No GPUs detected on this node</p>
          <p style="font-size:12px;margin-top:4px">This node will handle CPU-only workloads</p>
        </div>
      `
      }

      ${
        hw.tags.length > 0
          ? `
        <h2 style="color:var(--text-heading);font-size:18px;margin:24px 0 12px">Node Tags</h2>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${hw.tags.map((t) => `<span class="badge badge-info">${esc(t)}</span>`).join("")}
        </div>
      `
          : ""
      }
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
//  PAGE: Plugins
// ═══════════════════════════════════════════════════════════════

async function renderPlugins(el) {
  let plugins;
  try {
    plugins = await api("/api/plugins");
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">Failed to load plugins: ${esc(err.message)}</div>`;
    return;
  }

  el.innerHTML = `
    <div class="page-enter">
      <div class="page-header">
        <h1>🧩 Plugins</h1>
        <p>Manage plugins enabled on this node</p>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">Enabled Plugins (${plugins.enabledPlugins.length})</div>
        </div>
        ${
          plugins.enabledPlugins.length > 0
            ? `
          <div class="table-wrap">
            <table>
              <thead><tr><th>Plugin ID</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                ${plugins.enabledPlugins
                  .map(
                    (id) => `
                  <tr>
                    <td style="font-weight:500;color:var(--text-primary)">${esc(id)}</td>
                    <td><span class="badge badge-success">Active</span></td>
                    <td><button class="btn btn-sm btn-danger deactivate-btn" data-id="${esc(id)}">Deactivate</button></td>
                  </tr>
                `,
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        `
            : `
          <div class="empty-state">
            <div class="icon">🧩</div>
            <p>No plugins enabled on this node</p>
            <p style="font-size:12px;margin-top:4px">Plugins are assigned automatically when connected to a gateway</p>
          </div>
        `
        }
      </div>

      ${
        plugins.pluginAffinities.length > 0
          ? `
        <div class="card" style="margin-top:16px">
          <div class="card-title">Plugin Affinities</div>
          <p style="color:var(--text-muted);font-size:12px;margin:8px 0">These plugins will be preferentially scheduled to this node</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${plugins.pluginAffinities.map((id) => `<span class="badge badge-purple">${esc(id)}</span>`).join("")}
          </div>
        </div>
      `
          : ""
      }
    </div>
  `;

  // Deactivate buttons
  el.querySelectorAll(".deactivate-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      try {
        await api(`/api/plugins/${id}/deactivate`, { method: "POST" });
        renderPlugins(el);
      } catch (err) {
        alert(`Failed to deactivate: ${err.message}`);
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════════
//  PAGE: LLM Status
// ═══════════════════════════════════════════════════════════════

async function renderLlmStatus(el) {
  let llm;
  try {
    llm = await api("/api/llm");
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">Failed to probe LLM runtimes: ${esc(err.message)}</div>`;
    return;
  }

  el.innerHTML = `
    <div class="page-enter">
      <div class="page-header">
        <h1>🤖 LLM Status</h1>
        <p>Local language model runtimes detected on this node</p>
      </div>

      <div class="grid-3" style="margin-bottom:24px">
        <div class="card stat-card">
          <div class="stat-label">Runtimes Running</div>
          <div class="stat-value sm">${llm.runtimes.filter((r) => r.running).length} / ${llm.runtimes.length}</div>
        </div>
        <div class="card stat-card">
          <div class="stat-label">Total Models</div>
          <div class="stat-value sm">${llm.totalModels}</div>
        </div>
        <div class="card stat-card">
          <div class="stat-label">Loaded in Memory</div>
          <div class="stat-value sm">${llm.totalLoadedModels}</div>
        </div>
      </div>

      ${llm.runtimes
        .map(
          (r) => `
        <div class="card" style="margin-bottom:16px">
          <div class="card-header">
            <div>
              <div class="card-title">${esc(r.name.charAt(0).toUpperCase() + r.name.slice(1))}${r.version ? ` v${esc(r.version)}` : ""}</div>
              <div class="card-subtitle">${esc(r.url)}</div>
            </div>
            <span class="badge ${r.running ? "badge-success" : "badge-danger"}">${r.running ? "Running" : "Stopped"}</span>
          </div>
          ${
            r.running && r.models.length > 0
              ? `
            <div class="table-wrap">
              <table>
                <thead><tr><th>Model</th><th>Size</th><th>Params</th><th>Quant</th><th>State</th><th>VRAM</th></tr></thead>
                <tbody>
                  ${r.models
                    .map(
                      (m) => `
                    <tr>
                      <td style="font-weight:500;color:var(--text-primary)">${esc(m.name)}</td>
                      <td>${m.size || "-"}</td>
                      <td>${m.parameters || "-"}</td>
                      <td>${m.quantization ? `<span class="badge badge-info">${esc(m.quantization)}</span>` : "-"}</td>
                      <td>${m.loaded ? '<span class="badge badge-success">Loaded</span>' : '<span class="badge badge-neutral">Available</span>'}</td>
                      <td>${m.vramMb ? `${m.vramMb} MB` : "-"}</td>
                    </tr>
                  `,
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
          `
              : r.running
                ? '<p style="color:var(--text-muted);font-size:13px">No models available</p>'
                : ""
          }
        </div>
      `,
        )
        .join("")}
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
//  PAGE: Workloads
// ═══════════════════════════════════════════════════════════════

async function renderWorkloads(el) {
  let workloads;
  try {
    workloads = await api("/api/workloads");
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">Failed to load workloads: ${esc(err.message)}</div>`;
    return;
  }

  el.innerHTML = `
    <div class="page-enter">
      <div class="page-header">
        <h1>⚡ Workloads</h1>
        <p>Active distributed workers, fan-out jobs, and pipeline stages</p>
      </div>

      <div class="grid-3" style="margin-bottom:24px">
        <div class="card stat-card">
          <div class="stat-label">Active Workers</div>
          <div class="stat-value sm">${workloads.activeWorkers?.length || 0}</div>
        </div>
        <div class="card stat-card">
          <div class="stat-label">Fan-Out Jobs</div>
          <div class="stat-value sm">${workloads.fanOutJobs?.length || 0}</div>
        </div>
        <div class="card stat-card">
          <div class="stat-label">Pipelines</div>
          <div class="stat-value sm">${workloads.pipelines?.length || 0}</div>
        </div>
      </div>

      <div class="card">
        <div class="empty-state">
          <div class="icon">⚡</div>
          <p>${esc(workloads.message || "No active workloads")}</p>
          <p style="font-size:12px;margin-top:4px">Workloads appear here when this node is processing distributed tasks</p>
        </div>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
//  PAGE: Citizens
// ═══════════════════════════════════════════════════════════════

async function renderCitizens(el) {
  el.innerHTML = `
    <div class="page-enter">
      <div class="page-header">
        <h1>👥 Citizens</h1>
        <p>AI citizens residing on this node — remote extensions of their home republics</p>
      </div>

      <div class="alert alert-info">
        Citizens are assigned to this node by the gateway scheduler based on hardware capabilities and workload affinity. The global HoC constitution applies — each citizen obeys its owning republic's governance.
      </div>

      <div class="card">
        <div class="empty-state">
          <div class="icon">👥</div>
          <p>No citizens are currently assigned to this node</p>
          <p style="font-size:12px;margin-top:4px">Connect to a gateway to receive citizen assignments</p>
        </div>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
//  PAGE: Configuration
// ═══════════════════════════════════════════════════════════════

async function renderConfig(el) {
  let config;
  try {
    config = await api("/api/config");
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">Failed to load config: ${esc(err.message)}</div>`;
    return;
  }

  el.innerHTML = `
    <div class="page-enter">
      <div class="page-header">
        <h1>⚙️ Configuration</h1>
        <p>Node settings and cluster configuration</p>
      </div>

      <div class="card" style="margin-bottom:16px">
        <div class="card-title">General</div>
        <div class="input-group" style="margin-top:12px">
          <label for="cfg-name">Display Name</label>
          <input type="text" id="cfg-name" class="input" value="${esc(config.displayName)}" />
        </div>
        <div class="input-group">
          <label>Node ID</label>
          <input type="text" class="input" value="${esc(config.nodeId)}" disabled style="opacity:0.6" />
        </div>
      </div>

      <div class="card" style="margin-bottom:16px">
        <div class="card-title">Tags & Affinities</div>
        <div class="input-group" style="margin-top:12px">
          <label for="cfg-tags">Node Tags (comma-separated)</label>
          <input type="text" id="cfg-tags" class="input" value="${esc(config.tags.join(", "))}" placeholder="e.g. cuda, high-vram, eu-west" />
        </div>
        <div class="input-group">
          <label for="cfg-affinities">Plugin Affinities (comma-separated)</label>
          <input type="text" id="cfg-affinities" class="input" value="${esc(config.pluginAffinities.join(", "))}" placeholder="e.g. bark, facefusion, whisper" />
        </div>
      </div>

      <div class="card" style="margin-bottom:16px">
        <div class="card-title">Cluster</div>
        <div class="input-group" style="margin-top:12px">
          <label for="cfg-redis">Redis URL (optional)</label>
          <input type="text" id="cfg-redis" class="input" value="${esc(config.cluster.redisUrl || "")}" placeholder="redis://localhost:6379" />
        </div>
      </div>

      <button id="save-config-btn" class="btn btn-primary">💾 Save Configuration</button>
      <div id="config-result" style="margin-top:12px"></div>
    </div>
  `;

  document.getElementById("save-config-btn").addEventListener("click", async () => {
    const btn = document.getElementById("save-config-btn");
    const resultEl = document.getElementById("config-result");
    btn.disabled = true;

    const tagsRaw = document.getElementById("cfg-tags").value;
    const affinitiesRaw = document.getElementById("cfg-affinities").value;

    const patch = {
      displayName: document.getElementById("cfg-name").value.trim(),
      tags: tagsRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      pluginAffinities: affinitiesRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      cluster: { redisUrl: document.getElementById("cfg-redis").value.trim() || undefined },
    };

    try {
      await api("/api/config", { method: "POST", body: JSON.stringify(patch) });
      resultEl.innerHTML = '<div class="alert alert-success">✅ Configuration saved</div>';
    } catch (err) {
      resultEl.innerHTML = `<div class="alert alert-danger">Save failed: ${esc(err.message)}</div>`;
    } finally {
      btn.disabled = false;
    }
  });
}

// ═══════════════════════════════════════════════════════════════
//  PAGE: Logs
// ═══════════════════════════════════════════════════════════════

async function renderLogs(el) {
  el.innerHTML = `
    <div class="page-enter">
      <div class="page-header">
        <h1>📝 Logs</h1>
        <p>Live log stream from this node</p>
      </div>
      <div class="card">
        <div class="card-header">
          <div class="card-title">Log Stream</div>
          <button id="clear-logs" class="btn btn-sm btn-outline">Clear</button>
        </div>
        <div id="log-container" class="log-stream"></div>
      </div>
    </div>
  `;

  const logContainer = document.getElementById("log-container");
  const evtSource = new EventSource("/api/logs");

  // oxlint-disable-next-line prefer-add-event-listener
  evtSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "heartbeat") {return;}
      const entry = document.createElement("div");
      entry.className = "log-entry";
      const ts = data.ts ? new Date(data.ts).toLocaleTimeString() : "";
      const level = (data.level || "info").toLowerCase();
      entry.innerHTML = `
        <span class="log-ts">${ts}</span>
        <span class="log-level ${level}">${level.toUpperCase()}</span>
        <span class="log-msg">${esc(data.message || JSON.stringify(data))}</span>
      `;
      logContainer.appendChild(entry);
      logContainer.scrollTop = logContainer.scrollHeight;
    } catch {
      /* ignore parse errors */
    }
  };

  document.getElementById("clear-logs").addEventListener("click", () => {
    logContainer.innerHTML = "";
  });

  // Clean up SSE on navigation
  const cleanup = () => {
    evtSource.close();
    window.removeEventListener("hashchange", cleanup);
  };
  window.addEventListener("hashchange", cleanup);
}

// ═══════════════════════════════════════════════════════════════
//  PAGE: Windows Service
// ═══════════════════════════════════════════════════════════════

async function renderWindows(el) {
  let winStatus;
  try {
    winStatus = await api("/api/windows");
  } catch (err) {
    el.innerHTML = `<div class="alert alert-danger">Failed to check Windows service: ${esc(err.message)}</div>`;
    return;
  }

  el.innerHTML = `
    <div class="page-enter">
      <div class="page-header">
        <h1>🪟 Windows Companion Service</h1>
        <p>System-level control and monitoring for Windows-based nodes</p>
      </div>

      <div class="card" style="margin-bottom:16px">
        <div class="card-header">
          <div class="card-title">Service Status</div>
          <span class="badge ${winStatus.available ? "badge-success" : "badge-danger"}">
            ${winStatus.available ? "Running" : "Not Available"}
          </span>
        </div>
        ${winStatus.reason ? `<p style="color:var(--text-muted);font-size:13px">${esc(winStatus.reason)}</p>` : ""}
        ${winStatus.serviceUrl ? `<p style="color:var(--text-muted);font-size:12px;margin-top:4px">URL: ${esc(winStatus.serviceUrl)}</p>` : ""}
      </div>

      ${
        !winStatus.available
          ? `
        <div class="alert alert-info">
          The Windows companion service provides deep system integration including process management, hardware monitoring, and system controls.
          Make sure the service is installed and running on this Windows server.
        </div>
      `
          : `
        <div class="card">
          <div class="card-title">Capabilities</div>
          <p style="color:var(--text-muted);font-size:13px;margin:8px 0 12px">
            The companion service exposes system-level operations that plugins and agents can use.
          </p>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <span class="badge badge-info">Process Management</span>
            <span class="badge badge-info">File Operations</span>
            <span class="badge badge-info">Registry Access</span>
            <span class="badge badge-info">Network Config</span>
            <span class="badge badge-info">Service Control</span>
            <span class="badge badge-info">Power Management</span>
            <span class="badge badge-info">Display Control</span>
            <span class="badge badge-info">Audio Control</span>
            <span class="badge badge-info">Clipboard</span>
            <span class="badge badge-info">Screenshots</span>
          </div>
        </div>
      `
      }
    </div>
  `;
}
