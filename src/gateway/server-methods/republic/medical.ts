/**
 * Republic Medical Specialist — RPC Gateway Handlers
 *
 * republic.medical.* — citizen medical image analysis and clinical Q&A
 */

import type { GatewayRequestHandlers } from "../types.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";
import {
  getAllSpecializations,
  getSpecialization,
  getSpecializationsByCategory,
  analyzeMedicalImage,
  answerClinicalQuestion,
  getDiagnosisHistory,
  getMedicalStats,
} from "../../../republic/medical-specialist.js";

export const medicalHandlers: Partial<GatewayRequestHandlers> = {

  /** List all 50 specializations */
  "republic.medical.specializations.list": ({ params, respond }) => {
    const p = params as { category?: string } | null;
    const list = p?.category
      ? getSpecializationsByCategory(p.category as "clinical" | "surgical" | "diagnostic" | "pharmaceutical" | "specialized")
      : getAllSpecializations();
    respond(true, { specializations: list, total: list.length }, undefined);
  },

  /** Get a single specialization */
  "republic.medical.specializations.get": ({ params, respond }) => {
    const p = params as { id?: string } | null;
    const spec = getSpecialization(p?.id ?? "");
    if (!spec) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `Specialist '${p?.id}' not found`));
      return;
    }
    respond(true, spec, undefined);
  },

  /**
   * Analyze a medical image — the main diagnostic endpoint.
   * Accepts base64 image, specialist id, image type, and optional clinical context.
   */
  "republic.medical.analyze": ({ params, respond }) => {
    const p = params as {
      specialistId?: string;
      imageBase64?: string;
      imageMimeType?: string;
      imageType?: string;
      clinicalContext?: string;
      question?: string;
    } | null;

    if (!p?.specialistId || !p?.imageBase64 || !p?.imageType) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "specialistId, imageBase64, and imageType are required"));
      return;
    }

    analyzeMedicalImage({
      specialistId: p.specialistId,
      imageBase64: p.imageBase64,
      imageMimeType: p.imageMimeType ?? "image/jpeg",
      imageType: p.imageType,
      clinicalContext: p.clinicalContext,
      question: p.question,
    })
      .then((report) => respond(true, report, undefined))
      .catch((err: unknown) => respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err))));
  },

  /**
   * Answer a clinical / pharmaceutical question without an image.
   */
  "republic.medical.ask": ({ params, respond }) => {
    const p = params as { specialistId?: string; question?: string; context?: string } | null;

    if (!p?.specialistId || !p?.question) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "specialistId and question are required"));
      return;
    }

    answerClinicalQuestion(p.specialistId, p.question, p.context)
      .then((result) => respond(true, result, undefined))
      .catch((err: unknown) => respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err))));
  },

  /** List recent diagnosis reports */
  "republic.medical.history": ({ params, respond }) => {
    const p = params as { limit?: number } | null;
    respond(true, { reports: getDiagnosisHistory(p?.limit ?? 20) }, undefined);
  },

  /** Dashboard stats */
  "republic.medical.stats": ({ respond }) => {
    respond(true, getMedicalStats(), undefined);
  },
};
