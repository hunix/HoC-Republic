import type { GatewayRequestHandlers } from "../types.js";
import { getCapabilityGraphDiagnostics } from "../../../republic/cognition/meta-capability-graph.js";
import { getMetaCoTDiagnostics } from "../../../republic/cognition/meta-cot.js";
import { getMetaToolDiagnostics } from "../../../republic/cognition/meta-tool-selector.js";
import { getReflectiveMetaLearnerDiagnostics } from "../../../republic/cognition/reflective-meta-learner.js";
import { getSkillGenesisDiagnostics } from "../../../republic/cognition/skill-genesis.js";

export const metacognitionHandlers: Partial<GatewayRequestHandlers> = {
  "republic.metacognition.diagnostics": ({ respond }) => {
    respond(
      true,
      {
        capabilityGraph: getCapabilityGraphDiagnostics(),
        metaCot: getMetaCoTDiagnostics(),
        metaTool: getMetaToolDiagnostics(),
        reflectiveLearner: getReflectiveMetaLearnerDiagnostics(),
        skillGenesis: getSkillGenesisDiagnostics(),
      },
      undefined,
    );
  },

  "republic.metacognition.meta-cot": ({ respond }) => {
    respond(true, getMetaCoTDiagnostics(), undefined);
  },

  "republic.metacognition.meta-tool-selector": ({ respond }) => {
    respond(true, getMetaToolDiagnostics(), undefined);
  },

  "republic.metacognition.skill-genesis": ({ respond }) => {
    respond(true, getSkillGenesisDiagnostics(), undefined);
  },

  "republic.metacognition.reflective-learner": ({ respond }) => {
    respond(true, getReflectiveMetaLearnerDiagnostics(), undefined);
  },

  "republic.metacognition.capability-graph": ({ respond }) => {
    respond(true, getCapabilityGraphDiagnostics(), undefined);
  },
};
