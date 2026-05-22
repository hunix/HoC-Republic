/**
 * Republic Gateway Handlers â€” infra
 * Auto-extracted from republic.ts for maintainability.
 */

/**
 * Republic Platform — Gateway RPC Handlers
 *
 * Thin adapter layer that maps JSON-RPC methods to the modular
 * Republic engine. All logic lives in src/republic/*.ts.
 *
 * This file ONLY contains the handler wiring — no types, no business
 * logic, no state management. Just delegation.
 */

import type { CompositeLayer, ImageSize, ImageStyle } from "../../../republic/creative-studio.js";
import type {
    ChaosExperiment, ProposalCategory, ProposalStatus
} from "../../../republic/self-replication.js";
import type { GatewayRequestHandlers } from "../types.js";
// Phase 36: Dynamic Compute Scaling
import {
    compositeImages, editImage, generateImage, generateVariations, getCitizenGallery, getCreativeStudioDiagnostics, getGallery, getImageById, upscaleImage
} from "../../../republic/creative-studio.js";
import {
    delegateTasks, formTeam, getDelegationDiagnostics, getReviewHistory, getTeam, submitForReview
} from "../../../republic/delegation.js";
// Phase 35: Docker Orchestration Engine
import {
    generateHTML, generateInvoice, generateMarkdown, generatePDF, generatePresentation,
    generateSpreadsheet, getCitizenDocuments, getDocumentHistory
} from "../../../republic/document-generator.js";
// ─── Module Imports ─────────────────────────────────────────────
// Phase 33: Infrastructure Control Plane
// Phase 34: HuggingFace Model Provisioner
// Phase 37: Database Persistence Layer
import {
    adjustParameter, applySchemaExtension, autoTune, deployProposal, getActiveChaosExperiments,
    getInfrastructureHealth, getProposals, getSchemaExtensions, getSelfReplicationDiagnostics, getTuningParameters, openProposalForReview, proposeSchemaExtension, revertSchemaExtension, startChaosExperiment, submitProposal, voteOnProposal
} from "../../../republic/self-replication.js";
import {
    getState
} from "../../../republic/state.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";

export const infraHandlers: Partial<GatewayRequestHandlers> = {
  // ─── Phase 21: Self-Replication & Infrastructure ───────────────

  "republic.infra.proposal.submit": ({ params, respond }) => {
    const p = params as
      | {
          citizenId?: string;
          category?: string;
          title?: string;
          description?: string;
          codeDiff?: string;
          affectedModules?: string[];
        }
      | undefined;
    if (!p?.citizenId || !p?.category || !p?.title || !p?.description || !p?.codeDiff) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "citizenId, category, title, description, codeDiff required",
        ),
      );
      return;
    }
    const s = getState();
    const result = submitProposal(
      s,
      p.citizenId,
      p.category as ProposalCategory,
      p.title,
      p.description,
      p.codeDiff,
      p.affectedModules ?? [],
    );
    respond(
      result.ok,
      result.ok ? { ok: true, proposal: result.proposal } : undefined,
      result.ok ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, result.error!),
    );
  },

  "republic.infra.proposal.review": ({ params, respond }) => {
    const p = params as { proposalId?: string } | undefined;
    if (!p?.proposalId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "proposalId required"));
      return;
    }
    const result = openProposalForReview(p.proposalId);
    respond(
      result.ok,
      result.ok ? { ok: true } : undefined,
      result.ok ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, result.error!),
    );
  },

  "republic.infra.proposal.vote": ({ params, respond }) => {
    const p = params as
      | { proposalId?: string; citizenId?: string; vote?: string; reason?: string }
      | undefined;
    if (!p?.proposalId || !p?.citizenId || !p?.vote || !p?.reason) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "proposalId, citizenId, vote, reason required"),
      );
      return;
    }
    const s = getState();
    const result = voteOnProposal(
      s,
      p.proposalId,
      p.citizenId,
      p.vote as "approve" | "reject",
      p.reason,
    );
    respond(
      result.ok,
      result.ok ? { ok: true } : undefined,
      result.ok ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, result.error!),
    );
  },

  "republic.infra.proposal.deploy": ({ params, respond }) => {
    const p = params as { proposalId?: string } | undefined;
    if (!p?.proposalId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "proposalId required"));
      return;
    }
    const result = deployProposal(p.proposalId);
    respond(
      result.ok,
      result.ok ? { ok: true } : undefined,
      result.ok ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, result.error!),
    );
  },

  "republic.infra.proposal.list": ({ params, respond }) => {
    const p = params as { status?: string } | undefined;
    respond(
      true,
      { ok: true, proposals: getProposals(p?.status as ProposalStatus | undefined) },
      undefined,
    );
  },

  "republic.infra.schema.propose": ({ params, respond }) => {
    const p = params as
      | {
          citizenId?: string;
          targetType?: string;
          fieldName?: string;
          fieldType?: string;
          description?: string;
        }
      | undefined;
    if (!p?.citizenId || !p?.targetType || !p?.fieldName || !p?.fieldType || !p?.description) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "citizenId, targetType, fieldName, fieldType, description required",
        ),
      );
      return;
    }
    const result = proposeSchemaExtension(
      p.citizenId,
      p.targetType,
      p.fieldName,
      p.fieldType,
      p.description,
    );
    respond(
      result.ok,
      result.ok ? { ok: true, extension: result.extension } : undefined,
      result.ok ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, result.error!),
    );
  },

  "republic.infra.schema.apply": ({ params, respond }) => {
    const p = params as { extensionId?: string } | undefined;
    if (!p?.extensionId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "extensionId required"));
      return;
    }
    const result = applySchemaExtension(p.extensionId);
    respond(
      result.ok,
      result.ok ? { ok: true } : undefined,
      result.ok ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, result.error!),
    );
  },

  "republic.infra.schema.revert": ({ params, respond }) => {
    const p = params as { extensionId?: string } | undefined;
    if (!p?.extensionId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "extensionId required"));
      return;
    }
    const result = revertSchemaExtension(p.extensionId);
    respond(
      result.ok,
      result.ok ? { ok: true } : undefined,
      result.ok ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, result.error!),
    );
  },

  "republic.infra.schema.list": ({ params, respond }) => {
    const p = params as { status?: string } | undefined;
    respond(true, { ok: true, extensions: getSchemaExtensions(p?.status) }, undefined);
  },

  "republic.infra.tuning.adjust": ({ params, respond }) => {
    const p = params as { name?: string; value?: number; reason?: string } | undefined;
    if (!p?.name || p?.value === undefined || !p?.reason) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "name, value, reason required"),
      );
      return;
    }
    const result = adjustParameter(p.name, p.value, p.reason);
    respond(
      result.ok,
      result.ok ? { ok: true } : undefined,
      result.ok ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, result.error!),
    );
  },

  "republic.infra.tuning.auto": ({ respond }) => {
    const changes = autoTune();
    respond(true, { ok: true, changes }, undefined);
  },

  "republic.infra.tuning.list": ({ respond }) => {
    respond(true, { ok: true, parameters: getTuningParameters() }, undefined);
  },

  "republic.infra.chaos.start": ({ params, respond }) => {
    const p = params as
      | { type?: string; target?: string; severity?: number; durationTicks?: number }
      | undefined;
    if (!p?.type || !p?.target || p?.severity === undefined || !p?.durationTicks) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "type, target, severity, durationTicks required"),
      );
      return;
    }
    const experiment = startChaosExperiment(
      p.type as ChaosExperiment["type"],
      p.target,
      p.severity,
      p.durationTicks,
    );
    respond(true, { ok: true, experiment }, undefined);
  },

  "republic.infra.chaos.list": ({ respond }) => {
    respond(true, { ok: true, experiments: getActiveChaosExperiments() }, undefined);
  },

  "republic.infra.health": ({ respond }) => {
    respond(true, { ok: true, health: getInfrastructureHealth() }, undefined);
  },

  "republic.infra.diagnostics": ({ respond }) => {
    respond(true, getSelfReplicationDiagnostics(), undefined);
  },

  // ─── Phase 22: Creative Studio ───────────────────────────────

  "republic.studio.generate": ({ params, respond }) => {
    const p = params as
      | { prompt?: string; style?: string; size?: string; citizenId?: string }
      | undefined;
    if (!p?.prompt) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "prompt required"));
      return;
    }
    generateImage(p.prompt, {
      style: (p.style as ImageStyle) ?? undefined,
      size: (p.size as ImageSize) ?? undefined,
      citizenId: p.citizenId,
    })
      .then((img) => respond(true, { ok: true, image: img }, undefined))
      .catch((e: Error) =>
        respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, e.message)),
      );
  },

  "republic.studio.edit": ({ params, respond }) => {
    const p = params as
      | { sourceBase64?: string; prompt?: string; maskBase64?: string; style?: string }
      | undefined;
    if (!p?.sourceBase64 || !p?.prompt) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "sourceBase64 and prompt required"),
      );
      return;
    }
    editImage({
      sourceBase64: p.sourceBase64,
      prompt: p.prompt,
      maskBase64: p.maskBase64,
      style: p.style as ImageStyle,
    })
      .then((r) => respond(true, { ok: true, result: r }, undefined))
      .catch((e: Error) =>
        respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, e.message)),
      );
  },

  "republic.studio.variations": ({ params, respond }) => {
    const p = params as { sourceBase64?: string; count?: number } | undefined;
    if (!p?.sourceBase64) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "sourceBase64 required"));
      return;
    }
    generateVariations(p.sourceBase64, p.count)
      .then((r) => respond(true, { ok: true, result: r }, undefined))
      .catch((e: Error) =>
        respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, e.message)),
      );
  },

  "republic.studio.upscale": ({ params, respond }) => {
    const p = params as { sourceBase64?: string; scaleFactor?: number } | undefined;
    if (!p?.sourceBase64) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "sourceBase64 required"));
      return;
    }
    upscaleImage(p.sourceBase64, p.scaleFactor)
      .then((r) => respond(true, { ok: true, result: r }, undefined))
      .catch((e: Error) =>
        respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, e.message)),
      );
  },

  "republic.studio.composite": ({ params, respond }) => {
    const p = params as { layers?: CompositeLayer[]; width?: number; height?: number } | undefined;
    if (!p?.layers?.length) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "layers required"));
      return;
    }
    const result = compositeImages(p.layers, p.width, p.height);
    respond(true, { ok: true, result }, undefined);
  },

  "republic.studio.gallery": ({ params, respond }) => {
    const p = params as { limit?: number } | undefined;
    respond(true, { ok: true, images: getGallery(p?.limit) }, undefined);
  },

  "republic.studio.gallery.citizen": ({ params, respond }) => {
    const p = params as { citizenId?: string; limit?: number } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    respond(true, { ok: true, images: getCitizenGallery(p.citizenId, p.limit) }, undefined);
  },

  "republic.studio.image": ({ params, respond }) => {
    const p = params as { imageId?: string } | undefined;
    if (!p?.imageId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "imageId required"));
      return;
    }
    const img = getImageById(p.imageId);
    respond(
      !!img,
      img ? { ok: true, image: img } : undefined,
      img ? undefined : errorShape(ErrorCodes.NOT_FOUND, "Image not found"),
    );
  },

  "republic.studio.diagnostics": ({ respond }) => {
    respond(true, getCreativeStudioDiagnostics(), undefined);
  },

  // ─── Phase 22: Document Generator ────────────────────────────

  "republic.docs.pdf": ({ params, respond }) => {
    const p = params as
      | {
          title?: string;
          sections?: unknown[];
          author?: string;
          citizenId?: string;
          savePath?: string;
        }
      | undefined;
    if (!p?.title || !p?.sections) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "title and sections required"),
      );
      return;
    }
    generatePDF(
      { title: p.title, format: "pdf", sections: p.sections as never[] },
      p.savePath ?? "/tmp/doc.pdf",
      p.citizenId,
    )
      .then((doc) => respond(true, { ok: true, document: doc }, undefined))
      .catch((e: Error) =>
        respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, e.message)),
      );
  },

  "republic.docs.invoice": ({ params, respond }) => {
    const p = params as
      | { invoice?: Record<string, unknown>; savePath?: string; citizenId?: string }
      | undefined;
    if (!p?.invoice) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "invoice required"));
      return;
    }
    generateInvoice(p.invoice as never, p.savePath ?? "/tmp/invoice.pdf", p.citizenId)
      .then((doc) => respond(true, { ok: true, document: doc }, undefined))
      .catch((e: Error) =>
        respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, e.message)),
      );
  },

  "republic.docs.presentation": ({ params, respond }) => {
    const p = params as
      | {
          title?: string;
          slides?: unknown[];
          theme?: string;
          savePath?: string;
          citizenId?: string;
        }
      | undefined;
    if (!p?.title || !p?.slides) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "title and slides required"),
      );
      return;
    }
    generatePresentation(
      {
        title: p.title,
        theme: (p.theme as "dark" | "light" | "corporate" | "creative") ?? "dark",
        slides: p.slides as never[],
      },
      p.savePath ?? "/tmp/deck.pptx",
      p.citizenId,
    )
      .then((doc) => respond(true, { ok: true, document: doc }, undefined))
      .catch((e: Error) =>
        respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, e.message)),
      );
  },

  "republic.docs.spreadsheet": ({ params, respond }) => {
    const p = params as
      | { title?: string; sheets?: unknown[]; savePath?: string; citizenId?: string }
      | undefined;
    if (!p?.title || !p?.sheets) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "title and sheets required"),
      );
      return;
    }
    generateSpreadsheet(
      { title: p.title, sheets: p.sheets as never[] },
      p.savePath ?? "/tmp/data.xlsx",
      p.citizenId,
    )
      .then((doc) => respond(true, { ok: true, document: doc }, undefined))
      .catch((e: Error) =>
        respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, e.message)),
      );
  },

  "republic.docs.markdown": ({ params, respond }) => {
    const p = params as
      | { title?: string; sections?: unknown[]; savePath?: string; citizenId?: string }
      | undefined;
    if (!p?.title || !p?.sections) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "title and sections required"),
      );
      return;
    }
    generateMarkdown(
      { title: p.title, format: "md", sections: p.sections as never[] },
      p.savePath ?? "/tmp/doc.md",
      p.citizenId,
    )
      .then((doc) => respond(true, { ok: true, document: doc }, undefined))
      .catch((e: Error) =>
        respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, e.message)),
      );
  },

  "republic.docs.html": ({ params, respond }) => {
    const p = params as
      | { title?: string; sections?: unknown[]; savePath?: string; citizenId?: string }
      | undefined;
    if (!p?.title || !p?.sections) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "title and sections required"),
      );
      return;
    }
    generateHTML(
      { title: p.title, format: "html", sections: p.sections as never[] },
      p.savePath ?? "/tmp/doc.html",
      p.citizenId,
    )
      .then((doc) => respond(true, { ok: true, document: doc }, undefined))
      .catch((e: Error) =>
        respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, e.message)),
      );
  },

  "republic.docs.list": ({ params, respond }) => {
    const p = params as { citizenId?: string; limit?: number } | undefined;
    if (p?.citizenId) {
      respond(true, { ok: true, documents: getCitizenDocuments(p.citizenId, p.limit) }, undefined);
    } else {
      respond(true, { ok: true, documents: getDocumentHistory(p?.limit) }, undefined);
    }
  },

  // ─── Phase 22: Delegation ────────────────────────────────────

  "republic.delegation.team.form": ({ params, respond }) => {
    const p = params as
      | { projectId?: string; requiredSpecializations?: string[]; pmCitizenId?: string }
      | undefined;
    if (!p?.projectId || !p?.requiredSpecializations?.length) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "projectId and requiredSpecializations required"),
      );
      return;
    }
    const s = getState();
    const team = formTeam({
      projectId: p.projectId,
      availableCitizens: s.citizens,
      requiredSpecializations: p.requiredSpecializations as never[],
      pmCitizenId: p.pmCitizenId,
    });
    respond(true, { ok: true, team }, undefined);
  },

  "republic.delegation.tasks.delegate": ({ params, respond }) => {
    const p = params as { projectId?: string; tasks?: unknown[] } | undefined;
    if (!p?.projectId || !p?.tasks?.length) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "projectId and tasks required"),
      );
      return;
    }
    const decisions = delegateTasks(p.projectId, p.tasks as never[]);
    respond(true, { ok: true, decisions }, undefined);
  },

  "republic.delegation.review.submit": ({ params, respond }) => {
    const p = params as { projectId?: string; taskId?: string; output?: string } | undefined;
    if (!p?.projectId || !p?.taskId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "projectId and taskId required"),
      );
      return;
    }
    const result = submitForReview({
      projectId: p.projectId,
      taskId: p.taskId,
      output: p.output ?? "",
    });
    respond(true, { ok: true, review: result }, undefined);
  },

  "republic.delegation.team.get": ({ params, respond }) => {
    const p = params as { projectId?: string } | undefined;
    if (!p?.projectId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "projectId required"));
      return;
    }
    const team = getTeam(p.projectId);
    respond(
      !!team,
      team ? { ok: true, team } : undefined,
      team ? undefined : errorShape(ErrorCodes.NOT_FOUND, "Team not found"),
    );
  },

  "republic.delegation.review.history": ({ params, respond }) => {
    const p = params as { projectId?: string } | undefined;
    respond(true, { ok: true, reviews: getReviewHistory(p?.projectId) }, undefined);
  },

  "republic.delegation.diagnostics": ({ respond }) => {
    respond(true, getDelegationDiagnostics(), undefined);
  },

};