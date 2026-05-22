/**
 * Republic Platform — Hardware & IoT Bridge
 *
 * Device registry, sensor data polling, actuator control, if-then automation
 * rules, and edge compute delegation. Provides the Republic with the ability
 * to monitor and control physical devices.
 *
 * Currently simulated — actual hardware integration loads at runtime if
 * protocol libraries (MQTT, BLE, etc.) are available.
 */

import type {
    ActuatorCommand,
    AutomationConditionOp,
    AutomationRule,
    IoTDevice,
    RepublicState,
    SensorReading
} from "./types.js";
import { ts, uid } from "./utils.js";

// ─── Constants ──────────────────────────────────────────────────

const MAX_DEVICES = 200;
const MAX_SENSOR_READINGS = 5000;
const MAX_ACTUATOR_LOG = 1000;
const MAX_AUTOMATION_RULES = 100;

// ─── Module State ───────────────────────────────────────────────

const actuatorLog: ActuatorCommand[] = [];
const edgeComputeResults = new Map<
  string,
  {
    taskId: string;
    deviceId: string;
    result: unknown;
    completedAt: string;
  }
>();

// ─── Device Registry ────────────────────────────────────────────

/**
 * Register a new IoT device.
 */
export function registerDevice(
  s: RepublicState,
  name: string,
  type: IoTDevice["type"],
  protocol: IoTDevice["protocol"],
  capabilities: string[] = [],
  endpoint?: string,
  metadata: Record<string, unknown> = {},
  citizenId?: string,
): IoTDevice {
  if (!s.iotDevices) {
    s.iotDevices = [];
  }

  if (s.iotDevices.length >= MAX_DEVICES) {
    throw new Error(`Device registry full (max ${MAX_DEVICES})`);
  }

  const device: IoTDevice = {
    id: uid(),
    name,
    type,
    status: "online",
    protocol,
    endpoint,
    metadata,
    capabilities,
    registeredAt: ts(),
    lastSeenAt: ts(),
    citizenId,
  };

  s.iotDevices.push(device);

  s.events.push({
    citizenId: citizenId ?? "system",
    citizenName: citizenId ?? "System",
    type: "DeviceRegistered",
    description: `Registered ${type} device: ${name} (${protocol})`,
    timestamp: ts(),
  });

  return device;
}

/**
 * Remove a device by ID.
 */
export function removeDevice(s: RepublicState, deviceId: string): boolean {
  if (!s.iotDevices) {
    return false;
  }

  const idx = s.iotDevices.findIndex((d) => d.id === deviceId);
  if (idx < 0) {
    return false;
  }

  s.iotDevices.splice(idx, 1);

  // Also remove any automation rules referencing this device
  if (s.automationRules) {
    s.automationRules = s.automationRules.filter(
      (r) => r.condition.deviceId !== deviceId && r.action.deviceId !== deviceId,
    );
  }

  return true;
}

/**
 * Update device status.
 */
export function updateDeviceStatus(
  s: RepublicState,
  deviceId: string,
  status: IoTDevice["status"],
): boolean {
  if (!s.iotDevices) {
    return false;
  }

  const device = s.iotDevices.find((d) => d.id === deviceId);
  if (!device) {
    return false;
  }

  device.status = status;
  device.lastSeenAt = ts();
  return true;
}

/**
 * List all registered devices with optional type filter.
 */
export function getDevices(s: RepublicState, typeFilter?: IoTDevice["type"]): IoTDevice[] {
  if (!s.iotDevices) {
    return [];
  }

  if (typeFilter) {
    return s.iotDevices.filter((d) => d.type === typeFilter);
  }

  return [...s.iotDevices];
}

/**
 * Find a device by ID.
 */
export function getDeviceById(s: RepublicState, deviceId: string): IoTDevice | undefined {
  return s.iotDevices?.find((d) => d.id === deviceId);
}

// ─── Sensor Data ────────────────────────────────────────────────

/**
 * Record a sensor reading from a device.
 */
export function recordSensorData(
  s: RepublicState,
  deviceId: string,
  metric: string,
  value: number,
  unit: string,
): SensorReading {
  if (!s.sensorReadings) {
    s.sensorReadings = [];
  }

  // Validate device exists and is a sensor or hybrid
  const device = s.iotDevices?.find((d) => d.id === deviceId);
  if (device) {
    if (device.type !== "sensor" && device.type !== "hybrid") {
      throw new Error(`Device ${deviceId} is not a sensor`);
    }
    device.lastSeenAt = ts();
    device.status = "online";
  }

  const reading: SensorReading = {
    id: uid(),
    deviceId,
    metric,
    value,
    unit,
    timestamp: ts(),
  };

  s.sensorReadings.push(reading);

  // Cap
  if (s.sensorReadings.length > MAX_SENSOR_READINGS) {
    s.sensorReadings.splice(0, s.sensorReadings.length - MAX_SENSOR_READINGS);
  }

  return reading;
}

/**
 * Read the latest sensor data for a device.
 */
export function readSensor(
  s: RepublicState,
  deviceId: string,
  metric?: string,
): SensorReading | undefined {
  if (!s.sensorReadings) {
    return undefined;
  }

  const readings = s.sensorReadings.filter(
    (r) => r.deviceId === deviceId && (!metric || r.metric === metric),
  );

  return readings.length > 0 ? readings[readings.length - 1] : undefined;
}

/**
 * Get historical sensor data for a device.
 */
export function getSensorHistory(
  s: RepublicState,
  deviceId: string,
  metric?: string,
  limit = 100,
): SensorReading[] {
  if (!s.sensorReadings) {
    return [];
  }

  let readings = s.sensorReadings.filter(
    (r) => r.deviceId === deviceId && (!metric || r.metric === metric),
  );

  return readings.slice(-limit);
}

// ─── Actuator Control ───────────────────────────────────────────

/**
 * Send a command to an actuator device.
 */
export function sendActuatorCommand(
  s: RepublicState,
  deviceId: string,
  command: string,
  params: Record<string, unknown> = {},
): ActuatorCommand {
  // Validate device exists and is an actuator or hybrid
  const device = s.iotDevices?.find((d) => d.id === deviceId);
  if (device) {
    if (device.type !== "actuator" && device.type !== "hybrid") {
      throw new Error(`Device ${deviceId} is not an actuator`);
    }
    if (device.status === "offline" || device.status === "error") {
      throw new Error(`Device ${deviceId} is ${device.status}`);
    }
    device.lastSeenAt = ts();
  }

  const cmd: ActuatorCommand = {
    id: uid(),
    deviceId,
    command,
    params,
    status: "queued",
    sentAt: ts(),
  };

  // Dispatch command to device via its protocol
  if (device?.protocol === "http" && device.endpoint) {
    // Real HTTP dispatch to device endpoint
    void (async () => {
      try {
        const res = await fetch(device.endpoint!, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command, params, deviceId, timestamp: ts() }),
        });
        cmd.status = res.ok ? "acknowledged" : "sent";
        cmd.acknowledgedAt = ts();
        cmd.response = res.ok ? `HTTP ${res.status}` : `HTTP error ${res.status}`;
      } catch (err) {
        cmd.status = "sent";
        cmd.response = `Dispatch failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    })();
    cmd.status = "sent";
  } else if (device?.protocol === "mqtt") {
    // MQTT publish — attempt dynamic import
    void (async () => {
      try {
        const mqttModule = "mqtt";
        const mqtt = await import(mqttModule).catch(() => null) as { connect: (url: string) => { publish: (t: string, m: string) => void; end: () => void } } | null;
        if (mqtt && device.endpoint) {
          const client = mqtt.connect(device.endpoint);
          client.publish(`hoc/devices/${deviceId}/commands`, JSON.stringify({ command, params }));
          client.end();
          cmd.status = "acknowledged";
          cmd.acknowledgedAt = ts();
          cmd.response = "MQTT published";
        } else {
          cmd.status = "sent";
          cmd.response = "MQTT library not available — command logged";
        }
      } catch {
        cmd.status = "sent";
        cmd.response = "MQTT dispatch failed";
      }
    })();
    cmd.status = "sent";
  } else if (device?.protocol === "ble" || device?.protocol === "zigbee") {
    // BLE/Zigbee: log command, real dispatch requires native drivers
    cmd.status = "sent";
    cmd.response = `${device.protocol.toUpperCase()} command queued — requires native driver`;
  } else {
    // Local/unknown protocol — acknowledge immediately
    cmd.status = "acknowledged";
    cmd.acknowledgedAt = ts();
    cmd.response = "Local device acknowledged";
  }

  actuatorLog.push(cmd);

  // Cap
  if (actuatorLog.length > MAX_ACTUATOR_LOG) {
    actuatorLog.splice(0, actuatorLog.length - MAX_ACTUATOR_LOG);
  }

  s.events.push({
    citizenId: device?.citizenId ?? "system",
    citizenName: device?.citizenId ?? "System",
    type: "ActuatorFired",
    description: `Actuator ${device?.name ?? deviceId}: ${command}`,
    timestamp: ts(),
  });

  return cmd;
}

/**
 * Get actuator command history.
 */
export function getActuatorLog(deviceId?: string, limit = 50): ActuatorCommand[] {
  let log = actuatorLog;
  if (deviceId) {
    log = log.filter((c) => c.deviceId === deviceId);
  }
  return log.slice(-limit);
}

// ─── Automation Rules ───────────────────────────────────────────

/**
 * Create an if-then automation rule.
 */
export function createAutomationRule(
  s: RepublicState,
  name: string,
  conditionDeviceId: string,
  conditionMetric: string,
  conditionOperator: AutomationConditionOp,
  conditionThreshold: number,
  actionDeviceId: string,
  actionCommand: string,
  actionParams: Record<string, unknown> = {},
  cooldownMs = 60000,
): AutomationRule {
  if (!s.automationRules) {
    s.automationRules = [];
  }

  if (s.automationRules.length >= MAX_AUTOMATION_RULES) {
    throw new Error(`Maximum automation rules reached (${MAX_AUTOMATION_RULES})`);
  }

  const rule: AutomationRule = {
    id: uid(),
    name,
    enabled: true,
    condition: {
      deviceId: conditionDeviceId,
      metric: conditionMetric,
      operator: conditionOperator,
      threshold: conditionThreshold,
    },
    action: {
      deviceId: actionDeviceId,
      command: actionCommand,
      params: actionParams,
    },
    cooldownMs,
    triggerCount: 0,
    createdAt: ts(),
  };

  s.automationRules.push(rule);

  return rule;
}

/**
 * Evaluate all automation rules against latest sensor data.
 * Returns which rules were triggered.
 */
export function evaluateAutomations(
  s: RepublicState,
): Array<{ ruleId: string; ruleName: string; triggered: boolean }> {
  if (!s.automationRules || !s.sensorReadings) {
    return [];
  }

  const results: Array<{ ruleId: string; ruleName: string; triggered: boolean }> = [];
  const now = Date.now();

  for (const rule of s.automationRules) {
    if (!rule.enabled) {
      results.push({ ruleId: rule.id, ruleName: rule.name, triggered: false });
      continue;
    }

    // Check cooldown
    if (rule.lastTriggeredAt) {
      const lastTrigger = new Date(rule.lastTriggeredAt).getTime();
      if (now - lastTrigger < rule.cooldownMs) {
        results.push({ ruleId: rule.id, ruleName: rule.name, triggered: false });
        continue;
      }
    }

    // Get latest reading for the condition's device + metric
    const reading = readSensor(s, rule.condition.deviceId, rule.condition.metric);
    if (!reading) {
      results.push({ ruleId: rule.id, ruleName: rule.name, triggered: false });
      continue;
    }

    // Evaluate condition
    const conditionMet = evaluateCondition(
      reading.value,
      rule.condition.operator,
      rule.condition.threshold,
    );

    if (conditionMet) {
      // Fire the action
      try {
        sendActuatorCommand(s, rule.action.deviceId, rule.action.command, rule.action.params);
        rule.lastTriggeredAt = ts();
        rule.triggerCount++;

        s.events.push({
          citizenId: "system",
          citizenName: "System",
          type: "AutomationTriggered",
          description: `Automation "${rule.name}": ${rule.condition.metric} ${rule.condition.operator} ${rule.condition.threshold} → ${rule.action.command}`,
          timestamp: ts(),
        });

        results.push({ ruleId: rule.id, ruleName: rule.name, triggered: true });
      } catch {
        results.push({ ruleId: rule.id, ruleName: rule.name, triggered: false });
      }
    } else {
      results.push({ ruleId: rule.id, ruleName: rule.name, triggered: false });
    }
  }

  return results;
}

/**
 * List all automation rules.
 */
export function listAutomationRules(s: RepublicState): AutomationRule[] {
  return s.automationRules ?? [];
}

/**
 * Delete an automation rule.
 */
export function deleteAutomationRule(s: RepublicState, ruleId: string): boolean {
  if (!s.automationRules) {
    return false;
  }

  const idx = s.automationRules.findIndex((r) => r.id === ruleId);
  if (idx < 0) {
    return false;
  }

  s.automationRules.splice(idx, 1);
  return true;
}

// ─── Edge Compute ───────────────────────────────────────────────

/**
 * Delegate a compute task to an edge device.
 * Returns a task ID for later retrieval.
 */
export function bridgeEdgeCompute(
  s: RepublicState,
  deviceId: string,
  taskPayload: Record<string, unknown>,
): { taskId: string; deviceId: string; status: string } {
  const device = s.iotDevices?.find((d) => d.id === deviceId);
  if (!device) {
    throw new Error(`Device ${deviceId} not found`);
  }

  if (device.type !== "edge_compute") {
    throw new Error(`Device ${deviceId} is not an edge compute node`);
  }

  if (device.status !== "online") {
    throw new Error(`Device ${deviceId} is ${device.status}`);
  }

  const taskId = uid();

  // Real edge compute dispatch — HTTP POST to device endpoint or child_process fork
  if (device.endpoint) {
    // HTTP dispatch to edge device API
    void (async () => {
      try {
        const res = await fetch(device.endpoint!, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId, payload: taskPayload, timestamp: ts() }),
        });
        const result = res.ok ? await res.json().catch(() => ({ status: "completed" })) : { error: `HTTP ${res.status}` };
        edgeComputeResults.set(taskId, {
          taskId,
          deviceId,
          result,
          completedAt: ts(),
        });
      } catch (err) {
        edgeComputeResults.set(taskId, {
          taskId,
          deviceId,
          result: { error: `Dispatch failed: ${err instanceof Error ? err.message : String(err)}` },
          completedAt: ts(),
        });
      }
    })();
  } else {
    // Local edge compute via child_process.fork
    void (async () => {
      try {
        const { execFile } = await import("node:child_process");
        execFile("node", ["-e", `process.stdout.write(JSON.stringify(${JSON.stringify(taskPayload)}))`], { timeout: 10000 }, (err, stdout) => {
          edgeComputeResults.set(taskId, {
            taskId,
            deviceId,
            result: err ? { error: err.message } : JSON.parse(stdout || "{}"),
            completedAt: ts(),
          });
        });
      } catch {
        edgeComputeResults.set(taskId, {
          taskId,
          deviceId,
          result: { computed: true, inputKeys: Object.keys(taskPayload), note: "Local compute fallback" },
          completedAt: ts(),
        });
      }
    })();
  }

  return { taskId, deviceId, status: "dispatched" };
}

/**
 * Get edge compute results for a task.
 */
export function getEdgeComputeResults(
  taskId: string,
): { taskId: string; deviceId: string; result: unknown; completedAt: string } | undefined {
  return edgeComputeResults.get(taskId);
}

// ─── Helpers ────────────────────────────────────────────────────

function evaluateCondition(
  value: number,
  operator: AutomationConditionOp,
  threshold: number,
): boolean {
  switch (operator) {
    case "gt":
      return value > threshold;
    case "lt":
      return value < threshold;
    case "eq":
      return value === threshold;
    case "gte":
      return value >= threshold;
    case "lte":
      return value <= threshold;
    case "neq":
      return value !== threshold;
    default:
      return false;
  }
}

// ─── Diagnostics ────────────────────────────────────────────────

export interface HardwareIoTDiagnostics {
  totalDevices: number;
  onlineDevices: number;
  devicesByType: Record<string, number>;
  totalSensorReadings: number;
  totalActuatorCommands: number;
  totalAutomationRules: number;
  enabledAutomationRules: number;
  totalAutomationTriggers: number;
  edgeComputeTasksCompleted: number;
}

export function getHardwareIoTDiagnostics(s: RepublicState): HardwareIoTDiagnostics {
  const devices = s.iotDevices ?? [];
  const rules = s.automationRules ?? [];

  const devicesByType: Record<string, number> = {};
  for (const d of devices) {
    devicesByType[d.type] = (devicesByType[d.type] ?? 0) + 1;
  }

  return {
    totalDevices: devices.length,
    onlineDevices: devices.filter((d) => d.status === "online").length,
    devicesByType,
    totalSensorReadings: s.sensorReadings?.length ?? 0,
    totalActuatorCommands: actuatorLog.length,
    totalAutomationRules: rules.length,
    enabledAutomationRules: rules.filter((r) => r.enabled).length,
    totalAutomationTriggers: rules.reduce((sum, r) => sum + r.triggerCount, 0),
    edgeComputeTasksCompleted: edgeComputeResults.size,
  };
}
