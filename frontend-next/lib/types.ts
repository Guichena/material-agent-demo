export type AnyRecord = Record<string, any>;

export type RunStatus =
  | "running"
  | "completed"
  | "failed"
  | "needs_confirmation"
  | "intent_not_supported"
  | "needs_clarification"
  | "initialized"
  | "unknown"
  | string;

export interface CreateRunPayload {
  prompt: string;
}

export interface RunSummary extends AnyRecord {
  run_id: string;
  status?: RunStatus;
  prompt?: string;
  parsed_formula?: string | null;
  material_name?: string | null;
  chemical_system?: string[] | string | null;
  generation_mode?: string | null;
  reference_material_count?: number;
  candidate_count?: number;
  database_lookup_enabled?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface RunRecord extends AnyRecord {
  run_id: string;
  task_id?: string;
  status?: RunStatus;
  title?: string;
  created_at?: string;
  updated_at?: string;
  num_samples?: number;
  relax?: boolean;
  report_path?: string;
  report_html_path?: string;
  report_pdf_path?: string;
  report_markdown?: string;
  output_root?: string;
  warnings?: unknown;
  parsed_formula?: string;
  material_name?: string;
  chemical_system?: string[] | string | null;
  strict_stoichiometry?: boolean;
  generation_mode?: string;
  database_lookup_enabled?: boolean;
  database_lookup_status?: unknown;
  reference_material_count?: number;
  candidate_count?: number;
  reference_materials?: unknown;
  candidates?: unknown;
  evaluated_candidates?: unknown;
  ai_plan?: unknown;
  route_steps?: unknown;
  intent?: string;
  guess?: string;
  message?: string;
  parser_confidence?: number;
  parser_reason?: string;
  mp_api_configured?: boolean;
  report_html?: string;
  selected_material_id?: string | null;
  messages?: unknown;
  trace?: unknown;
  generated_cif_paths?: string[];
  evaluation_results?: unknown;
}

export interface ReportPayload {
  markdown: string;
}

export interface ReferenceMaterial extends AnyRecord {
  material_id: string;
  formula: string;
  band_gap?: number | null;
  formation_energy_per_atom?: number | null;
  e_above_hull?: number | null;
  stable?: boolean | null;
  density?: number | null;
  volume?: number | null;
}

export interface CandidateMaterial extends AnyRecord {
  id: string;
  rank?: number | null;
  formula?: string | null;
  path?: string | null;
  relaxed_path?: string | null;
  cif_text?: string | null;
  energy_per_atom?: number | null;
  energy_per_atom_ev?: number | null;
  energy_per_atom_ev_relaxed?: number | null;
  md_avg_energy_per_atom?: number | null;
  formation_energy_per_atom?: number | null;
  max_force_ev_per_ang?: number | null;
  rms_force_ev_per_ang?: number | null;
  stress_norm?: number | null;
  relaxed?: boolean | null;
  score?: number | null;
}

export interface WorkflowNodeModel {
  id: string;
  title: string;
  toolName: string;
  status: "completed" | "running" | "warning" | "failed" | "skipped" | "demo" | "unknown";
  icon: string;
  subtitle?: string;
  inputSummary?: string;
  outputSummary?: string;
  inputs?: AnyRecord;
  outputs?: AnyRecord;
  durationMs?: number | null;
  warning?: string | null;
  error?: string | null;
  explanation?: string | null;
  source?: "ai_plan" | "route_steps" | "derived";
}

export interface ProgressStepModel {
  id: string;
  title: string;
  status: WorkflowNodeModel["status"];
  summary?: string;
  durationMs?: number | null;
}

export interface ChartSeriesItem {
  name: string;
  value: number | null;
  rawValue?: number | null;
  score?: number | null;
  force?: number | null;
}
