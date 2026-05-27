<template>
  <div class="call-detail">
    <div class="page-header">
      <div>
        <div class="crumb">
          <router-link :to="backLink" class="crumb-back">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            Back
          </router-link>
        </div>
        <h1>{{ callerLabel }}</h1>
        <div v-if="call" class="page-meta">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          {{ fmtTime(call.ingested_at) }} · {{ fmtDuration(call.duration) }} duration
        </div>
      </div>
      <div v-if="call && call.recommendations.length" class="header-actions">
        <button class="btn btn-primary btn-sm" @click="scrollToRecs">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3"/><path d="M12 18v3"/><path d="M5 12H2"/><path d="M22 12h-3"/><circle cx="12" cy="12" r="3"/></svg>
          View recommendations
        </button>
      </div>
    </div>

    <div v-if="loading" class="loading-row"><div class="spinner" /><span>Loading…</span></div>

    <template v-else-if="call">
      <!-- Analysis status banner -->
      <div v-if="call.analysis_status !== 'done'" class="status-banner">
        <span :class="['badge', statusBadge(call.analysis_status)]">{{ call.analysis_status }}</span>
        <span class="text-muted">{{ statusMsg(call.analysis_status) }}</span>
        <button v-if="showRetry" class="btn btn-secondary btn-sm" @click="retryAnalysis" :disabled="retrying">
          <svg v-if="!retrying" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/></svg>
          {{ retrying ? 'Retrying…' : 'Retry' }}
        </button>
      </div>

      <!-- ── Two-column: Transcript + KPI Checks ── -->
      <div class="pane">
        <!-- AI Summary (post-analysis) -->
        <div v-if="call.analysis?.ai_summary" class="call-summary-card card">
          <div class="call-summary-head">
            <div class="panel-title">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              AI Summary
            </div>
          </div>
          <p class="call-summary-text">{{ call.analysis.ai_summary }}</p>
        </div>

        <!-- GHL call summary (shown when not yet analysed) -->
        <div v-else-if="call.analysis_status === 'pending' && call.summary" class="call-summary-card card">
          <div class="call-summary-head">
            <div class="panel-title">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              Call Summary
            </div>
            <span class="summary-source-tag">from GHL</span>
          </div>
          <p class="call-summary-text">{{ call.summary }}</p>
        </div>

        <div class="call-layout">
          <!-- Transcript -->
          <div class="transcript card">
            <div class="transcript-head">
              <div class="panel-title">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                Transcript
              </div>
              <div class="panel-tools">
                <button class="btn btn-secondary btn-sm" :class="{ active: showTimestamps }" @click="showTimestamps = !showTimestamps">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  Show timestamps
                </button>
                <button v-if="highlightedLines.size" class="btn btn-secondary btn-sm" @click="jumpToFirstFailure">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                  Jump to failures
                </button>
              </div>
            </div>

            <div v-if="!call.transcript" class="empty-state" style="padding: 32px 20px">
              <p>No transcript available for this call.</p>
            </div>

            <div v-else ref="transcriptBody" class="transcript-body">
              <div
                v-for="(line, i) in parsedLines"
                :key="i"
                :id="`tline-${i}`"
                :class="['t-line', line.speaker === 'AGT' ? 't-agt' : 't-cal', highlightedLines.has(i) && 't-fail']"
              >
                <div class="t-meta">
                  <span class="t-speaker" :class="line.speaker === 'CAL' ? 't-speaker-cal' : ''">{{ line.speaker }}</span>
                  <span v-if="showTimestamps" class="t-ts">{{ lineTs(i) }}</span>
                </div>
                <div class="t-text">{{ line.text }}</div>
              </div>
              <div class="t-footer">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                call ended · {{ fmtDuration(call.duration) }}
              </div>
            </div>
          </div>

          <!-- KPI Checks (hidden until analysed) -->
          <div v-if="call.analysis_status !== 'pending'" class="kpi-checks">
            <div class="panel-header-row">
              <div class="panel-title">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="18" x2="3.01" y2="18"/><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/></svg>
                Goal Checks
              </div>
              <div v-if="call.analysis" class="kpi-summary">
                <span v-if="failCount" class="kpi-pill kpi-pill-fail">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {{ failCount }} fail
                </span>
                <span v-if="passCount" class="kpi-pill kpi-pill-pass">{{ passCount }} pass</span>
                <span v-if="naCount" class="kpi-pill kpi-pill-na">{{ naCount }} n/a</span>
              </div>
            </div>

            <div v-if="!call.analysis" class="empty-state" style="padding: 32px 20px">
              <p>No analysis yet.</p>
            </div>

            <div v-else class="kpi-check-list">
              <div
                v-for="score in call.analysis.kpi_scores"
                :key="score.kpi"
                :class="['kpi-check-card', 'card', kpiCardClass(score)]"
              >
                <div class="kpi-check-top">
                  <div class="kpi-check-name">{{ titleCase(score.kpi) }}</div>
                  <div class="kpi-check-right">
                    <span v-if="score.score != null" class="kpi-score-num">{{ score.score }}/5</span>
                    <span :class="['kpi-badge', kpiBadgeClass(score)]">{{ kpiBadgeLabel(score) }}</span>
                  </div>
                </div>
                <div class="kpi-check-evidence">{{ score.evidence }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- ── Recommendations ── -->
        <section v-if="call.recommendations.length" ref="recsSection" class="recs-section">
          <div class="section-label">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3"/><path d="M12 18v3"/><path d="M5 12H2"/><path d="M22 12h-3"/><path d="M6 6l1.5 1.5"/><path d="M16.5 16.5L18 18"/><path d="M6 18l1.5-1.5"/><path d="M16.5 7.5L18 6"/><circle cx="12" cy="12" r="3"/></svg>
            AI Recommendations
          </div>

          <template v-if="promptRecs.length">
            <div class="rec-category-row">
              <div class="rec-category">Prompt Changes</div>
              <button v-if="agentPrompt" class="btn btn-sm" @click="copyAllPromptRecs">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                Copy prompt with all changes
              </button>
            </div>
            <RecommendationCard
              v-for="rec in promptRecs"
              :key="rec.id"
              :rec="rec"
              :show-copy-prompt="!!agentPrompt"
              @apply="applyRec(rec.id)"
              @dismiss="dismissRec(rec.id)"
              @copy-prompt="copyUpdatedPrompt(rec)"
            />
          </template>

          <template v-if="kbRecs.length">
            <div class="rec-category">Knowledge Base Changes</div>
            <RecommendationCard
              v-for="rec in kbRecs"
              :key="rec.id"
              :rec="rec"
              @apply="applyRec(rec.id)"
              @dismiss="dismissRec(rec.id)"
            />
          </template>

          <template v-if="otherRecs.length">
            <div class="rec-category">Other Changes</div>
            <RecommendationCard
              v-for="rec in otherRecs"
              :key="rec.id"
              :rec="rec"
              @apply="applyRec(rec.id)"
              @dismiss="dismissRec(rec.id)"
            />
          </template>
        </section>

        <!-- ── Action Items ── -->
        <section v-if="pendingUseActions.length" class="below-section">
          <div class="section-label">Action Items</div>
          <ActionItemCard
            v-for="ua in pendingUseActions"
            :key="ua.id"
            :action="ua"
            @handle="markHandled(ua.id)"
            @dismiss="dismissUseAction(ua.id)"
          />
        </section>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import type { CallDetail, KpiScore, Recommendation } from "@/lib/api";
import { api } from "@/lib/api";
import { useToast } from "@/composables/useToast";
import { titleCase } from "@/lib/utils";
import RecommendationCard from "@/components/RecommendationCard.vue";
import ActionItemCard from "@/components/ActionItemCard.vue";

const route = useRoute();
const callId = route.params.id as string;
const backLink = computed(() => history.state?.back ?? "/dashboard");
const { show: showToast } = useToast();

const loading = ref(true);
const call = ref<CallDetail | null>(null);
const retrying = ref(false);
const loadedAt = ref(Date.now());
const showTimestamps = ref(false);
const transcriptBody = ref<HTMLElement | null>(null);
const recsSection = ref<HTMLElement | null>(null);

onMounted(async () => {
  call.value = await api.calls.get(callId);
  loadedAt.value = Date.now();
  loading.value = false;
});

function scrollToRecs() {
  recsSection.value?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── Transcript ────────────────────────────────────────────────────────────────
const parsedLines = computed(() => {
  const raw = call.value?.transcript ?? "";
  return raw.split("\n").filter((l) => l.trim()).map((l) => {
    if (l.startsWith("bot:")) return { speaker: "AGT", text: l.slice(4).trim() };
    if (l.startsWith("human:")) return { speaker: "CAL", text: l.slice(6).trim() };
    return { speaker: "AGT", text: l.trim() };
  });
});

const highlightedLines = computed(() => {
  const lines = new Set<number>();
  if (!call.value?.recommendations) return lines;
  for (const rec of call.value.recommendations) {
    if (!rec.transcript_timestamp) continue;
    const [m, s] = rec.transcript_timestamp.split(":").map(Number);
    const idx = Math.floor(((m || 0) * 60 + (s || 0)) / 3);
    lines.add(idx);
  }
  return lines;
});

function lineTs(i: number) {
  const secs = i * 3;
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

function jumpToFirstFailure() {
  const first = Math.min(...highlightedLines.value);
  document.getElementById(`tline-${first}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
}

// ── KPI check helpers ─────────────────────────────────────────────────────────
function kpiStatus(s: KpiScore): "pass" | "fail" | "na" {
  if (s.passed) return "pass";
  if (s.confidence < 0.45) return "na";
  return "fail";
}
function kpiBadgeLabel(s: KpiScore) { return kpiStatus(s); }
function kpiBadgeClass(s: KpiScore) {
  return { pass: "kpi-badge-pass", fail: "kpi-badge-fail", na: "kpi-badge-na" }[kpiStatus(s)];
}
function kpiCardClass(s: KpiScore) {
  return { pass: "", fail: "kpi-check-fail", na: "kpi-check-na" }[kpiStatus(s)];
}

const passCount = computed(() => call.value?.analysis?.kpi_scores.filter((s) => kpiStatus(s) === "pass").length ?? 0);
const failCount = computed(() => call.value?.analysis?.kpi_scores.filter((s) => kpiStatus(s) === "fail").length ?? 0);
const naCount   = computed(() => call.value?.analysis?.kpi_scores.filter((s) => kpiStatus(s) === "na").length ?? 0);

// ── Recommendations ───────────────────────────────────────────────────────────
const agentPrompt = computed(() => call.value?.agent_snapshot?.agentPrompt ?? "");
const promptRecs = computed(() => call.value?.recommendations.filter((r) => r.target_type === "prompt") ?? []);
const kbRecs = computed(() => call.value?.recommendations.filter((r) => r.target_type === "knowledge_base") ?? []);
const otherRecs = computed(() => call.value?.recommendations.filter((r) => r.target_type !== "prompt" && r.target_type !== "knowledge_base") ?? []);

function copyText(text: string) { navigator.clipboard.writeText(text).catch(() => {}); }

function copyUpdatedPrompt(rec: Recommendation) {
  if (rec.updated_prompt) {
    copyText(rec.updated_prompt);
  } else if (rec.agent_field === "agentPrompt" && rec.suggested_value) {
    copyText(rec.suggested_value);
  } else {
    const base = agentPrompt.value;
    const addition = rec.suggested_change ?? rec.suggested_value ?? "";
    copyText(base ? `${base}\n\n---\nSuggested addition:\n${addition}` : addition);
  }
}

function copyAllPromptRecs() {
  const combined = call.value?.analysis?.combined_prompt;
  if (combined) {
    copyText(combined);
    return;
  }
  const base = agentPrompt.value;
  const changes = promptRecs.value.map((r) => r.suggested_change ?? r.suggested_value ?? "").filter(Boolean);
  copyText(base ? `${base}\n\n---\nSuggested changes:\n${changes.map((c, i) => `${i + 1}. ${c}`).join("\n")}` : changes.join("\n"));
}

// ── Other computed ────────────────────────────────────────────────────────────
const pendingUseActions = computed(() => call.value?.use_actions?.filter((u) => u.status === "pending" && u.action_required === "human_followup") ?? []);
const callerLabel = computed(() => call.value?.caller_number ?? "Unknown call");
const showRetry = computed(() => {
  if (!call.value) return false;
  if (call.value.analysis_status === "pending") return true;
  if (call.value.analysis_status === "failed") return true;
  if (call.value.analysis_status === "running" && Date.now() - loadedAt.value > 60000) return true;
  return false;
});

// ── Actions ───────────────────────────────────────────────────────────────────
async function applyRec(id: string) {
  try { await api.recommendations.apply(id); call.value = await api.calls.get(callId); }
  catch (err) { showToast(err instanceof Error ? err.message : "Failed to apply recommendation"); }
}
async function dismissRec(id: string) {
  try { await api.recommendations.dismiss(id); call.value = await api.calls.get(callId); }
  catch (err) { showToast(err instanceof Error ? err.message : "Failed to dismiss recommendation"); }
}
async function markHandled(id: string) {
  try { await api.recommendations.handleUseAction(id); call.value = await api.calls.get(callId); }
  catch (err) { showToast(err instanceof Error ? err.message : "Failed to mark action handled"); }
}
async function dismissUseAction(id: string) {
  try { await api.recommendations.dismissUseAction(id); call.value = await api.calls.get(callId); }
  catch (err) { showToast(err instanceof Error ? err.message : "Failed to dismiss action"); }
}
async function retryAnalysis() {
  retrying.value = true;
  try {
    await api.calls.analyze(callId);
    call.value = await api.calls.get(callId);
  } catch (err) {
    showToast(err instanceof Error ? err.message : "Failed to retry analysis");
  } finally {
    retrying.value = false;
  }
}

// ── Format helpers ────────────────────────────────────────────────────────────
function fmtDuration(secs: number | null | undefined) {
  if (!secs) return "—";
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}
function fmtTime(ts: number) { return new Date(ts * 1000).toLocaleString(); }
function statusBadge(s: string) {
  const map: Record<string, string> = { done: "badge badge-pass", failed: "badge badge-fail", running: "badge badge-running", pending: "badge badge-pending", skipped: "badge badge-skipped" };
  return map[s] ?? "badge badge-pending";
}
function statusMsg(s: string) {
  const map: Record<string, string> = { pending: "Not yet analysed — agent was paused when this call came in", running: "Analysis in progress…", failed: "Analysis failed", skipped: "No transcript available" };
  return map[s] ?? s;
}
</script>

<style scoped>
.call-detail { max-width: 1040px; }

/* ── Page header ── */
.page-header { display: flex; align-items: flex-start; justify-content: space-between; padding: 24px 32px 0; }
.crumb { margin-bottom: 6px; }
.crumb-back { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 500; color: var(--ink-2); border-radius: 6px; padding: 4px 8px; text-decoration: none; }
.crumb-back:hover { background: var(--surface-2); color: var(--ink-1); }
h1 { font-size: 26px; font-weight: 700; letter-spacing: -0.02em; margin-top: 8px; }
.page-meta { margin-top: 6px; font-size: 12px; color: var(--ink-3); display: flex; align-items: center; gap: 5px; }
.header-actions { display: flex; gap: 8px; align-items: center; padding-top: 8px; flex-wrap: wrap; }
.loading-row { display: flex; align-items: center; gap: 10px; color: var(--ink-3); padding: 40px 32px; }

.status-banner { display: flex; align-items: center; gap: 10px; padding: 10px 16px; background: var(--surface-2); border-bottom: 1px solid var(--border); font-size: 13px; margin: 0; }

/* ── Pane ── */
.pane { padding: 16px 32px 40px; display: flex; flex-direction: column; gap: 22px; }

/* ── Two-column layout ── */
.call-layout { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: 20px; align-items: start; }

/* ── Transcript ── */
.transcript { display: flex; flex-direction: column; max-height: calc(100vh - 200px); overflow: hidden; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow-sm); }

.transcript-head {
  padding: 10px 14px; border-bottom: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  background: var(--surface); flex-shrink: 0;
}
.panel-title { font-size: 11.5px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-2); display: flex; align-items: center; gap: 6px; }
.panel-tools { display: flex; gap: 6px; }

.transcript-body { overflow-y: auto; display: flex; flex-direction: column; gap: 0; padding: 12px 14px; }

.t-line { display: grid; grid-template-columns: 38px 1fr; gap: 10px; align-items: flex-start; padding: 4px 6px; border-radius: 6px; }
.t-meta { display: flex; flex-direction: column; align-items: flex-end; padding-top: 3px; gap: 1px; }
.t-speaker { font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.06em; color: var(--ink-3); text-transform: uppercase; }
.t-speaker-cal { color: #9333ea; }
.t-ts { font-size: 10px; color: var(--ink-4); font-family: 'JetBrains Mono', monospace; }
.t-text { font-size: 13.5px; line-height: 1.55; color: var(--ink-1); }

.t-fail { background: var(--red-soft); position: relative; }
.t-fail::before { content: ""; position: absolute; left: 0; top: 4px; bottom: 4px; width: 2px; background: var(--red); border-radius: 2px; }

.t-footer {
  font-size: 12px; color: var(--ink-3); font-style: italic;
  padding: 8px 6px 4px; margin-top: 4px;
  border-top: 1px solid var(--border);
  display: flex; align-items: center; gap: 6px;
}

/* ── KPI Checks ── */
.kpi-checks { display: flex; flex-direction: column; gap: 10px; max-height: calc(100vh - 200px); overflow-y: auto; }
.panel-header-row { display: flex; align-items: center; gap: 8px; padding: 4px 0 6px; }
.kpi-summary { display: flex; gap: 4px; margin-left: auto; }
.kpi-pill { font-size: 11px; font-weight: 600; padding: 2px 9px; border-radius: 99px; display: inline-flex; align-items: center; gap: 4px; }
.kpi-pill-fail { color: #991b1b; background: var(--red-bg); border: 1px solid rgba(220,38,38,0.18); }
.kpi-pill-pass { color: #166534; background: var(--green-bg); border: 1px solid rgba(22,163,74,0.18); }
.kpi-pill-na { color: var(--ink-3); background: var(--surface-2); border: 1px solid var(--border); }

.kpi-check-list { display: flex; flex-direction: column; gap: 10px; }
.kpi-check-card { padding: 12px 14px; }
.kpi-check-fail { background: var(--red-soft); border-color: rgba(220,38,38,0.18); }
.kpi-check-na { background: var(--surface-2); }

.kpi-check-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
.kpi-check-name { font-weight: 600; font-size: 13.5px; flex: 1; line-height: 1.4; }
.kpi-check-right { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.kpi-score-num { font-size: 12px; font-weight: 700; color: var(--ink-3); }
.kpi-badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 99px; border: 1px solid; }
.kpi-badge-pass { color: #166534; background: var(--green-bg); border-color: #86efac; }
.kpi-badge-fail { color: #991b1b; background: var(--red-bg); border-color: #fca5a5; }
.kpi-badge-na { color: var(--ink-3); background: var(--surface-2); border-color: var(--border); }
.kpi-check-evidence { font-size: 12.5px; color: var(--ink-2); line-height: 1.55; }

/* ── Recommendations ── */
.recs-section { display: flex; flex-direction: column; gap: 14px; }
.below-section { display: flex; flex-direction: column; gap: 10px; }

.section-label { font-size: 13px; font-weight: 600; letter-spacing: -0.01em; color: var(--ink-1); display: flex; align-items: center; gap: 8px; margin-bottom: 0; }

.rec-category-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 6px 0 2px; }
.rec-category { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-3); }


/* Global */
.empty-state { text-align: center; padding: 48px 24px; color: var(--ink-2); font-size: 13px; line-height: 1.5; }
.text-muted { color: var(--ink-2); }

/* Badge (analysis status) */
.badge { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 4px; font-size: 11.5px; font-weight: 500; }
.badge-pass { background: var(--green-bg); color: #166534; }
.badge-fail { background: var(--red-bg); color: #991b1b; }
.badge-pending { background: #fef9c3; color: #854d0e; }
.badge-running { background: var(--blue-bg); color: var(--blue); }
.badge-skipped { background: var(--surface-3); color: var(--ink-3); }

@media (max-width: 900px) {
  .call-layout { grid-template-columns: 1fr; }
  .diff-row { grid-template-columns: 1fr 20px 1fr; }
}

/* ── AI Summary ── */
.call-summary-card { padding: 16px 20px; }
.call-summary-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.call-summary-text { font-size: 14px; color: var(--color-text); line-height: 1.65; margin: 0; }
.summary-source-tag { font-size: 11px; font-weight: 500; color: var(--ink-3); background: var(--surface-2); border: 1px solid var(--border); border-radius: 4px; padding: 2px 6px; }
</style>
