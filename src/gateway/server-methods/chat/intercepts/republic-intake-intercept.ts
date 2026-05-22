/**
 * Chat Intercept — Republic Project Intake
 *
 * Detects project/research requests and routes them to the Republic
 * intake pipeline for automated project creation and team assembly.
 */

import type { IntakeSource } from "../../../../republic/project-intake.js";
import type { GatewayRequestContext } from "../../types.js";
import { classifyIntent, processIntakeMessage } from "../../../../republic/project-intake.js";
import { getState as getRepublicState } from "../../../../republic/state.js";
import { loadSessionEntry } from "../../../session-utils.js";

/**
 * Augment the message with Republic project intake metadata.
 * This is fire-and-forget — it never blocks or intercepts the pipeline.
 * Returns the (potentially augmented) message.
 */
export function augmentWithRepublicIntake(params: {
  parsedMessage: string;
  sessionKey: string;
  context: GatewayRequestContext;
  clientId: string;
}): string {
  const { sessionKey, context, clientId } = params;
  let { parsedMessage } = params;

  try {
    const intent = classifyIntent(parsedMessage);
    if (intent.isProject && intent.confidence > 0.6) {
      const republicState = getRepublicState();
      const intakeEntry = loadSessionEntry(sessionKey);
      const source: IntakeSource = intakeEntry.entry?.channel === "whatsapp" ? "whatsapp" : "webui";

      // Fire-and-forget: create the project in the Republic
      processIntakeMessage({
        source,
        userId: clientId,
        message: parsedMessage,
        availableCitizens: republicState.citizens,
      })
        .then((intake) => {
          if (intake.status === "assigned" || intake.status === "creating") {
            context.logGateway.info(
              `Republic intake: project ${intake.projectId ?? "pending"} created from ${source} (type: ${intake.projectType}, PM: ${intake.pmCitizenId ?? "none"})`,
            );
          }
        })
        .catch((err) => {
          context.logGateway.warn(
            `Republic intake failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        });

      // Augment message so the agent knows a Republic project was created
      parsedMessage += `\n\n<republic_project_intake>\nA Republic project has been automatically created for this request.\nProject type: ${intent.projectType}\nConfidence: ${intent.confidence.toFixed(2)}\nThe Republic workforce is assembling a team of citizens to work on this.\nYou can track progress in the Republic dashboard.\n</republic_project_intake>`;
    }
  } catch (intakeErr) {
    context.logGateway.warn(
      `Republic intake intercept error: ${intakeErr instanceof Error ? intakeErr.message : String(intakeErr)}`,
    );
  }

  return parsedMessage;
}
