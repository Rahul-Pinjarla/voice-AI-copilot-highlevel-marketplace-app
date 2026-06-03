import type { AnalysisResult } from "../../server/src/types";

export const mockAnalysisResult: AnalysisResult = {
  ai_summary:
    "The caller wanted to book a dental appointment. The agent collected name and date of birth but failed to confirm a specific slot before the call ended. The most critical issue is the missed booking confirmation.",
  kpi_scores: [
    {
      kpi: "greeting_check",
      passed: true,
      score: null,
      confidence: 0.9,
      evidence: 'Agent opened with "Hello, Bright Smile Dental" matching the configured welcome message.',
    },
    {
      kpi: "appointment_confirmed",
      passed: false,
      score: null,
      confidence: 0.88,
      evidence: "Caller expressed availability at 2:10 but call ended at 2:40 without a confirmed date or time.",
    },
  ],
  overall_score: 0.45,
  recommendations: [
    {
      priority: "high",
      target_kpi_name: "appointment_confirmed",
      target_type: "prompt",
      action: "Add explicit booking confirmation step before ending the call",
      suggested_change:
        "Add a section to the prompt that requires the agent to confirm a specific date and time before ending the call.",
      transcript_timestamp: "2:14",
      agent_field: null,
      current_value: null,
      suggested_value: null,
      updated_prompt:
        "You are a dental appointment booking assistant. Always confirm a specific date and time with the caller before ending the call. Do not end the call without confirming: name, date of birth, insurance, and appointment date/time.",
    },
  ],
  combined_prompt: null,
  use_actions: [
    {
      what_to_change: "Follow up with this caller to confirm their appointment",
      why: "The caller expressed clear booking intent at 2:10 but no appointment was confirmed before the call ended at 2:40.",
      transcript_timestamp: "2:40",
      action_required: "human_followup",
    },
  ],
};

export const mockCleanAnalysisResult: AnalysisResult = {
  ai_summary:
    "The caller successfully booked an appointment. The agent handled the call professionally and confirmed all required details before ending.",
  kpi_scores: [
    {
      kpi: "greeting_check",
      passed: true,
      score: null,
      confidence: 0.95,
      evidence: "Agent opened with the configured greeting.",
    },
    {
      kpi: "appointment_confirmed",
      passed: true,
      score: null,
      confidence: 0.92,
      evidence: "Agent confirmed appointment for Thursday at 2pm near the end of the call.",
    },
  ],
  overall_score: 0.94,
  recommendations: [],
  combined_prompt: null,
  use_actions: [],
};
