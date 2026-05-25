import type { AgentSettings, AnalysisResult, KpiSuggestion } from "../../types";
import { try3Times } from "../retry";

const ANALYSIS_SYSTEM = `You are a Voice AI call quality analyst. Given a call transcript, KPIs, and agent settings, return a JSON object with this exact shape:
{
  "kpi_scores": [
    {
      "kpi": string,
      "passed": boolean,
      "score": number|null,
      "confidence": number 0-1,
      "evidence": string
    }
  ],
  "overall_score": number 0-1,
  "recommendations": [
    {
      "priority": "high"|"medium"|"low",
      "target_kpi_name": string,
      "target_type": "prompt"|"script_step"|"agent_config",
      "action": string,
      "suggested_change": string,
      "transcript_timestamp": "M:SS",
      "agent_field": string|null,
      "current_value": string|null,
      "suggested_value": string|null,
      "updated_prompt": string|null
    }
  ],
  "combined_prompt": string|null,
  "use_actions": [{"reason": string, "transcript_timestamp": "M:SS", "action_required": "human_followup"|"script_retraining"}]
}
Rules:
- Each KPI specifies its type: "binary" or "score".
- binary KPIs: set passed=true/false, score=null.
- score KPIs: rate 1-5 (1=very poor, 3=acceptable, 5=excellent), set score to that number, passed=(score >= threshold).
- overall_score: average of normalized scores (binary: passed=1.0/failed=0.0; score: score/5), weighted by confidence.
- For agent_config recommendations set target_type="agent_config", agent_field to the exact field name (e.g. "agentPrompt", "welcomeMessage", "maxCallDuration", "responsiveness"), current_value and suggested_value as strings.
- For each recommendation with target_type="prompt": set "updated_prompt" to the complete agentPrompt text with only this one change integrated naturally into the body of the prompt (do not append; rewrite the prompt so the change is seamlessly incorporated). Set to null if no agentPrompt was provided.
- "combined_prompt": the complete agentPrompt text with ALL prompt-type recommendations integrated simultaneously. Set to null if there are no prompt-type recommendations or no agentPrompt was provided.
- Only include use_actions when a call segment requires immediate human attention.
- Return only the JSON object, no markdown.`;

const SUGGEST_SYSTEM = `You are a Voice AI KPI designer. Given an agent's system prompt, return exactly 5 KPIs as a JSON array:
[{
  "kpi_name": string (snake_case),
  "definition": string (one clear sentence),
  "rationale": string (why this matters for this agent),
  "type": "binary"|"score",
  "threshold": number
}]
Rules for type and threshold:
- Use "binary" for yes/no compliance checks (e.g. greeting used, legal disclaimer stated). threshold=1.
- Use "score" for quality dimensions that exist on a spectrum (e.g. empathy, call resolution, objection handling). threshold=3 means 3/5 is the minimum passing score.
- Choose "score" when partial credit is meaningful; choose "binary" when it either happened or it didn't.
Return only the JSON array, no markdown.`;

function stripMarkdownFence(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
}

export abstract class BaseLLMAdapter {
  protected abstract complete(system: string, user: string, maxTokens: number): Promise<string>;

  async analyzeTranscript(
    transcript: string,
    kpis: Array<{ kpi_name: string; definition: string; type: "binary" | "score"; threshold: number }>,
    agentSettings: AgentSettings | null,
  ): Promise<AnalysisResult> {
    const kpiList = kpis
      .map((k) =>
        k.type === "score"
          ? `- ${k.kpi_name} [score 1-5, passing >= ${k.threshold}]: ${k.definition}`
          : `- ${k.kpi_name} [binary]: ${k.definition}`,
      )
      .join("\n");
    const settingsBlock = agentSettings
      ? `\nAgent Settings:\n${JSON.stringify(agentSettings, null, 2)}`
      : "";
    const user = `KPIs:\n${kpiList}${settingsBlock}\n\nTranscript:\n${transcript}`;
    const text = stripMarkdownFence(await try3Times(() => this.complete(ANALYSIS_SYSTEM, user, 4096)));
    return JSON.parse(text) as AnalysisResult;
  }

  async suggestKPIs(systemPrompt: string): Promise<KpiSuggestion[]> {
    const text = stripMarkdownFence(await try3Times(() => this.complete(SUGGEST_SYSTEM, systemPrompt, 768)));
    return JSON.parse(text) as KpiSuggestion[];
  }
}
