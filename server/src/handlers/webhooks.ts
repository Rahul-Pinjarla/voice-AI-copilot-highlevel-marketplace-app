import { randomUUID } from "crypto";
import type Database from "better-sqlite3";
import { getKpiConfigsForVersion, getLatestKpiVersion, getOrCreateAgentVersion, insertCallIfNew, softDeleteInstallation, upsertAgent, upsertCallAgentSnapshot } from "../db/queries";
import { analyzeCall } from "../lib/analysis";
import { fetchAgentById } from "../lib/ghl/api";
import type { AgentSettings } from "../types";

type Handler = (payload: Record<string, unknown>, db: Database.Database) => Promise<void>;

export const webhookHandlers: Record<string, Handler> = {
  // App lifecycle
  async AppInstalled(payload, db) {
    const locationId = (payload.locationId ?? payload.location_id) as string | undefined;
    if (!locationId) return;
    // Tokens come via OAuth callback; AppInstalled just confirms the install
    console.log(`[webhook] App installed for location: ${locationId}`);
  },

  async AppUninstalled(payload, db) {
    console.log("[webhook] AppUninstalled raw payload:", JSON.stringify(payload, null, 2));
    const locationId = (payload.locationId ?? payload.location_id) as string | undefined;
    if (!locationId) {
      console.warn("[webhook] AppUninstalled: no locationId found in payload");
      return;
    }
    softDeleteInstallation(db, locationId);
    console.log(`[webhook] App uninstalled for location: ${locationId}`);
  },

  // Voice AI call events — handle multiple possible event names
  async VoiceAiCallEnd(payload, db) {
    await handleCallEvent(payload, db);
  },
  async VOICE_AI_CALL_COMPLETED(payload, db) {
    await handleCallEvent(payload, db);
  },
  async VoiceAICallCompleted(payload, db) {
    await handleCallEvent(payload, db);
  },
  async OutboundCall(payload, db) {
    await handleCallEvent(payload, db);
  },
  async CallCompleted(payload, db) {
    await handleCallEvent(payload, db);
  },
  async TranscriptGenerated(payload, db) {
    await handleCallEvent(payload, db);
  },
};

async function handleCallEvent(
  payload: Record<string, unknown>,
  db: Database.Database,
): Promise<void> {
  const locationId = (payload.locationId ?? payload.location_id) as string | undefined;
  const callId = (payload.id ?? payload.callId ?? payload.call_id) as string | undefined;
  const transcript = (payload.transcript ?? payload.transcriptText ?? payload.body) as
    | string
    | undefined;
  const agentId = (payload.agentId ?? payload.agent_id ?? payload.botId) as string | undefined;
  const agentName = (payload.agentName ?? payload.agent_name ?? payload.botName) as string | undefined;

  const eventType = (payload.type ?? payload.event ?? payload.eventType ?? "unknown") as string;
  console.log(`[webhook] Call event: type=${eventType} callId=${callId ?? "(none)"} agentId=${agentId ?? "(none)"} location=${locationId ?? "(none)"}`);

  if (!locationId || !callId) {
    console.warn("[webhook] Call event missing locationId or callId:", JSON.stringify(payload));
    return;
  }

  // If the agent isn't in our DB yet, fetch its full details from GHL
  let ghlAgentSettings: AgentSettings | null = null;
  const ghlId = agentId ?? callId;
  const existingAgent = agentId
    ? db.prepare("SELECT id FROM agents WHERE location_id = ? AND ghl_agent_id = ?").get(locationId, agentId) as { id: string } | undefined
    : undefined;

  if (!existingAgent && agentId) {
    try {
      const ghlAgent = await fetchAgentById(db, locationId, agentId);
      if (ghlAgent) {
        upsertAgent(db, {
          location_id: locationId,
          ghl_agent_id: ghlAgent.id,
          name: ghlAgent.agentName,
          system_prompt: (ghlAgent.agentPrompt as string | undefined) ?? undefined,
        });
        ghlAgentSettings = extractAgentSettings(ghlAgent);
        console.log(`[webhook] Auto-added agent from GHL: ${ghlAgent.agentName}`);
      }
    } catch (e) {
      console.warn("[webhook] Could not fetch agent from GHL:", e);
    }
  } else if (existingAgent && agentId) {
    // Fetch fresh settings for snapshot even if agent already exists
    try {
      const ghlAgent = await fetchAgentById(db, locationId, agentId);
      if (ghlAgent) ghlAgentSettings = extractAgentSettings(ghlAgent);
    } catch { /* non-fatal */ }
  }

  const agent = upsertAgent(db, {
    location_id: locationId,
    ghl_agent_id: ghlId,
    name: agentName,  // undefined = keep existing name in DB
  });

  // Resolve current KPI config and create/match agent version before inserting call
  const kpiVersion = getLatestKpiVersion(db, agent.id);
  const kpis = kpiVersion ? getKpiConfigsForVersion(db, kpiVersion.id) : [];
  const agentVer = getOrCreateAgentVersion(db, agent.id, kpis, ghlAgentSettings);

  const { inserted } = insertCallIfNew(db, {
    id: randomUUID(),
    agent_id: agent.id,
    location_id: locationId,
    ghl_call_id: callId,
    transcript: transcript ?? null,
    metadata: JSON.stringify(payload),
    source: "webhook",
    agent_version_id: agentVer.id,
  });

  if (!inserted) {
    console.log(`[webhook] Duplicate call event ignored: ${callId}`);
    return;
  }

  console.log(`[webhook] Call received: ghl_id=${callId} agent="${agent.name}" location=${locationId} transcript=${transcript ? `${transcript.length} chars` : "none"}`);

  const row = db
    .prepare("SELECT id FROM calls WHERE location_id = ? AND ghl_call_id = ?")
    .get(locationId, callId) as { id: string } | undefined;

  if (row) {
    // Snapshot agent settings at call time for analysis context
    if (ghlAgentSettings) {
      upsertCallAgentSnapshot(db, {
        call_id: row.id,
        snapshot_json: JSON.stringify(ghlAgentSettings),
      });
    }

    if (!agent.active) {
      console.log(`[webhook] Agent ${agent.id} is inactive — call stored, analysis skipped`);
      return;
    }

    setImmediate(() => {
      analyzeCall(db, row.id).catch((err) =>
        console.error(`[webhook] Analysis failed for call ${row.id}:`, err),
      );
    });
  }
}

function extractAgentSettings(agent: Record<string, unknown>): AgentSettings {
  return {
    agentPrompt: (agent.agentPrompt as string) ?? "",
    welcomeMessage: (agent.welcomeMessage as string) ?? "",
    maxCallDuration: (agent.maxCallDuration as number) ?? 600,
    responsiveness: (agent.responsiveness as number) ?? 1,
    sendUserIdleReminders: (agent.sendUserIdleReminders as boolean) ?? false,
    reminderAfterIdleTimeSeconds: (agent.reminderAfterIdleTimeSeconds as number) ?? 4,
    actions: (agent.actions as AgentSettings["actions"]) ?? [],
    translation: (agent.translation as AgentSettings["translation"]) ?? { enabled: false },
    toolCallStrictMode: (agent.toolCallStrictMode as boolean) ?? false,
  };
}
