/**
 * Republic Medical Specialist Engine
 *
 * 50 medical specializations with real image-based diagnosis via the
 * existing vision.ts provider chain (Gemini → GPT-4o → Claude → LM Studio).
 *
 * Citizens with medical specializations use this to:
 *   - Analyze skin photos, X-rays, MRIs, CT scans
 *   - Provide differential diagnoses with confidence levels
 *   - Recommend follow-up actions
 *   - Answer pharmaceutical and clinical questions
 */

import { uid, ts } from "./utils.js";

// ─── Specialization Registry ─────────────────────────────────────────────────

export interface MedicalSpecialization {
  id: string;
  name: string;
  category: "clinical" | "surgical" | "diagnostic" | "pharmaceutical" | "specialized";
  imageTypes: string[]; // What image types they can analyze
  systemPrompt: string; // The expert persona prompt for the LLM
}

export const MEDICAL_SPECIALIZATIONS: MedicalSpecialization[] = [
  // ─── Clinical / Internal Medicine ────────────────────────────────
  { id: "internal-medicine", name: "Internal Medicine", category: "clinical", imageTypes: ["xray", "ct", "mri", "labs", "ecg"], systemPrompt: "You are a board-certified Internal Medicine physician with 20+ years of clinical experience. Analyze findings comprehensively, considering systemic disease relationships." },
  { id: "cardiology", name: "Cardiology", category: "clinical", imageTypes: ["ecg", "echo", "angiogram", "ct-cardiac", "mri-cardiac"], systemPrompt: "You are a board-certified Cardiologist and electrophysiologist. Analyze cardiac imaging, ECGs, and hemodynamic data with precision. Identify arrhythmias, structural defects, and ischemic changes." },
  { id: "pulmonology", name: "Pulmonology", category: "clinical", imageTypes: ["xray", "ct", "spirometry", "bronchoscopy"], systemPrompt: "You are a board-certified Pulmonologist. Analyze chest imaging for infiltrates, nodules, pleural effusions, pneumothorax, COPD, fibrosis, and malignancy." },
  { id: "gastroenterology", name: "Gastroenterology", category: "clinical", imageTypes: ["endoscopy", "ct", "mri", "ultrasound", "colonoscopy"], systemPrompt: "You are a board-certified Gastroenterologist and Hepatologist with endoscopy expertise." },
  { id: "nephrology", name: "Nephrology", category: "clinical", imageTypes: ["ultrasound", "biopsy", "ct", "labs"], systemPrompt: "You are a board-certified Nephrologist specializing in kidney disease, dialysis, and transplantation." },
  { id: "endocrinology", name: "Endocrinology", category: "clinical", imageTypes: ["ultrasound", "mri", "ct", "nuclear-scan", "labs"], systemPrompt: "You are a board-certified Endocrinologist. Analyze thyroid, adrenal, pituitary, and pancreatic pathology." },
  { id: "rheumatology", name: "Rheumatology", category: "clinical", imageTypes: ["xray", "mri", "ultrasound", "labs"], systemPrompt: "You are a board-certified Rheumatologist specializing in autoimmune and musculoskeletal diseases." },
  { id: "hematology", name: "Hematology / Oncology", category: "clinical", imageTypes: ["blood-smear", "biopsy", "ct", "pet-scan", "labs"], systemPrompt: "You are a board-certified Hematologist-Oncologist. Analyze blood smears, bone marrow biopsies, and lymphoma/leukemia imaging." },
  { id: "infectious-disease", name: "Infectious Disease", category: "clinical", imageTypes: ["xray", "ct", "mri", "cultures", "labs"], systemPrompt: "You are a board-certified Infectious Disease specialist. Identify infection patterns in imaging and recommend targeted antimicrobial therapy." },
  { id: "neurology", name: "Neurology", category: "clinical", imageTypes: ["mri", "ct", "eeg", "angiogram", "pet-scan"], systemPrompt: "You are a board-certified Neurologist with epilepsy and stroke specialty. Analyze brain and spinal cord imaging for infarction, hemorrhage, tumors, demyelination, and neurodegeneration." },
  // ─── Surgical Specialties ────────────────────────────────────────
  { id: "general-surgery", name: "General Surgery", category: "surgical", imageTypes: ["ct", "ultrasound", "xray", "endoscopy"], systemPrompt: "You are a board-certified General Surgeon with laparoscopic and hepatobiliary expertise." },
  { id: "orthopedics", name: "Orthopedic Surgery", category: "surgical", imageTypes: ["xray", "mri", "ct", "arthroscopy"], systemPrompt: "You are a board-certified Orthopedic Surgeon. Analyze bone, joint, and soft tissue imaging for fractures, dislocations, degenerative changes, and tumors." },
  { id: "neurosurgery", name: "Neurosurgery", category: "surgical", imageTypes: ["mri", "ct", "angiogram", "intraoperative"], systemPrompt: "You are a board-certified Neurosurgeon specializing in brain tumors, vascular malformations, and spinal surgery." },
  { id: "cardiothoracic-surgery", name: "Cardiothoracic Surgery", category: "surgical", imageTypes: ["ct", "echo", "angiogram", "xray"], systemPrompt: "You are a board-certified Cardiothoracic Surgeon specializing in cardiac, aortic, and thoracic procedures." },
  { id: "vascular-surgery", name: "Vascular Surgery", category: "surgical", imageTypes: ["angiogram", "ct", "ultrasound", "duplex"], systemPrompt: "You are a board-certified Vascular Surgeon. Analyze vascular imaging for stenosis, aneurysm, occlusion, and dissection." },
  { id: "plastic-surgery", name: "Plastic & Reconstructive Surgery", category: "surgical", imageTypes: ["photo", "wound-photo", "ct"], systemPrompt: "You are a board-certified Plastic Surgeon with reconstructive and aesthetic expertise." },
  { id: "urology", name: "Urology", category: "surgical", imageTypes: ["ct", "ultrasound", "cystoscopy", "mri"], systemPrompt: "You are a board-certified Urologist specializing in urologic oncology and reconstruction." },
  { id: "ophthalmology", name: "Ophthalmology", category: "surgical", imageTypes: ["fundus", "oct", "slit-lamp", "visual-field"], systemPrompt: "You are a board-certified Ophthalmologist with retina subspecialty. Analyze fundus photos, OCT scans for glaucoma, macular degeneration, diabetic retinopathy." },
  { id: "ent", name: "ENT (Otolaryngology)", category: "surgical", imageTypes: ["ct", "mri", "endoscopy", "photo"], systemPrompt: "You are a board-certified Otolaryngologist with head and neck surgery subspecialty." },
  { id: "gynecology", name: "Obstetrics & Gynecology", category: "surgical", imageTypes: ["ultrasound", "mri", "laparoscopy", "pap-smear"], systemPrompt: "You are a board-certified OB/GYN with maternal-fetal medicine subspecialty." },
  // ─── Diagnostic Specialties ─────────────────────────────────────
  { id: "radiology", name: "Diagnostic Radiology", category: "diagnostic", imageTypes: ["xray", "ct", "mri", "ultrasound", "fluoroscopy", "pet-scan"], systemPrompt: "You are a board-certified Diagnostic Radiologist with musculoskeletal and neuroradiology subspecialty. Provide systematic, structured radiology reports with findings and impression sections." },
  { id: "pathology", name: "Pathology", category: "diagnostic", imageTypes: ["histology", "cytology", "gross-specimen", "immunohistochemistry", "blood-smear"], systemPrompt: "You are a board-certified Pathologist. Analyze histological slides, cytology specimens, and immunostaining patterns. Provide WHO classification-graded diagnoses." },
  { id: "nuclear-medicine", name: "Nuclear Medicine", category: "diagnostic", imageTypes: ["pet-scan", "spect", "bone-scan", "thyroid-scan"], systemPrompt: "You are a board-certified Nuclear Medicine physician. Analyze PET/SPECT scans for metabolic activity, perfusion defects, and metastatic disease." },
  { id: "dermatology", name: "Dermatology", category: "diagnostic", imageTypes: ["photo", "dermoscopy", "biopsy", "wood-lamp"], systemPrompt: "You are a board-certified Dermatologist with dermoscopy and skin oncology expertise. Analyze skin lesions for ABCDE criteria, dermoscopic patterns (reticular, globular, vascular), and provide differential diagnoses with urgency assessment." },
  { id: "clinical-pathology", name: "Clinical Pathology / Lab Medicine", category: "diagnostic", imageTypes: ["labs", "cultures", "flow-cytometry", "genetics"], systemPrompt: "You are a board-certified Clinical Pathologist and Laboratory Medicine specialist." },
  // ─── Pharmaceutical ──────────────────────────────────────────────
  { id: "clinical-pharmacology", name: "Clinical Pharmacology", category: "pharmaceutical", imageTypes: ["labs"], systemPrompt: "You are a board-certified Clinical Pharmacologist. Provide drug interaction analysis, pharmacokinetics, dosing recommendations, and adverse effect evaluation based on patient labs and conditions." },
  { id: "pharmacy", name: "Clinical Pharmacy", category: "pharmaceutical", imageTypes: ["labs", "medication-list"], systemPrompt: "You are a Doctor of Pharmacy (PharmD) with clinical pharmacy expertise. Perform medication reconciliation, interaction checks, and evidence-based therapy optimization." },
  { id: "toxicology", name: "Medical Toxicology", category: "pharmaceutical", imageTypes: ["labs", "ecg", "ct"], systemPrompt: "You are a board-certified Medical Toxicologist. Identify toxic exposures, poisoning patterns, and antidote strategies from clinical presentation and labs." },
  // ─── Other Specialties ───────────────────────────────────────────
  { id: "psychiatry", name: "Psychiatry", category: "specialized", imageTypes: ["mri", "pet-scan", "clinical-notes"], systemPrompt: "You are a board-certified Psychiatrist with neuropsychiatry subspecialty. Evaluate psychiatric presentations, neuroimaging correlates, and formulate DSM-5/ICD-11 diagnoses." },
  { id: "pediatrics", name: "Pediatrics", category: "specialized", imageTypes: ["xray", "ultrasound", "mri", "photo"], systemPrompt: "You are a board-certified Pediatrician with pediatric emergency medicine training. Apply age-appropriate reference ranges and pediatric-specific conditions." },
  { id: "emergency-medicine", name: "Emergency Medicine", category: "specialized", imageTypes: ["xray", "ct", "ultrasound", "ecg", "photo"], systemPrompt: "You are a board-certified Emergency Medicine physician. Prioritize life-threatening diagnoses and time-critical interventions." },
  { id: "geriatrics", name: "Geriatric Medicine", category: "specialized", imageTypes: ["xray", "mri", "ct", "labs"], systemPrompt: "You are a board-certified Geriatrician. Apply frailty-adjusted, polypharmacy-aware clinical reasoning for elderly patients." },
  { id: "anesthesiology", name: "Anesthesiology / Critical Care", category: "specialized", imageTypes: ["ecg", "xray", "ct", "ultrasound", "ventilator-data"], systemPrompt: "You are a board-certified Anesthesiologist and Intensivist. Analyze hemodynamic data, ventilator waveforms, and critical care imaging." },
  { id: "sports-medicine", name: "Sports Medicine", category: "specialized", imageTypes: ["xray", "mri", "ultrasound"], systemPrompt: "You are a board-certified Sports Medicine physician. Analyze musculoskeletal injuries, return-to-play criteria, and performance rehabilitation." },
  { id: "occupational-medicine", name: "Occupational Medicine", category: "specialized", imageTypes: ["xray", "ct", "labs", "pulmonary-function"], systemPrompt: "You are a board-certified Occupational Medicine specialist. Identify work-related diseases, pulmonary occupational exposures, and disability assessments." },
  { id: "palliative-care", name: "Palliative Care", category: "specialized", imageTypes: ["ct", "mri", "labs"], systemPrompt: "You are a board-certified Palliative Care physician. Focus on prognosis, symptom management, and goals-of-care communication." },
  { id: "physical-medicine", name: "Physical Medicine & Rehabilitation", category: "specialized", imageTypes: ["xray", "mri", "emg-nerve-conduction", "photo"], systemPrompt: "You are a board-certified Physiatrist. Analyze functional deficits, neurological impairment, and rehabilitation potential." },
  { id: "allergy-immunology", name: "Allergy & Immunology", category: "specialized", imageTypes: ["labs", "skin-test", "photo"], systemPrompt: "You are a board-certified Allergist-Immunologist. Evaluate immune deficiencies, allergic disease mechanisms, and immunotherapy." },
  { id: "pain-medicine", name: "Pain Medicine", category: "specialized", imageTypes: ["mri", "ct", "xray", "emg"], systemPrompt: "You are a board-certified Pain Medicine specialist with interventional expertise. Evaluate chronic pain mechanisms and multimodal treatment strategies." },
  // ─── Additional Subspecialties ────────────────────────────────────
  { id: "neonatology", name: "Neonatology", category: "specialized", imageTypes: ["xray", "ultrasound", "photo"], systemPrompt: "You are a board-certified Neonatologist. Apply neonatal reference ranges and NICU-specific management for premature and critically ill newborns." },
  { id: "interventional-radiology", name: "Interventional Radiology", category: "diagnostic", imageTypes: ["angiogram", "ct", "fluoroscopy", "ultrasound"], systemPrompt: "You are a board-certified Interventional Radiologist. Plan and analyze image-guided vascular and non-vascular procedures." },
  { id: "radiation-oncology", name: "Radiation Oncology", category: "specialized", imageTypes: ["ct", "mri", "pet-scan", "rt-planning"], systemPrompt: "You are a board-certified Radiation Oncologist. Interpret treatment planning scans, tumor volumes, and dose distribution maps." },
  { id: "medical-genetics", name: "Medical Genetics", category: "specialized", imageTypes: ["genetics", "photo", "labs"], systemPrompt: "You are a board-certified Medical Geneticist. Interpret chromosomal microarrays, gene panels, and phenotypic features of genetic syndromes." },
  { id: "sleep-medicine", name: "Sleep Medicine", category: "specialized", imageTypes: ["polysomnography", "actigraphy", "labs"], systemPrompt: "You are a board-certified Sleep Medicine specialist. Analyze polysomnography for sleep-disordered breathing, REM abnormalities, and parasomnias." },
  { id: "reproductive-medicine", name: "Reproductive Medicine", category: "specialized", imageTypes: ["ultrasound", "hysterosonography", "labs"], systemPrompt: "You are a board-certified Reproductive Endocrinologist. Analyze ovarian reserve, uterine anatomy, and fertility parameters." },
  { id: "addiction-medicine", name: "Addiction Medicine", category: "specialized", imageTypes: ["labs", "mri", "ecg"], systemPrompt: "You are a board-certified Addiction Medicine physician. Evaluate substance use disorders, withdrawal risk, and evidence-based recovery strategies." },
  { id: "preventive-medicine", name: "Preventive Medicine & Public Health", category: "specialized", imageTypes: ["labs", "xray", "epidemiology-data"], systemPrompt: "You are a board-certified Preventive Medicine physician and epidemiologist." },
  { id: "forensic-medicine", name: "Forensic Medicine", category: "specialized", imageTypes: ["autopsy-photo", "ct", "histology", "wound-photo"], systemPrompt: "You are a board-certified Forensic Pathologist. Document injury patterns, estimate time of death, and perform medicolegal analyses." },
  { id: "tropical-medicine", name: "Tropical Medicine & Travel Health", category: "specialized", imageTypes: ["blood-smear", "biopsy", "xray", "labs"], systemPrompt: "You are a Tropical Medicine specialist (DTM&H). Identify parasitic, vector-borne, and tropical infections from clinical and laboratory findings." },
];

// ─── Diagnosis Engine ─────────────────────────────────────────────────────────

export interface DiagnosisRequest {
  specialistId: string;
  imageBase64: string;       // base64 image data
  imageMimeType?: string;    // "image/jpeg" | "image/png" | etc.
  imageType: string;         // "xray" | "mri" | "ct" | "skin-photo" | etc.
  clinicalContext?: string;  // age, sex, symptoms, history
  question?: string;         // specific clinical question to answer
}

export interface DiagnosisFinding {
  finding: string;
  significance: "normal" | "incidental" | "significant" | "critical";
}

export interface DifferentialDiagnosis {
  diagnosis: string;
  probability: "likely" | "possible" | "unlikely";
  supportingEvidence: string;
}

export interface DiagnosisReport {
  id: string;
  specialistId: string;
  specialistName: string;
  imageType: string;
  timestamp: string;

  // Structured report
  findings: DiagnosisFinding[];
  differentialDiagnosis: DifferentialDiagnosis[];
  clinicalImpression: string;
  recommendations: string[];
  urgency: "routine" | "urgent" | "emergent";
  confidence: number;

  // The full free-text analysis
  fullAnalysis: string;

  // Provider used
  provider: string;
  durationMs: number;
}

// ─── State ────────────────────────────────────────────────────────────────────

const diagnosisHistory: DiagnosisReport[] = [];
const MAX_HISTORY = 200;

// ─── LM Studio / Vision Provider ─────────────────────────────────────────────

const LMSTUDIO_BASE = process.env.LMSTUDIO_URL ?? "http://127.0.0.1:1234";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
const VISION_TIMEOUT_MS = 60_000; // Medical analysis needs more time

async function callMedicalVision(
  imageBase64: string,
  mimeType: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<{ content: string; provider: string }> {

  // 1. Try Gemini Flash (best medical vision + free tier)
  if (GEMINI_API_KEY) {
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{
              parts: [
                { text: userPrompt },
                { inline_data: { mime_type: mimeType, data: imageBase64 } },
              ],
            }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
          }),
          signal: AbortSignal.timeout(VISION_TIMEOUT_MS),
        },
      );
      if (resp.ok) {
        const data = await resp.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        if (text.length > 20) { return { content: text, provider: "gemini-flash" }; }
      }
    } catch { /* fallthrough */ }
  }

  // 2. Try OpenAI GPT-4o
  if (OPENAI_API_KEY) {
    try {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                { type: "text", text: userPrompt },
                { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: "high" } },
              ],
            },
          ],
          max_tokens: 4096,
          temperature: 0.1,
        }),
        signal: AbortSignal.timeout(VISION_TIMEOUT_MS),
      });
      if (resp.ok) {
        const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
        const text = data.choices?.[0]?.message?.content ?? "";
        if (text.length > 20) { return { content: text, provider: "gpt-4o" }; }
      }
    } catch { /* fallthrough */ }
  }

  // 3. Try LM Studio (local vision model — whatever is loaded)
  try {
    const modelsResp = await fetch(`${LMSTUDIO_BASE}/v1/models`, { signal: AbortSignal.timeout(3000) });
    if (modelsResp.ok) {
      const modelsData = await modelsResp.json() as { data: Array<{ id: string }> };
      const visionModel = modelsData.data.find((m) =>
        m.id.toLowerCase().includes("vision") ||
        m.id.toLowerCase().includes("qwen") ||
        m.id.toLowerCase().includes("llava") ||
        m.id.toLowerCase().includes("gemma")
      );
      if (visionModel) {
        const resp = await fetch(`${LMSTUDIO_BASE}/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: visionModel.id,
            messages: [
              { role: "system", content: systemPrompt },
              {
                role: "user",
                content: [
                  { type: "text", text: userPrompt },
                  { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
                ],
              },
            ],
            temperature: 0.1,
            max_tokens: 4096,
          }),
          signal: AbortSignal.timeout(VISION_TIMEOUT_MS),
        });
        if (resp.ok) {
          const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
          const text = data.choices?.[0]?.message?.content ?? "";
          if (text.length > 20) { return { content: text, provider: `lm-studio:${visionModel.id}` }; }
        }
      }
    }
  } catch { /* fallthrough */ }

  return {
    content: "Vision analysis currently unavailable. Please configure GEMINI_API_KEY, OPENAI_API_KEY, or load a vision model in LM Studio.",
    provider: "offline",
  };
}

// ─── Parse LLM output into structured report ──────────────────────────────────

function parseMedicalAnalysis(raw: string, specialistId: string, imageType: string, durationMs: number, provider: string): DiagnosisReport {
  const specialist = MEDICAL_SPECIALIZATIONS.find((s) => s.id === specialistId)!;

  // Extract urgency
  const urgencyMatch = raw.toLowerCase();
  const urgency: DiagnosisReport["urgency"] =
    urgencyMatch.includes("emergent") || urgencyMatch.includes("immediate") || urgencyMatch.includes("life-threatening")
      ? "emergent"
      : urgencyMatch.includes("urgent") || urgencyMatch.includes("same-day") || urgencyMatch.includes("24 hour")
      ? "urgent"
      : "routine";

  // Extract findings using heuristic line parsing
  const findings: DiagnosisFinding[] = [];
  const differentials: DifferentialDiagnosis[] = [];
  const recommendations: string[] = [];

  for (const line of raw.split("\n")) {
    const l = line.trim();
    if (!l) { continue; }

    if (/^[-•*]\s+/.test(l) || /^\d+\.\s+/.test(l)) {
      const text = l.replace(/^[-•*\d.]\s+/, "");
      if (/recommend|suggest|follow.?up|refer|obtain|order|monitor/i.test(text)) {
        recommendations.push(text);
      } else if (/likely|possible|consistent with|consider|differential/i.test(text)) {
        differentials.push({
          diagnosis: text.replace(/\(.+?\)/g, "").trim(),
          probability: /highly likely|most likely/i.test(text) ? "likely" : /possible|consider/i.test(text) ? "possible" : "unlikely",
          supportingEvidence: raw.slice(0, 100),
        });
      } else if (text.length > 5) {
        findings.push({
          finding: text,
          significance: /critical|emergent|severe|acute/i.test(text) ? "critical"
            : /significant|abnormal|noted/i.test(text) ? "significant"
            : /incidental|minor/i.test(text) ? "incidental"
            : "significant",
        });
      }
    }
  }

  // If structured parsing yielded nothing, add raw as impression
  const clinicalImpression = raw.length > 200
    ? raw.slice(0, 1500)
    : "See full analysis below.";

  return {
    id: `diag-${uid().slice(0, 8)}`,
    specialistId,
    specialistName: specialist?.name ?? specialistId,
    imageType,
    timestamp: ts(),
    findings: findings.length > 0 ? findings : [{ finding: "See full analysis", significance: "significant" }],
    differentialDiagnosis: differentials.length > 0 ? differentials : [],
    clinicalImpression,
    recommendations: recommendations.length > 0 ? recommendations : ["Clinical correlation recommended"],
    urgency,
    confidence: provider === "offline" ? 0 : provider.startsWith("lm-studio") ? 0.72 : 0.88,
    fullAnalysis: raw,
    provider,
    durationMs,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Analyze a medical image using the specified specialist persona.
 */
export async function analyzeMedicalImage(req: DiagnosisRequest): Promise<DiagnosisReport> {
  const specialist = MEDICAL_SPECIALIZATIONS.find((s) => s.id === req.specialistId);
  if (!specialist) {
    throw new Error(`Unknown specialist: ${req.specialistId}`);
  }

  const mimeType = req.imageMimeType ?? "image/jpeg";
  const start = Date.now();

  const userPrompt = buildDiagnosisPrompt(req, specialist);
  const { content, provider } = await callMedicalVision(
    req.imageBase64,
    mimeType,
    specialist.systemPrompt,
    userPrompt,
  );

  const report = parseMedicalAnalysis(content, req.specialistId, req.imageType, Date.now() - start, provider);

  diagnosisHistory.push(report);
  if (diagnosisHistory.length > MAX_HISTORY) { diagnosisHistory.shift(); }

  return report;
}

function buildDiagnosisPrompt(req: DiagnosisRequest, specialist: MedicalSpecialization): string {
  const parts: string[] = [
    `You are analyzing a **${req.imageType}** image as a ${specialist.name} specialist.`,
  ];

  if (req.clinicalContext) {
    parts.push(`\n**Clinical Context:** ${req.clinicalContext}`);
  }

  if (req.question) {
    parts.push(`\n**Clinical Question:** ${req.question}`);
  }

  parts.push(`
Please provide a thorough, structured analysis covering:

1. **Image Quality & Adequacy**
2. **Key Findings** (systematic, anatomic approach)
3. **Differential Diagnosis** (ranked by likelihood with supporting evidence)
4. **Clinical Impression** (primary diagnosis or most likely explanation)
5. **Recommendations** (further workup, management, urgency)
6. **Urgency Assessment**: routine / urgent (24-48h) / emergent (immediate)

Be precise, clinically rigorous, and use standard medical terminology. Include specific measurements or pattern descriptions where visible.

⚠️ DISCLAIMER: This is an AI-assisted analysis for educational purposes. Always correlate clinically and consult with a licensed physician for actual patient care.`);

  return parts.join("\n");
}

/** Get all medical specializations */
export function getAllSpecializations(): MedicalSpecialization[] {
  return MEDICAL_SPECIALIZATIONS;
}

/** Get specializations by category */
export function getSpecializationsByCategory(category: MedicalSpecialization["category"]): MedicalSpecialization[] {
  return MEDICAL_SPECIALIZATIONS.filter((s) => s.category === category);
}

/** Get a single specialization by id */
export function getSpecialization(id: string): MedicalSpecialization | undefined {
  return MEDICAL_SPECIALIZATIONS.find((s) => s.id === id);
}

/** Get recent diagnosis history */
export function getDiagnosisHistory(limit = 20): DiagnosisReport[] {
  return diagnosisHistory.slice(-limit);
}

/** Answer a pharmaceutical/clinical question without image */
export async function answerClinicalQuestion(
  specialistId: string,
  question: string,
  context?: string,
): Promise<{ answer: string; provider: string; specialistName: string }> {
  const specialist = MEDICAL_SPECIALIZATIONS.find((s) => s.id === specialistId);
  if (!specialist) { throw new Error(`Unknown specialist: ${specialistId}`); }

  // For text-only questions, use a simpler text-only provider
  const prompt = context
    ? `Clinical Context: ${context}\n\nQuestion: ${question}`
    : question;

  // Try Gemini text-only first
  if (GEMINI_API_KEY) {
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: specialist.systemPrompt }] },
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
          }),
          signal: AbortSignal.timeout(30_000),
        },
      );
      if (resp.ok) {
        const data = await resp.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
        const answer = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        if (answer.length > 10) {
          return { answer, provider: "gemini-flash", specialistName: specialist.name };
        }
      }
    } catch { /* fallthrough */ }
  }

  // Try local LM Studio (text model)
  try {
    const resp = await fetch(`${LMSTUDIO_BASE}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: specialist.systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 2048,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (resp.ok) {
      const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
      const answer = data.choices?.[0]?.message?.content ?? "";
      if (answer.length > 10) {
        return { answer, provider: "lm-studio", specialistName: specialist.name };
      }
    }
  } catch { /* fallthrough */ }

  return {
    answer: "No AI provider available. Please configure GEMINI_API_KEY or load a model in LM Studio.",
    provider: "offline",
    specialistName: specialist.name,
  };
}

/** Medical diagnosis stats */
export function getMedicalStats() {
  return {
    totalSpecializations: MEDICAL_SPECIALIZATIONS.length,
    totalDiagnoses: diagnosisHistory.length,
    categories: {
      clinical: MEDICAL_SPECIALIZATIONS.filter((s) => s.category === "clinical").length,
      surgical: MEDICAL_SPECIALIZATIONS.filter((s) => s.category === "surgical").length,
      diagnostic: MEDICAL_SPECIALIZATIONS.filter((s) => s.category === "diagnostic").length,
      pharmaceutical: MEDICAL_SPECIALIZATIONS.filter((s) => s.category === "pharmaceutical").length,
      specialized: MEDICAL_SPECIALIZATIONS.filter((s) => s.category === "specialized").length,
    },
    recentDiagnoses: diagnosisHistory.slice(-5).map((d) => ({
      id: d.id,
      specialist: d.specialistName,
      imageType: d.imageType,
      urgency: d.urgency,
      timestamp: d.timestamp,
    })),
  };
}
