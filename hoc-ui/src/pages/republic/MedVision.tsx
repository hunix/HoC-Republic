import { useState, useCallback, useRef } from "react";
import {
  Stethoscope, Upload, X, Brain, Search, AlertTriangle,
  CheckCircle, Clock, ChevronDown, ChevronUp, FileText,
  Zap, RefreshCw, MessageSquare, Info
} from "lucide-react";
import { useRpc, rpc } from "@/lib/rpc";
import {
  PageHeader,
  Card,
  Badge,
  Button,
  StatCard,
  Alert,
  RpcStatus,
  Tabs,
} from "@/components/ui";

// ─── Types ─────────────────────────────────────────────────────────────────

interface Specialization {
  id: string;
  name: string;
  category: "clinical" | "surgical" | "diagnostic" | "pharmaceutical" | "specialized";
  imageTypes: string[];
}

interface DiagnosisFinding {
  finding: string;
  significance: "normal" | "incidental" | "significant" | "critical";
}

interface DifferentialDiagnosis {
  diagnosis: string;
  probability: "likely" | "possible" | "unlikely";
  supportingEvidence: string;
}

interface DiagnosisReport {
  id: string;
  specialistName: string;
  imageType: string;
  timestamp: string;
  findings: DiagnosisFinding[];
  differentialDiagnosis: DifferentialDiagnosis[];
  clinicalImpression: string;
  recommendations: string[];
  urgency: "routine" | "urgent" | "emergent";
  confidence: number;
  fullAnalysis: string;
  provider: string;
  durationMs: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  clinical: "bg-info-bg text-info",
  surgical: "bg-danger-bg text-danger",
  diagnostic: "bg-purple-500/10 text-purple-400",
  pharmaceutical: "bg-success-bg text-success",
  specialized: "bg-warning-bg text-warning",
};

const URGENCY_CONFIG = {
  routine: { color: "success", label: "Routine", icon: <CheckCircle className="w-4 h-4" /> },
  urgent: { color: "warning", label: "Urgent (24-48h)", icon: <Clock className="w-4 h-4" /> },
  emergent: { color: "danger", label: "Emergent — Immediate", icon: <AlertTriangle className="w-4 h-4" /> },
} as const;

const SIGNIFICANCE_COLORS = {
  normal: "text-success",
  incidental: "text-text-muted",
  significant: "text-warning",
  critical: "text-danger",
};

const IMAGE_TYPES = [
  "skin-photo", "xray", "mri", "ct-scan", "ultrasound", "ecg",
  "fundus", "blood-smear", "histology", "dermoscopy", "wound-photo",
  "endoscopy", "angiogram", "pet-scan", "other",
];

function toBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const result = reader.result as string;
      // Strip data URI prefix
      const base64 = result.split(",")[1] ?? "";
      res(base64);
    });
    reader.addEventListener("error", rej);
    reader.readAsDataURL(file);
  });
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function ReportCard({ report }: { report: DiagnosisReport }) {
  const [expanded, setExpanded] = useState(false);
  const urgency = URGENCY_CONFIG[report.urgency];

  return (
    <Card className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-text-heading font-semibold">{report.specialistName}</span>
            <Badge variant="neutral">{report.imageType}</Badge>
            <Badge variant={urgency.color as "success" | "warning" | "danger"}>
              {urgency.icon} {urgency.label}
            </Badge>
          </div>
          <p className="text-text-muted text-xs mt-1">
            {new Date(report.timestamp).toLocaleString()} · {report.provider} · {(report.durationMs / 1000).toFixed(1)}s
          </p>
        </div>
        <div className="text-right">
          <span className="text-2xl font-black text-accent">{Math.round(report.confidence * 100)}%</span>
          <p className="text-xs text-text-muted">confidence</p>
        </div>
      </div>

      {/* Findings */}
      {report.findings.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Key Findings</p>
          <ul className="space-y-1">
            {report.findings.slice(0, 5).map((f, i) => (
              <li key={i} className={`text-sm flex items-start gap-2 ${SIGNIFICANCE_COLORS[f.significance]}`}>
                <span className="mt-0.5 flex-shrink-0">•</span>
                <span>{f.finding}</span>
                {f.significance === "critical" && <Badge variant="danger">Critical</Badge>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Differentials */}
      {report.differentialDiagnosis.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Differential Diagnosis</p>
          <div className="flex flex-wrap gap-2">
            {report.differentialDiagnosis.map((d, i) => (
              <Badge key={i} variant={d.probability === "likely" ? "success" : d.probability === "possible" ? "warning" : "neutral"}>
                {d.diagnosis} ({d.probability})
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {report.recommendations.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Recommendations</p>
          <ul className="space-y-1">
            {report.recommendations.slice(0, 4).map((r, i) => (
              <li key={i} className="text-sm text-text-secondary flex items-start gap-2">
                <ChevronDown className="w-3 h-3 mt-0.5 flex-shrink-0 text-accent" />
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Full Analysis Toggle */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between text-xs text-accent hover:text-accent/80 font-medium pt-2 border-t border-border"
      >
        <span>Full Analysis</span>
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>
      {expanded && (
        <pre className="text-xs text-text-secondary bg-bg-secondary p-4 rounded-lg whitespace-pre-wrap font-mono leading-relaxed max-h-96 overflow-auto">
          {report.fullAnalysis}
        </pre>
      )}

      <Alert variant="info">
        <Info className="w-3.5 h-3.5 inline mr-1" />
        AI-assisted analysis for educational purposes only. Always consult a licensed physician.
      </Alert>
    </Card>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export function MedVisionPage() {
  const [activeTab, setActiveTab] = useState("analyze");
  const [selectedSpecialist, setSelectedSpecialist] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageType, setImageType] = useState("skin-photo");
  const [clinicalContext, setClinicalContext] = useState("");
  const [question, setQuestion] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [report, setReport] = useState<DiagnosisReport | null>(null);
  const [analysisError, setAnalysisError] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [textQuestion, setTextQuestion] = useState("");
  const [textAnswer, setTextAnswer] = useState<{ answer: string; specialistName: string; provider: string } | null>(null);
  const [textAsking, setTextAsking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: specData, loading: specLoading, error: specError, refetch: refetchSpecs } =
    useRpc<{ specializations: Specialization[] }>("republic.medical.specializations.list", {}, []);

  const { data: statsData } =
    useRpc<{ totalSpecializations: number; totalDiagnoses: number; categories: Record<string, number> }>(
      "republic.medical.stats", {}, []
    );

  const { data: historyData } =
    useRpc<{ reports: DiagnosisReport[] }>("republic.medical.history", { limit: 10 }, [], { staleTimeMs: 10000 });

  const specializations = specData?.specializations ?? [];
  const filteredSpecs = specializations.filter((s) => {
    const matchCat = catFilter === "all" || s.category === catFilter;
    const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) { return; }
    setImageFile(file);
    const url = URL.createObjectURL(file);
    setImagePreview(url);
    setReport(null);
    setAnalysisError("");
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith("image/")) { return; }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setReport(null);
  }, []);

  const runAnalysis = async () => {
    if (!imageFile || !selectedSpecialist) { return; }
    setAnalyzing(true);
    setAnalysisError("");
    setReport(null);
    try {
      const base64 = await toBase64(imageFile);
      const result = await rpc<DiagnosisReport>("republic.medical.analyze", {
        specialistId: selectedSpecialist,
        imageBase64: base64,
        imageMimeType: imageFile.type,
        imageType,
        clinicalContext: clinicalContext.trim() || undefined,
        question: question.trim() || undefined,
      });
      setReport(result);
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : String(err));
    } finally {
      setAnalyzing(false);
    }
  };

  const askQuestion = async () => {
    if (!selectedSpecialist || !textQuestion.trim()) { return; }
    setTextAsking(true);
    setTextAnswer(null);
    try {
      const result = await rpc<{ answer: string; specialistName: string; provider: string }>("republic.medical.ask", {
        specialistId: selectedSpecialist,
        question: textQuestion.trim(),
        context: clinicalContext.trim() || undefined,
      });
      setTextAnswer(result);
    } finally {
      setTextAsking(false);
    }
  };

  const tabs = [
    { id: "analyze", label: "Image Analysis" },
    { id: "ask", label: "Clinical Q&A" },
    { id: "history", label: "History" },
    { id: "specialists", label: "All Specialists" },
  ];

  const categories = ["all", "clinical", "surgical", "diagnostic", "pharmaceutical", "specialized"];

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Medical Specialists"
        description="50 board-certified AI specialists — image diagnosis, clinical Q&A, pharmaceutical analysis"
        icon={<Stethoscope className="w-6 h-6 text-danger" />}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Specializations" value={statsData?.totalSpecializations ?? 50} icon={<Stethoscope className="w-5 h-5" />} sub="Across all domains" />
        <StatCard label="Total Diagnoses" value={statsData?.totalDiagnoses ?? 0} icon={<Brain className="w-5 h-5" />} sub="Images analyzed" />
        <StatCard label="Clinical" value={statsData?.categories?.clinical ?? 10} icon={<FileText className="w-5 h-5" />} sub="Internal medicine" />
        <StatCard label="Surgical" value={statsData?.categories?.surgical ?? 10} icon={<Zap className="w-5 h-5" />} sub="Surgery specialties" />
      </div>

      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {/* ─── Image Analysis Tab ─────────────────────────────────── */}
      {activeTab === "analyze" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Input */}
          <div className="space-y-4">
            {/* Specialist selector */}
            <Card>
              <h3 className="text-text-heading font-semibold text-sm mb-3">Select Specialist</h3>
              <RpcStatus loading={specLoading} error={specError} onRetry={refetchSpecs} />
              <div className="flex flex-wrap gap-1.5 mb-3">
                {["all", "clinical", "surgical", "diagnostic"].map((cat) => (
                  <button key={cat} onClick={() => setCatFilter(cat)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${catFilter === cat ? "bg-accent text-white" : "bg-bg-secondary text-text-muted"}`}>
                    {cat}
                  </button>
                ))}
              </div>
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
                <input className="w-full bg-bg-input border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent transition-colors"
                  placeholder="Search specialists..."
                  value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                {filteredSpecs.map((s) => (
                  <button key={s.id} onClick={() => setSelectedSpecialist(s.id)}
                    className={`w-full text-left text-sm px-3 py-2 rounded-lg transition-colors flex items-center gap-2 ${selectedSpecialist === s.id ? "bg-accent/20 border border-accent/40 text-text-heading" : "hover:bg-bg-secondary text-text-secondary"}`}>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${CATEGORY_COLORS[s.category]}`}>{s.category.slice(0, 3).toUpperCase()}</span>
                    {s.name}
                  </button>
                ))}
              </div>
            </Card>

            {/* Image type + upload */}
            <Card>
              <h3 className="text-text-heading font-semibold text-sm mb-3">Image</h3>
              <select value={imageType} onChange={(e) => setImageType(e.target.value)}
                className="w-full mb-3 bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent">
                {IMAGE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>

              {/* Drop zone */}
              <div onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-border hover:border-accent/50 rounded-xl p-6 flex flex-col items-center gap-2 cursor-pointer transition-colors text-text-muted hover:text-accent">
                <Upload className="w-8 h-8" />
                <p className="text-sm font-medium">Drop image or click to upload</p>
                <p className="text-xs">JPG, PNG, DICOM-exported PNG, dermoscopy photos</p>
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

              {imagePreview && (
                <div className="relative mt-3">
                  <img src={imagePreview} alt="Preview" className="w-full max-h-48 object-contain rounded-lg border border-border" />
                  <button onClick={() => { setImageFile(null); setImagePreview(null); }}
                    className="absolute top-2 right-2 p-1 bg-bg-card rounded-full border border-border hover:text-danger" aria-label="Remove image">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </Card>

            {/* Context */}
            <Card>
              <h3 className="text-text-heading font-semibold text-sm mb-3">Clinical Context (optional)</h3>
              <textarea rows={3} value={clinicalContext} onChange={(e) => setClinicalContext(e.target.value)}
                className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent resize-none"
                placeholder="e.g. 45yo male, non-smoker, 3-week cough, no fever. Suspicious lesion on upper back noticed 6 months ago, growing slowly..." />
              <input value={question} onChange={(e) => setQuestion(e.target.value)}
                className="w-full mt-2 bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
                placeholder="Specific question (e.g. 'Is this melanoma?')" />
              <Button className="w-full mt-3" variant="primary"
                onClick={() => void runAnalysis()}
                disabled={!imageFile || !selectedSpecialist || analyzing}>
                {analyzing ? <><RefreshCw className="w-4 h-4 animate-spin" /> Analyzing...</> : <><Brain className="w-4 h-4" /> Analyze with AI Specialist</>}
              </Button>
              {analysisError && <Alert variant="danger" className="mt-3">{analysisError}</Alert>}
            </Card>
          </div>

          {/* Right: Results */}
          <div>
            {!report && !analyzing && (
              <Card className="h-full flex flex-col items-center justify-center py-16 text-text-muted">
                <Stethoscope className="w-12 h-12 mb-4 opacity-20" />
                <p className="font-medium">Upload an image and select a specialist</p>
                <p className="text-xs mt-2 text-center max-w-xs">
                  Supports skin photos, X-rays, MRIs, CT scans, blood smears, histology slides, fundus photos, ECGs...
                </p>
              </Card>
            )}
            {analyzing && (
              <Card className="h-full flex flex-col items-center justify-center py-16">
                <RefreshCw className="w-10 h-10 animate-spin text-accent mb-4" />
                <p className="text-text-heading font-medium">Specialist is analyzing...</p>
                <p className="text-text-muted text-sm mt-1">Medical analysis may take 10-30 seconds</p>
              </Card>
            )}
            {report && <ReportCard report={report} />}
          </div>
        </div>
      )}

      {/* ─── Clinical Q&A Tab ─────────────────────────────────────── */}
      {activeTab === "ask" && (
        <div className="space-y-4 max-w-2xl">
          <Card>
            <h3 className="text-text-heading font-semibold mb-3">Ask a Clinical Question</h3>
            {!selectedSpecialist && (
              <Alert variant="warning">Select a specialist from the Image Analysis tab first.</Alert>
            )}
            {selectedSpecialist && (
              <Badge variant="info" className="mb-3">
                {specializations.find((s) => s.id === selectedSpecialist)?.name ?? selectedSpecialist}
              </Badge>
            )}
            <textarea rows={5} value={textQuestion} onChange={(e) => setTextQuestion(e.target.value)}
              className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent resize-none mb-3"
              placeholder="e.g. What is the first-line treatment for moderate-severity Crohn's disease in a 30yo patient who failed mesalamine?&#10;&#10;Or: Interpret these labs: Na 128, K 6.2, Cr 4.1, BUN 89, HCO3 14 in a diabetic patient..." />
            <Button variant="primary" onClick={() => void askQuestion()} disabled={!selectedSpecialist || !textQuestion.trim() || textAsking}>
              {textAsking ? <><RefreshCw className="w-4 h-4 animate-spin" /> Consulting Specialist...</> : <><MessageSquare className="w-4 h-4" /> Ask Specialist</>}
            </Button>
          </Card>

          {textAnswer && (
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <Stethoscope className="w-4 h-4 text-accent" />
                <span className="font-semibold text-text-heading">{textAnswer.specialistName}</span>
                <Badge variant="neutral">{textAnswer.provider}</Badge>
              </div>
              <pre className="text-sm text-text-primary whitespace-pre-wrap font-sans leading-relaxed">{textAnswer.answer}</pre>
              <Alert variant="info" className="mt-4">
                <Info className="w-3.5 h-3.5 inline mr-1" />
                AI-generated. Not a substitute for licensed physician consultation.
              </Alert>
            </Card>
          )}
        </div>
      )}

      {/* ─── History Tab ─────────────────────────────────────────── */}
      {activeTab === "history" && (
        <div className="space-y-4">
          {(historyData?.reports ?? []).length === 0 && (
            <Card className="text-center py-12 text-text-muted">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No diagnoses yet — analyze an image to get started</p>
            </Card>
          )}
          {(historyData?.reports ?? []).map((r) => <ReportCard key={r.id} report={r} />)}
        </div>
      )}

      {/* ─── Specialists Tab ─────────────────────────────────────── */}
      {activeTab === "specialists" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {categories.map((cat) => (
              <button key={cat} onClick={() => setCatFilter(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${catFilter === cat ? "bg-accent text-white" : "bg-bg-secondary text-text-muted hover:bg-bg-card"}`}>
                {cat} {cat !== "all" && statsData?.categories?.[cat] ? `(${statsData.categories[cat]})` : ""}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredSpecs.map((s) => (
              <Card key={s.id} hover onClick={() => { setSelectedSpecialist(s.id); setActiveTab("analyze"); }}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-text-heading font-semibold text-sm">{s.name}</p>
                    <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${CATEGORY_COLORS[s.category]}`}>
                      {s.category}
                    </span>
                  </div>
                  <Stethoscope className="w-4 h-4 text-text-muted flex-shrink-0 mt-0.5" />
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {s.imageTypes.slice(0, 5).map((t) => (
                    <span key={t} className="text-xs bg-bg-secondary text-text-muted px-1.5 py-0.5 rounded">{t}</span>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
