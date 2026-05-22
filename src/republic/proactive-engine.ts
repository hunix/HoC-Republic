/**
 * Proactive Engine — Barrel Re-export
 */
export type {
  Trigger,
  TriggerSource,
  TriggerStatus,
  TriggerCondition,
  TriggerAction,
  ProactiveEvent,
  ProactiveDiagnostics,
} from "./proactive-engine/types.js";

export {
  createTrigger,
  getTrigger,
  listTriggers,
  setTriggerStatus,
  deleteTrigger,
  onTriggerFire,
  evaluateEvent,
  getProactiveDiagnostics,
  resetProactiveEngine,
} from "./proactive-engine/core.js";
