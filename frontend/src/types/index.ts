export type ShieldMode = "off" | "on";

export type SecurityDecision = "ALLOW" | "APPROVAL_REQUIRED" | "BLOCK" | "BYPASS";

export type FirewallDecision = SecurityDecision;

export type ToolName = "browser" | "filesystem" | "email" | string;

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type ExecutionStatus =
  | "EXECUTED"
  | "NOT_EXECUTED"
  | "BLOCKED"
  | "PENDING_APPROVAL"
  | "BYPASSED"
  | "ERROR"
  | "FAILED"
  | "PENDING"
  | "REJECTED";

export type ApprovalStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "EXECUTED"
  | "EXECUTION_FAILED";

export type ShieldStatus = {
  shield_enabled: boolean;
  enabled?: boolean;
  mode?: "PROTECTED" | "BASELINE" | string;
};

export type HealthStatus = {
  status: string;
  service?: string;
  shield_enabled?: boolean;
  llm_provider?: string;
};

export type AuditStats = {
  total_events: number;
  allowed: number;
  approval_required: number;
  blocked: number;
  bypassed: number;
  injections_detected: number;
  critical_events: number;
  average_risk_score: number | null;
  shield_on_events: number;
  shield_off_events: number;
  risk_low?: number;
  risk_medium?: number;
  risk_high?: number;
  risk_critical?: number;
};

export type SecurityEvent = {
  id: string;
  timestamp: string;
  session_id: string;
  request_id: string;
  shield_enabled: boolean;
  source_type: string | null;
  source_name: string | null;
  trust_level: string | null;
  user_intent: string | null;
  tool_name: string;
  action: string;
  target_resource: string | null;
  data_sensitivity: string | null;
  destination_type: string | null;
  injection_detected: boolean;
  injection_confidence: number;
  risk_score: number | null;
  risk_level: RiskLevel | string | null;
  policy_decision: SecurityDecision | string;
  firewall_decision: SecurityDecision | string;
  execution_status: ExecutionStatus | string;
  execution_result_summary: string | null;
  block_reason: string | null;
  approval_required: boolean;
  created_at: string;
};

export type ApprovalRequest = {
  id: string;
  request_id: string;
  session_id: string;
  created_at: string;
  updated_at: string;
  status: ApprovalStatus | string;
  tool_name: string;
  action: string;
  target_resource: string | null;
  source_type: string | null;
  source_name: string | null;
  trust_level?: string | null;
  data_sensitivity?: string | null;
  risk_score: number | null;
  risk_level: RiskLevel | string | null;
  policy_decision: string;
  reason: string | null;
  destination_type: string | null;
  injection_detected: boolean;
  injection_confidence?: number;
  expires_at: string;
  decided_at?: string | null;
  decided_by?: string | null;
  rejection_reason?: string | null;
  execution_status: string;
  execution_result_summary?: string | null;
  result?: Record<string, unknown> | null;
};

export type AgentToolAction = {
  tool_name: string;
  action: string;
  decision?: SecurityDecision | string;
  execution_status?: ExecutionStatus | string;
  target_resource?: string | null;
};

export type LoadState = "loading" | "success" | "empty" | "error";

export type AttackScenario = {
  id: string;
  name: string;
  description: string;
  source_type: string;
  source_name: string;
  payload: string;
  expected_risk: string;
};

export type AttackToolAttempt = {
  name: string;
  label?: string;
  attempted: boolean;
  decision: string | null;
  execution_status: string | null;
  executed: boolean;
  approval_id: string | null;
  result_summary: string | null;
  reason: string | null;
};

export type AttackPipeline = {
  trust_level: string | null;
  injection_detected: boolean | null;
  injection_confidence: number | null;
  risk_score: number | null;
  risk_level: string | null;
  policy_decision: string | null;
  firewall_decision: string | null;
  tool_executed: boolean | null;
};

export type AttackRunResult = {
  scenario_id: string;
  name: string;
  payload: string;
  source_type: string;
  source_name: string;
  shield_enabled: boolean;
  session_id: string;
  request_id: string;
  injection_detected: boolean;
  injection_confidence: number;
  risk_score: number | null;
  risk_level: string | null;
  policy_decision: string | null;
  firewall_decision: string | null;
  execution_status: string | null;
  tool_execution: boolean;
  approval_created: boolean;
  approval_id: string | null;
  audit_event_id?: string | null;
  audit_event_ids: string[];
  reason: string | null;
  pipeline: AttackPipeline;
  tools: AttackToolAttempt[];
  agent_response?: string | null;
};

export type AgentTrust = {
  source_type?: string;
  trust_level?: string;
  reason?: string;
};

export type AgentToolRun = {
  name: string;
  arguments: Record<string, unknown>;
  shield_applied: boolean;
  decision: string | null;
  status: string;
  result: Record<string, unknown> | string | null;
  reasons: string[];
  stage?: string | null;
  trust?: AgentTrust | null;
  execution_status: string | null;
  approval_required: boolean;
  approval_id?: string | null;
  risk_score?: number | null;
  risk_level?: string | null;
};

export type AgentChatRequest = {
  message: string;
  session_id?: string | null;
};

export type AgentChatResponse = {
  response: string;
  tool_calls: Array<{ name: string; arguments: Record<string, unknown> }>;
  tool_results: AgentToolRun[];
  reasoning_summary: string;
  sources: string[];
  session_id: string;
  request_id: string;
  shield_enabled: boolean;
};

export type AgentChatMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "security";
  content: string;
  timestamp: string;
  metadata?: {
    tool_results?: AgentToolRun[];
    events?: SecurityEvent[];
    error?: string;
    retryMessage?: string;
  };
};
