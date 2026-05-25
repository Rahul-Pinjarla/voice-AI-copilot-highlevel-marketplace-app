<template>
  <div class="agent-detail">
    <div class="page-header">
      <div>
        <div class="crumb">
          <router-link to="/dashboard" class="crumb-back">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            Dashboard
          </router-link>
        </div>
        <h1 v-if="agent">{{ agent.name }}</h1>
      </div>
      <div v-if="versions.length > 1" class="version-pill-wrap">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><polyline points="12 7 12 12 15 14"/></svg>
        <span class="version-pill-label">{{ selectedVersionLabel }}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        <select v-model="selectedVersionId" class="version-select-overlay" @change="onVersionChange">
          <option :value="null">All versions</option>
          <option v-for="v in versions" :key="v.id" :value="v.id">
            v{{ v.version }} · {{ new Date(v.created_at * 1000).toLocaleDateString() }}
          </option>
        </select>
      </div>
    </div>

    <div v-if="loading" class="loading-row"><div class="spinner" /><span>Loading…</span></div>

    <template v-else-if="agent">
      <!-- Tabs -->
      <div class="tabs-row">
        <button :class="['tab', activeTab === 'performance' && 'is-active']" @click="activeTab = 'performance'">
          <svg class="tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="4"/><line x1="12" y1="20" x2="12" y2="10"/><line x1="6" y1="20" x2="6" y2="16"/></svg>
          Performance
        </button>
        <button :class="['tab', activeTab === 'calls' && 'is-active']" @click="activeTab = 'calls'">
          <svg class="tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          Calls
        </button>
        <button :class="['tab', activeTab === 'kpis' && 'is-active']" @click="activeTab = 'kpis'">
          <svg class="tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>
          Success Criteria
        </button>
        <button :class="['tab', activeTab === 'recs' && 'is-active']" @click="activeTab = 'recs'">
          <svg class="tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3"/><path d="M12 18v3"/><path d="M5 12H2"/><path d="M22 12h-3"/><path d="M6 6l1.5 1.5"/><path d="M16.5 16.5L18 18"/><path d="M6 18l1.5-1.5"/><path d="M16.5 7.5L18 6"/><circle cx="12" cy="12" r="3"/></svg>
          Recommendations
          <span v-if="pendingRecsCount" class="tab-badge">{{ pendingRecsCount }}</span>
        </button>
        <button :class="['tab', activeTab === 'actions' && 'is-active']" @click="activeTab = 'actions'">
          <svg class="tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          Action Items
          <span v-if="pendingUseActionsCount" class="tab-badge">{{ pendingUseActionsCount }}</span>
        </button>
        <button :class="['tab', activeTab === 'settings' && 'is-active']" @click="activeTab = 'settings'">
          <svg class="tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          Agent Settings
        </button>
      </div>

      <!-- ── KPIs Tab ── -->
      <div v-if="activeTab === 'kpis'" class="pane">
        <div class="card kpi-card-wrap">
          <div class="card-head">
            <div class="card-head-title">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>
              <span v-if="isHistoricalVersion">KPI snapshot · v{{ versions.find(v => v.id === selectedVersionId)?.version }}</span>
              <span v-else-if="agent.kpis.length">{{ agent.kpis.length }} KPIs · v{{ agent.kpi_version }}</span>
              <span v-else style="color:var(--ink-3)">No KPIs configured</span>
            </div>
            <div class="card-head-tools" v-if="!isHistoricalVersion">
              <button class="btn btn-secondary btn-sm" @click="showSuggestModal = true">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8L19 13"/><path d="M15 9h0"/><path d="M17.8 6.2L19 5"/><path d="M3 21l9-9"/><path d="M12.2 6.2L11 5"/></svg>
                Suggest from prompt
              </button>
              <button class="btn btn-primary btn-sm" @click="saveKpis" :disabled="savingKpis">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                {{ savingKpis ? 'Saving…' : 'Save KPIs' }}
              </button>
            </div>
          </div>

          <!-- Historical: read-only -->
          <template v-if="isHistoricalVersion">
            <div v-if="viewKpis.length === 0" class="empty-state"><p>No KPIs in this version snapshot.</p></div>
            <div v-else>
              <div v-for="(kpi, i) in viewKpis" :key="kpi.kpi_name" class="kpi-row">
                <div class="kpi-num">{{ String(i+1).padStart(2,'0') }}</div>
                <div class="kpi-body">
                  <div class="kpi-def">{{ kpi.definition || kpi.kpi_name }}</div>
                  <div class="kpi-meta">
                    <code class="kpi-slug">{{ kpi.kpi_name }}</code>
                    <span :class="['kpi-type', kpi.type === 'score' ? 'kpi-type--score' : 'kpi-type--binary']">
                      {{ kpi.type === 'score' ? `score ≥${kpi.threshold}/5` : 'binary' }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <!-- Current: editable -->
          <template v-else>
            <div v-if="editableKpis.length === 0" class="empty-state">
              <div class="empty-icon"><svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="4" y="4" width="20" height="20" rx="3"/><path d="M9 14h10M14 9v10"/></svg></div>
              <p>No KPIs configured. Add them manually or use "Suggest from prompt".</p>
            </div>
            <div v-else>
              <div v-for="(kpi, i) in editableKpis" :key="i" class="kpi-row" :class="{ 'kpi-row--editing': editingIndex === i }">
                <template v-if="editingIndex !== i">
                  <div class="kpi-num">{{ String(i+1).padStart(2,'0') }}</div>
                  <div class="kpi-body">
                    <div class="kpi-def">{{ kpi.definition || kpi.kpi_name }}</div>
                    <div class="kpi-meta">
                      <code class="kpi-slug">{{ kpi.kpi_name }}</code>
                      <span :class="['kpi-type', kpi.type === 'score' ? 'kpi-type--score' : 'kpi-type--binary']">
                        {{ kpi.type === 'score' ? `score ≥${kpi.threshold}/5` : 'binary' }}
                      </span>
                      <span v-if="statFor(kpi.kpi_name)" class="kpi-stat-row">
                        <span v-if="statFor(kpi.kpi_name)!.passed > 0" class="kpi-stat kpi-stat--pass">{{ statFor(kpi.kpi_name)!.passed }}/{{ statFor(kpi.kpi_name)!.total }} passed</span>
                        <span v-if="statFor(kpi.kpi_name)!.warn > 0" class="kpi-stat kpi-stat--warn">{{ statFor(kpi.kpi_name)!.warn }}/{{ statFor(kpi.kpi_name)!.total }} warn</span>
                        <span class="kpi-stat" :class="(statFor(kpi.kpi_name)!.total - statFor(kpi.kpi_name)!.passed) > 0 ? 'kpi-stat--fail' : 'kpi-stat--zero'">
                          <svg v-if="(statFor(kpi.kpi_name)!.total - statFor(kpi.kpi_name)!.passed) > 0" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                          {{ statFor(kpi.kpi_name)!.total - statFor(kpi.kpi_name)!.passed }}/{{ statFor(kpi.kpi_name)!.total }} failed
                        </span>
                      </span>
                    </div>
                  </div>
                  <div class="kpi-actions">
                    <button class="btn btn-secondary btn-sm" @click="editingIndex = i">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      Edit
                    </button>
                    <button class="btn btn-ghost btn-sm" @click="removeKpi(i)">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                      Remove
                    </button>
                  </div>
                </template>
                <template v-else>
                  <div class="kpi-num">{{ String(i+1).padStart(2,'0') }}</div>
                  <div class="kpi-edit-form">
                    <div class="kpi-edit-row">
                      <input v-model="kpi.kpi_name" placeholder="kpi_name (snake_case)" class="kpi-input kpi-input--name" />
                      <input v-model="kpi.definition" placeholder="Definition — one clear sentence" class="kpi-input kpi-input--def" />
                    </div>
                    <div class="kpi-type-row">
                      <span class="kpi-type-label">Type</span>
                      <button :class="['kpi-type-btn', kpi.type === 'binary' && 'active']" @click="() => { kpi.type = 'binary'; kpi.threshold = 1; }">binary</button>
                      <button :class="['kpi-type-btn', kpi.type === 'score' && 'active']" @click="() => { kpi.type = 'score'; if (kpi.threshold === 1) kpi.threshold = 3; }">score 1–5</button>
                      <template v-if="kpi.type === 'score'">
                        <span class="kpi-type-label">passing ≥</span>
                        <select v-model.number="kpi.threshold" class="kpi-threshold-select">
                          <option v-for="n in [2,3,4]" :key="n" :value="n">{{ n }}/5</option>
                        </select>
                      </template>
                      <button class="btn btn-primary btn-sm" style="margin-left: auto" @click="editingIndex = -1">Done</button>
                    </div>
                  </div>
                </template>
              </div>
            </div>
            <button class="kpi-add-btn" @click="addKpi">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add KPI
            </button>
          </template>
        </div>
      </div>

      <!-- ── Calls Tab ── -->
      <!-- ── Performance Tab ── -->
      <div v-if="activeTab === 'performance'" class="pane">
        <div v-if="calls.length === 0" class="card">
          <div class="empty-state">
            <div class="empty-icon"><svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.2"><line x1="14" y1="24" x2="14" y2="12"/><line x1="21" y1="24" x2="21" y2="5"/><line x1="7" y1="24" x2="7" y2="19"/></svg></div>
            <p>No calls yet — performance data will appear once calls are analysed.</p>
          </div>
        </div>
        <div v-else class="card perf-card">
          <div class="perf-head">
            <div class="perf-title">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>
              <span class="perf-label">PERFORMANCE</span>
              <span class="perf-sub">· KPI pass rate · last {{ perfWindow }} calls</span>
            </div>
            <div class="perf-window">
              <button v-for="w in ([10, 20, 30] as const)" :key="w" :class="['perf-w-btn', perfWindow === w && 'is-active']" @click="perfWindow = w">{{ w }}</button>
            </div>
          </div>
          <div class="perf-body">
            <div class="perf-stat">
              <div :class="['perf-pct', perfAvgClass]">{{ perfAvgPct }}</div>
              <div class="perf-stat-label">avg KPIs met</div>
              <div class="perf-stat-sub">across {{ perfScoredCount }} scored calls</div>
            </div>
            <div class="perf-legend">
              <span class="legend-item"><span class="legend-dot" style="background:#22c55e" />≥ 75% met</span>
              <span class="legend-item"><span class="legend-dot" style="background:#f59e0b" />25 – 74%</span>
              <span class="legend-item"><span class="legend-dot" style="background:#ef4444" />&lt; 25%</span>
              <span class="legend-item"><span class="legend-dot" style="background:#d1d5db" />n/a</span>
            </div>
          </div>
          <div class="perf-chart-wrap">
            <svg width="100%" :viewBox="`0 0 ${SVG_W} ${SVG_H}`" preserveAspectRatio="xMidYMid meet">
              <line v-for="p in [0, 0.25, 0.5, 0.75, 1]" :key="p"
                :x1="CHART_LEFT" :y1="CHART_TOP + CHART_H * (1 - p)"
                :x2="CHART_LEFT + CHART_AREA_W" :y2="CHART_TOP + CHART_H * (1 - p)"
                stroke="#e5e7eb" stroke-width="1" />
              <text v-for="[p, lbl] in [[1,'100%'],[0.75,'75%'],[0.5,'50%'],[0.25,'25%'],[0,'0']]" :key="lbl"
                :x="CHART_LEFT - 4" :y="CHART_TOP + CHART_H * (1 - (p as number)) + 4"
                class="chart-lbl" text-anchor="end">{{ lbl }}</text>
              <line :x1="CHART_LEFT" :y1="CHART_TOP + CHART_H * 0.25"
                    :x2="CHART_LEFT + CHART_AREA_W" :y2="CHART_TOP + CHART_H * 0.25"
                    stroke="#9ca3af" stroke-width="1" stroke-dasharray="5,3" />
              <text :x="CHART_LEFT + CHART_AREA_W + 5" :y="CHART_TOP + CHART_H * 0.25 + 4"
                    class="chart-lbl" text-anchor="start" fill="#9ca3af">target 75%</text>
              <g v-for="bar in barData" :key="bar.id">
                <rect :x="bar.x" :y="bar.y" :width="bar.w" :height="bar.h" :fill="bar.color" rx="2" />
                <text :x="bar.x + bar.w / 2" :y="CHART_TOP + CHART_H + 20"
                      class="chart-lbl" text-anchor="middle">{{ bar.label }}</text>
              </g>
            </svg>
          </div>
        </div>
      </div>

      <!-- ── Calls Tab ── -->
      <div v-if="activeTab === 'calls'" class="pane">
        <div class="card">
          <div class="calls-head">
            <div class="calls-head-title">
              <span class="calls-live-dot" />
              Recent Calls
              <span class="calls-sub">· {{ calls.length }} calls</span>
            </div>
            <div class="calls-head-tools">
              <div class="seg">
                <button :class="callFilter === 'all' && 'is-active'" @click="callFilter = 'all'">All</button>
                <button :class="callFilter === 'failing' && 'is-active'" @click="callFilter = 'failing'">Failing</button>
                <button :class="callFilter === 'flagged' && 'is-active'" @click="callFilter = 'flagged'">Flagged</button>
              </div>
              <button class="icon-btn" :disabled="backfillingCalls" :title="backfillingCalls ? 'Syncing…' : 'Backfill calls'" @click="triggerAgentBackfill">
                <span v-if="backfillingCalls" class="spinner spinner-sm" />
                <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              </button>
              <button class="icon-btn" title="Refresh" @click="refreshCalls">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/></svg>
              </button>
            </div>
          </div>

          <div v-if="calls.length === 0" class="empty-state">
            <div class="empty-icon"><svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M6 5a2 2 0 0 1 2-1.8h4.5l2 5.5L12 10.4a17 17 0 0 0 7.6 7.6l1.7-2.5 5.5 2V22a2 2 0 0 1-1.8 2C9.5 25 3 15.5 6 5z"/></svg></div>
            <p>No calls yet. Trigger a test call in GHL Voice AI, or backfill existing calls.</p>
          </div>

          <div v-else>
            <div v-for="call in filteredCalls" :key="call.id" class="call-row" @click="goToCall(call.id)">
              <div :class="['call-bar', callBarClass(call)]" />
              <div class="call-time">
                <span class="call-ago">{{ timeAgo(call.ingested_at) }}</span>
                <span class="call-dur">{{ fmtDuration(call.duration) }}</span>
              </div>
              <div class="call-main">
                <div class="call-top">
                  <span class="call-icon-wrap"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg></span>
                  <span class="call-number">{{ call.caller_number ?? 'Unknown call' }}</span>
                  <span :class="['call-badge', scoreBadgeClass(call)]">{{ scoreBadgeLabel(call) }}</span>
                </div>
                <div class="call-summary">{{ call.summary ?? '—' }}</div>
              </div>
              <div v-if="call.kpi_scores_json" :class="['call-met', kpiMetClass(call.kpi_scores_json)]">{{ kpiMetLabel(call.kpi_scores_json) }}</div>
              <button class="btn btn-secondary btn-sm open-btn" @click.stop="goToCall(call.id)">
                Open
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </button>
            </div>
            <div v-if="filteredCalls.length === 0" class="empty-state" style="padding: 24px 0">No calls match this filter.</div>
          </div>
        </div>
      </div>

      <!-- ── Action Items Tab ── -->
      <div v-if="activeTab === 'actions'" class="pane">
        <div v-if="useActionsLoading" class="loading-row"><div class="spinner" /><span>Loading action items…</span></div>
        <template v-else>
          <div v-if="agentUseActions.length === 0" class="empty-state card" style="padding:48px 24px">
            <div class="empty-icon">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
            <p>No pending action items. Flagged moments from calls will appear here.</p>
          </div>
          <template v-else>
            <div v-for="group in useActionsByVersion" :key="group.versionNum ?? 'none'">
              <div class="section-label">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><polyline points="12 7 12 12 15 14"/></svg>
                {{ group.versionNum != null ? `v${group.versionNum}` : 'Unversioned' }}
                <span class="section-label-hint">
                  {{ group.createdAt ? new Date(group.createdAt * 1000).toLocaleDateString() : '' }}
                  · {{ group.items.length }} item{{ group.items.length !== 1 ? 's' : '' }}
                </span>
              </div>
              <div v-for="ua in group.items" :key="ua.id" class="rec-card">
                <div class="rec-head">
                  <span :class="['rec-priority-pill', ua.action_required === 'human_followup' ? 'rec-priority-high' : 'rec-priority-medium']">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
                    {{ ua.action_required === 'human_followup' ? 'FOLLOW-UP' : 'RETRAIN' }}
                  </span>
                  <span v-if="ua.transcript_timestamp" class="rec-kpi">@ {{ ua.transcript_timestamp }}</span>
                </div>
                <div class="rec-action">{{ ua.reason }}</div>
                <div class="rec-foot">
                  <button class="btn btn-primary btn-sm" @click="handleUseAction(ua.id)">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    Mark handled
                  </button>
                  <button class="btn btn-ghost btn-sm" @click="router.push(`/calls/${ua.call_id}`)">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                    Open call
                  </button>
                </div>
              </div>
            </div>
          </template>
        </template>
      </div>

      <!-- ── Settings Tab ── -->
      <div v-if="activeTab === 'settings'" class="pane">
        <div class="card settings-card">
          <div class="settings-card-head">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            {{ isHistoricalVersion ? `Settings snapshot · v${versions.find(v => v.id === selectedVersionId)?.version}` : 'Live settings from GHL Voice AI' }}
            <span class="pill" style="margin-left:auto">read-only</span>
          </div>
          <div v-if="settingsLoading" class="loading-row"><div class="spinner" /><span>Fetching settings…</span></div>
          <div v-else-if="settingsError && !isHistoricalVersion" class="empty-state">
            <div class="empty-icon"><svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="14" cy="14" r="11"/><path d="M14 9v6M14 18v1"/></svg></div>
            <p>Could not reach GHL — check your connection.</p>
            <button class="btn btn-secondary btn-sm" @click="fetchSettings">Retry</button>
          </div>
          <div v-else-if="viewSettings" class="settings-body">
            <div class="settings-section">
              <div class="settings-section-title">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                Behaviour
              </div>
              <div class="kv"><div class="kv-k">Welcome message</div><div class="kv-v">{{ viewSettings!.welcomeMessage }}</div></div>
              <div class="kv"><div class="kv-k">Responsiveness</div><div class="kv-v kv-v--mono">{{ viewSettings!.responsiveness }}</div></div>
              <div class="kv"><div class="kv-k">Max call duration</div><div class="kv-v kv-v--mono">{{ viewSettings!.maxCallDuration }}s</div></div>
              <div class="kv"><div class="kv-k">Idle reminders</div><div class="kv-v"><span v-if="viewSettings!.sendUserIdleReminders">After {{ viewSettings!.reminderAfterIdleTimeSeconds }}s</span><span v-else class="text-muted">Disabled</span></div></div>
              <div class="kv"><div class="kv-k">Tool call strict mode</div><div class="kv-v"><span :class="['pill', viewSettings!.toolCallStrictMode ? 'pill-green' : '']">{{ viewSettings!.toolCallStrictMode ? 'On' : 'Off' }}</span></div></div>
              <div class="kv"><div class="kv-k">Translation</div><div class="kv-v"><span class="pill">{{ viewSettings!.translation.enabled ? 'Enabled' : 'Disabled' }}</span></div></div>
            </div>
            <div class="settings-section">
              <div class="settings-section-title">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                System prompt
              </div>
              <div class="prompt-block">{{ viewSettings!.agentPrompt }}</div>
            </div>
          </div>
          <div v-else class="empty-state">
            <p>No settings snapshot available for this version.</p>
          </div>
        </div>
      </div>

      <!-- ── Recommendations Tab ── -->
      <div v-if="activeTab === 'recs'" class="pane">
        <div v-if="recsLoading" class="loading-row"><div class="spinner" /><span>Loading recommendations…</span></div>
        <template v-else>
          <div v-if="agentRecs.length === 0" class="empty-state card" style="padding:48px 24px">
            <div class="empty-icon">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M12 3v3"/><path d="M12 18v3"/><path d="M5 12H2"/><path d="M22 12h-3"/><circle cx="12" cy="12" r="3"/></svg>
            </div>
            <p>No recommendations yet. Once calls are analysed, suggestions will appear here.</p>
          </div>
          <template v-else>
            <div class="section-label">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              Prompt changes
              <span class="section-label-hint">{{ pendingRecsCount }} pending · {{ appliedRecsCount }} applied</span>
              <div class="section-label-right" v-if="agentPrompt && pendingPromptRecs.length">
                <button class="btn btn-sm" @click="copyAllPromptRecs">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  Copy prompt with all changes
                </button>
              </div>
            </div>
            <div v-for="rec in agentRecs" :key="rec.id" class="rec-card">
              <div class="rec-head">
                <span :class="['rec-priority-pill', `rec-priority-${rec.priority}`]">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
                  {{ rec.priority.toUpperCase() }}
                </span>
                <span class="rec-kpi">{{ titleCase(rec.target_kpi_name) }}</span>
                <span class="rec-status" v-if="rec.status !== 'pending'">
                  <span :class="['pill', rec.status === 'applied' ? 'pill-green' : 'pill-muted']">
                    <svg v-if="rec.status === 'applied'" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    {{ rec.status }}
                  </span>
                </span>
              </div>
              <div class="rec-action">{{ rec.action }}</div>
              <div v-if="rec.suggested_change" class="rec-body">{{ rec.suggested_change }}</div>

              <div v-if="rec.agent_field && rec.current_value" class="rec-diff">
                <div class="diff-label">{{ rec.agent_field }}</div>
                <div class="diff-before">{{ rec.current_value }}</div>
                <div class="diff-arrow">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </div>
                <div class="diff-after">{{ rec.suggested_value }}</div>
              </div>

              <div class="rec-foot">
                <template v-if="rec.status === 'pending'">
                  <button class="btn btn-primary btn-sm" @click="applyRec(rec.id)">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    Apply
                  </button>
                  <button class="btn btn-ghost btn-sm" @click="dismissRec(rec.id)">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    Dismiss
                  </button>
                </template>
                <button v-if="agentPrompt" class="btn btn-sm" @click="copyUpdatedPrompt(rec)">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  Copy updated prompt
                </button>
                <button class="btn btn-ghost btn-sm" @click="router.push(`/calls/${rec.call_id}`)">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  Open call
                </button>
              </div>
            </div>
          </template>
        </template>
      </div>
    </template>

    <!-- ── KPI Suggest Modal ── -->
    <Teleport to="body">
      <div v-if="showSuggestModal" class="modal-backdrop" @click.self="showSuggestModal = false">
        <div class="modal card">
          <div class="modal-head">
            <h3>Suggest KPIs from System Prompt</h3>
            <button class="btn btn-ghost" @click="showSuggestModal = false">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="modal-body">
            <label class="field-label">Paste your agent's system prompt:</label>
            <textarea v-model="suggestPrompt" rows="6" placeholder="You are an appointment-setting assistant…" class="prompt-textarea" />
            <button class="btn btn-primary" :disabled="suggestLoading" @click="runSuggest">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3"/><path d="M12 18v3"/><path d="M5 12H2"/><path d="M22 12h-3"/><circle cx="12" cy="12" r="3"/></svg>
              {{ suggestLoading ? "Generating…" : "Suggest KPIs" }}
            </button>
            <div v-if="suggestedKpis.length > 0" class="suggested-kpis">
              <div v-for="kpi in suggestedKpis" :key="kpi.kpi_name" class="suggested-kpi">
                <label class="suggested-check">
                  <input type="checkbox" v-model="kpi.selected" />
                  <div>
                    <div class="suggested-name">
                      {{ kpi.kpi_name }}
                      <span :class="['kpi-type', kpi.type === 'score' ? 'kpi-type--score' : 'kpi-type--binary']">
                        {{ kpi.type === 'score' ? `score ≥${kpi.threshold}/5` : 'binary' }}
                      </span>
                    </div>
                    <div class="suggested-def text-muted">{{ kpi.definition }}</div>
                    <div class="suggested-rationale text-muted">{{ kpi.rationale }}</div>
                  </div>
                </label>
              </div>
              <button class="btn btn-primary" @click="applySuggestions">Add Selected KPIs</button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { AgentRecommendation, AgentUseAction, AgentVersion, AgentWithKpis, CallWithScore, GhlAgentSettings, KpiStat, VersionChange } from "@/lib/api";
import { api } from "@/lib/api";
import { usePolling } from "@/composables/usePolling";

const route = useRoute();
const router = useRouter();
const agentId = computed(() => route.params.id as string);

const loading = ref(true);
const agent = ref<AgentWithKpis | null>(null);
const calls = ref<CallWithScore[]>([]);
const kpiStats = ref<KpiStat[]>([]);
const versions = ref<AgentVersion[]>([]);
const selectedVersionId = ref<string | null>(null);
const activeTab = ref<"performance" | "calls" | "kpis" | "recs" | "actions" | "settings">("performance");
const editingIndex = ref(-1);
const callFilter = ref<"all" | "failing" | "flagged">("all");
const backfillingCalls = ref(false);
let backfillPollTimer: ReturnType<typeof setInterval> | null = null;

const agentSettings = ref<GhlAgentSettings | null>(null);
const settingsLoading = ref(false);
const settingsError = ref(false);
const editableKpis = ref<Array<{ kpi_name: string; definition: string; type: "binary" | "score"; threshold: number }>>([]);
const savingKpis = ref(false);
const showSuggestModal = ref(false);
const suggestPrompt = ref("");
const suggestLoading = ref(false);
const suggestedKpis = ref<Array<{ kpi_name: string; definition: string; rationale: string; type: "binary" | "score"; threshold: number; selected: boolean }>>([]);

const agentRecs = ref<AgentRecommendation[]>([]);
const recsLoading = ref(false);
const agentUseActions = ref<AgentUseAction[]>([]);
const useActionsLoading = ref(false);

async function loadAgent() {
  loading.value = true;
  agent.value = null;
  calls.value = [];
  kpiStats.value = [];
  versions.value = [];
  selectedVersionId.value = null;
  agentSettings.value = null;
  settingsError.value = false;
  activeTab.value = "performance";
  agent.value = await api.agents.get(agentId.value);
  editableKpis.value = agent.value.kpis.map((k) => ({ kpi_name: k.kpi_name, definition: k.definition, type: k.type ?? "binary", threshold: k.threshold ?? 1 }));
  loading.value = false;
  kpiStats.value = await api.agents.kpiStats(agentId.value);
  versions.value = await api.agents.versions(agentId.value);
  await refreshCalls();
  startPolling();
  fetchRecs();
  fetchUseActions();
}

onMounted(loadAgent);
watch(() => route.params.id, loadAgent);

const { start: startPolling, stop: stopPolling } = usePolling(refreshCalls, 10000);

async function fetchSettings() {
  settingsLoading.value = true;
  settingsError.value = false;
  try { agentSettings.value = await api.agents.settings(agentId.value); }
  catch { settingsError.value = true; }
  finally { settingsLoading.value = false; }
}

async function fetchRecs() {
  recsLoading.value = true;
  try { agentRecs.value = await api.agents.recommendations(agentId.value, selectedVersionId.value ?? undefined); }
  finally { recsLoading.value = false; }
}

async function fetchUseActions() {
  useActionsLoading.value = true;
  try { agentUseActions.value = await api.agents.useActions(agentId.value); }
  finally { useActionsLoading.value = false; }
}

watch(activeTab, async (tab) => {
  if (tab === "calls") { await refreshCalls(); startPolling(); }
  else stopPolling();
  if (tab === "settings" && !agentSettings.value && !isHistoricalVersion.value) await fetchSettings();
  if (tab === "recs") await fetchRecs();
  if (tab === "actions") await fetchUseActions();
});

// ── Calls ─────────────────────────────────────────────────────────────────────
async function refreshCalls() {
  const v = selectedVersionId.value;
  calls.value = await api.calls.listForAgent(agentId.value, v ?? undefined);
}

async function onVersionChange() {
  if (activeTab.value === "calls") await refreshCalls();
  else if (activeTab.value === "settings" && !isHistoricalVersion.value && !agentSettings.value) await fetchSettings();
  else if (activeTab.value === "recs") await fetchRecs();
}

const filteredCalls = computed(() => {
  if (callFilter.value === "failing") return calls.value.filter((c) => (c.overall_score ?? 1) < 0.6 && c.analysis_status === "done");
  if (callFilter.value === "flagged") return calls.value.filter((c) => {
    if (!c.kpi_scores_json) return false;
    const scores = JSON.parse(c.kpi_scores_json) as Array<{ passed: boolean }>;
    return scores.some((s) => !s.passed);
  });
  return calls.value;
});

async function triggerAgentBackfill() {
  if (backfillingCalls.value) return;
  backfillingCalls.value = true;
  try {
    await api.backfill.start();
    backfillPollTimer = setInterval(async () => {
      const { running } = await api.backfill.status();
      if (!running) {
        backfillingCalls.value = false;
        clearInterval(backfillPollTimer!);
        backfillPollTimer = null;
        await refreshCalls();
      }
    }, 2000);
  } catch { backfillingCalls.value = false; }
}

// ── KPIs ─────────────────────────────────────────────────────────────────────
async function saveKpis() {
  savingKpis.value = true;
  editingIndex.value = -1;
  try {
    await api.agents.updateKpis(agentId.value, editableKpis.value);
    agent.value = await api.agents.get(agentId.value);
    kpiStats.value = await api.agents.kpiStats(agentId.value);
  } finally { savingKpis.value = false; }
}

function addKpi() { editableKpis.value.push({ kpi_name: "", definition: "", type: "binary", threshold: 1 }); editingIndex.value = editableKpis.value.length - 1; }
function removeKpi(i: number) { editableKpis.value.splice(i, 1); if (editingIndex.value === i) editingIndex.value = -1; }

function statFor(kpiName: string): KpiStat | undefined {
  return kpiStats.value.find((s) => s.kpi_name === kpiName);
}

function formatStat(s: KpiStat): string {
  const failed = s.total - s.passed;
  const passRate = s.total > 0 ? Math.round((s.passed / s.total) * 100) : 0;
  if (passRate < 50) return `failing ${failed}/${s.total} — biggest gap`;
  if (failed === 0) return `${s.passed}/${s.total} in sample`;
  return `${s.passed} of ${s.total} calls passed · ${failed} missed`;
}

// ── Suggest modal ────────────────────────────────────────────────────────────
async function runSuggest() {
  suggestLoading.value = true;
  try { suggestedKpis.value = (await api.agents.suggestKpis(agentId.value, suggestPrompt.value)).map((k) => ({ ...k, type: k.type ?? "binary", threshold: k.threshold ?? 1, selected: true })); }
  finally { suggestLoading.value = false; }
}

function applySuggestions() {
  for (const kpi of suggestedKpis.value.filter((k) => k.selected)) {
    if (!editableKpis.value.find((e) => e.kpi_name === kpi.kpi_name))
      editableKpis.value.push({ kpi_name: kpi.kpi_name, definition: kpi.definition, type: kpi.type, threshold: kpi.threshold });
  }
  showSuggestModal.value = false;
  suggestedKpis.value = [];
}

// ── Recommendations ───────────────────────────────────────────────────────────
const pendingUseActionsCount = computed(() => agentUseActions.value.length);

const useActionsByVersion = computed(() => {
  const map = new Map<string, { versionNum: number | null; createdAt: number | null; items: AgentUseAction[] }>();
  for (const ua of agentUseActions.value) {
    const key = ua.agent_version_id ?? "__none__";
    if (!map.has(key)) map.set(key, { versionNum: ua.agent_version, createdAt: ua.version_created_at, items: [] });
    map.get(key)!.items.push(ua);
  }
  return [...map.values()].sort((a, b) => (b.versionNum ?? 0) - (a.versionNum ?? 0));
});

const pendingRecsCount = computed(() => agentRecs.value.filter(r => r.status === 'pending').length);
const appliedRecsCount = computed(() => agentRecs.value.filter(r => r.status === 'applied').length);
const pendingPromptRecs = computed(() => agentRecs.value.filter(r => r.target_type === 'prompt' && r.status === 'pending'));
const agentPrompt = computed(() => agentSettings.value?.agentPrompt ?? "");

async function applyRec(id: string) {
  await api.recommendations.apply(id);
  await fetchRecs();
}
async function dismissRec(id: string) {
  await api.recommendations.dismiss(id);
  await fetchRecs();
}
async function handleUseAction(id: string) {
  await api.recommendations.handleUseAction(id);
  await fetchUseActions();
}

function copyText(text: string) { navigator.clipboard.writeText(text).catch(() => {}); }

function copyUpdatedPrompt(rec: AgentRecommendation) {
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
  const combined = pendingPromptRecs.value.find((r) => r.combined_prompt)?.combined_prompt;
  if (combined) {
    copyText(combined);
    return;
  }
  const base = agentPrompt.value;
  const changes = pendingPromptRecs.value.map((r) => r.suggested_change ?? r.suggested_value ?? "").filter(Boolean);
  copyText(base ? `${base}\n\n---\nSuggested changes:\n${changes.map((c, i) => `${i + 1}. ${c}`).join("\n")}` : changes.join("\n"));
}

// ── Performance chart ────────────────────────────────────────────────────────
const perfWindow = ref<10 | 20 | 30>(10);
const SVG_W = 700;
const SVG_H = 190;
const CHART_LEFT = 42;
const CHART_TOP = 10;
const CHART_H = 140;
const CHART_AREA_W = SVG_W - CHART_LEFT - 68;

function callKpiRate(call: CallWithScore): number | null {
  if (call.analysis_status !== "done" || !call.kpi_scores_json) return null;
  const scores = parseKpiScores(call.kpi_scores_json);
  if (!scores.length) return null;
  return scores.filter((s) => s.passed).length / scores.length;
}

const perfCalls = computed(() => [...calls.value].slice(0, perfWindow.value).reverse());
const perfScoredCount = computed(() => perfCalls.value.filter((c) => callKpiRate(c) !== null).length);
const perfAvg = computed(() => {
  const rates = perfCalls.value.map(callKpiRate).filter((r): r is number => r !== null);
  if (!rates.length) return null;
  return rates.reduce((a, b) => a + b, 0) / rates.length;
});
const perfAvgPct = computed(() => (perfAvg.value !== null ? `${Math.round(perfAvg.value * 100)}%` : "—"));
const perfAvgClass = computed(() => {
  const v = perfAvg.value;
  if (v === null) return "";
  if (v >= 0.75) return "pct-green";
  if (v >= 0.25) return "pct-orange";
  return "pct-red";
});

const barData = computed(() => {
  const list = perfCalls.value;
  if (!list.length) return [];
  const slotW = CHART_AREA_W / list.length;
  const barW = Math.max(4, slotW * 0.65);
  const gap = slotW - barW;
  return list.map((call, i) => {
    const rate = callKpiRate(call);
    const h = rate !== null ? Math.max(3, rate * CHART_H) : 3;
    return {
      id: call.id,
      x: CHART_LEFT + i * slotW + gap / 2,
      y: CHART_TOP + CHART_H - h,
      w: barW,
      h,
      color: rate === null ? "#d1d5db" : rate >= 0.75 ? "#22c55e" : rate >= 0.25 ? "#f59e0b" : "#ef4444",
      label: timeAgo(call.ingested_at),
    };
  });
});

// ── Call display helpers ─────────────────────────────────────────────────────
function parseKpiScores(json: string): Array<{ kpi: string; passed: boolean }> {
  try { return JSON.parse(json); } catch { return []; }
}
function kpiMetLabel(json: string): string {
  const scores = parseKpiScores(json);
  if (!scores.length) return "";
  return `${scores.filter(s => s.passed).length}/${scores.length} met`;
}
function kpiMetClass(json: string): string {
  const scores = parseKpiScores(json);
  if (!scores.length) return "";
  const passed = scores.filter(s => s.passed).length;
  if (passed === scores.length) return "met-all";
  if (passed === 0) return "met-none";
  return "met-partial";
}
function callBarClass(call: CallWithScore): string {
  if (call.analysis_status !== "done" || call.overall_score === null) return "bar-mute";
  if (call.overall_score >= 0.6) return "bar-ok";
  if (call.overall_score >= 0.35) return "bar-warn";
  return "bar-fail";
}
function scoreBadgeClass(call: CallWithScore): string {
  if (call.analysis_status !== "done") return "badge-neutral";
  const scores = parseKpiScores(call.kpi_scores_json ?? "");
  if (!scores.length) return "badge-neutral";
  const passed = scores.filter((s) => s.passed).length;
  if (passed === scores.length) return "badge-pass";
  if (passed === 0) return "badge-fail";
  return "badge-warn";
}
function scoreBadgeLabel(call: CallWithScore): string {
  if (call.analysis_status !== "done") return call.analysis_status;
  const scores = parseKpiScores(call.kpi_scores_json ?? "");
  if (!scores.length) return "—";
  const passed = scores.filter((s) => s.passed).length;
  if (passed === scores.length) return "pass";
  if (passed === 0) return "fail";
  return "warn";
}
function timeAgo(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return "JUST NOW";
  if (diff < 3600) return `${Math.floor(diff / 60)}M`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}H`;
  return `${Math.floor(diff / 86400)}D`;
}
function fmtDuration(secs: number | null): string {
  if (!secs) return "—";
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}
function goToCall(id: string) { router.push(`/calls/${id}`); }
function titleCase(k: string) { return k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()); }

const viewKpis = computed(() => {
  if (!selectedVersionId.value) return editableKpis.value;
  const ver = versions.value.find(v => v.id === selectedVersionId.value);
  if (!ver) return editableKpis.value;
  try { return JSON.parse(ver.kpi_snapshot_json) as Array<{ kpi_name: string; definition: string; type: string; threshold: number }>; }
  catch { return editableKpis.value; }
});

const isHistoricalVersion = computed(() => !!selectedVersionId.value);
const selectedVersionLabel = computed(() => {
  if (!selectedVersionId.value) return "All versions";
  const v = versions.value.find((ver) => ver.id === selectedVersionId.value);
  return v ? `v${v.version} · ${new Date(v.created_at * 1000).toLocaleDateString()}` : "All versions";
});

const viewSettings = computed(() => {
  if (!selectedVersionId.value) return agentSettings.value;
  const ver = versions.value.find(v => v.id === selectedVersionId.value);
  if (!ver?.settings_snapshot_json) return agentSettings.value;
  try { return JSON.parse(ver.settings_snapshot_json) as GhlAgentSettings; } catch { return agentSettings.value; }
});
</script>

<style scoped>
.agent-detail { max-width: 960px; }

/* ── Page header ── */
.page-header { display: flex; align-items: flex-start; justify-content: space-between; padding: 24px 32px 0; }
.crumb { margin-bottom: 6px; }
.crumb-back { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 500; color: var(--ink-2); border-radius: 6px; padding: 4px 8px; text-decoration: none; }
.crumb-back:hover { background: var(--surface-2); color: var(--ink-1); }
h1 { font-size: 26px; font-weight: 700; letter-spacing: -0.02em; margin-top: 8px; }
.loading-row { display: flex; align-items: center; gap: 10px; color: var(--ink-3); padding: 40px 32px; }

/* ── Version pill ── */
.version-pill-wrap {
  position: relative;
  display: inline-flex; align-items: center; gap: 7px;
  border: 1px solid var(--border-strong);
  background: var(--surface);
  padding: 5px 10px;
  border-radius: 7px;
  font-size: 12.5px; font-weight: 500;
  color: var(--ink-2);
  margin-top: 8px;
  cursor: pointer;
}
.version-pill-wrap:hover { background: var(--surface-2); }
.version-pill-label { pointer-events: none; }
.version-select-overlay {
  position: absolute; inset: 0; width: 100%; height: 100%;
  opacity: 0; cursor: pointer;
}

/* ── Tabs ── */
.tabs-row {
  display: flex; gap: 4px;
  border-bottom: 1px solid var(--border);
  padding: 0 32px;
  background: var(--bg);
  margin-top: 16px;
}
.tab {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 12px 14px;
  border: none; background: none;
  font-family: inherit; font-size: 13.5px; font-weight: 500;
  color: var(--ink-2); cursor: pointer;
  position: relative; white-space: nowrap;
}
.tab:hover { color: var(--ink-1); }
.tab.is-active { color: var(--ink-1); font-weight: 600; }
.tab.is-active::after {
  content: "";
  position: absolute; left: 8px; right: 8px; bottom: -1px;
  height: 2px; background: var(--ink-1);
  border-radius: 2px 2px 0 0;
}
.tab-ico { width: 14px; height: 14px; flex-shrink: 0; }
.tab-badge {
  font-size: 10px; font-weight: 700;
  background: var(--red-bg); color: var(--red);
  padding: 1px 6px; border-radius: 99px;
}

/* ── Pane (shared content area) ── */
.pane { padding: 16px 32px 40px; display: flex; flex-direction: column; gap: 22px; }

/* ── Section labels ── */
.section-label { font-size: 13px; font-weight: 600; letter-spacing: -0.01em; color: var(--ink-1); display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.section-label-hint { font-weight: 400; color: var(--ink-3); font-size: 12px; }
.section-label-right { margin-left: auto; display: flex; gap: 6px; align-items: center; }

/* ── Card header ── */
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow-sm); }
.card-head {
  padding: 12px 16px; border-bottom: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
}
.card-head-title { display: flex; align-items: center; gap: 7px; font-size: 13px; color: var(--ink-2); font-weight: 500; }
.card-head-tools { display: flex; gap: 6px; }

/* ── KPIs ── */
.kpi-card-wrap { overflow: hidden; }
.kpi-row {
  display: grid; grid-template-columns: 36px 1fr auto;
  gap: 14px; padding: 14px 16px;
  border-bottom: 1px solid var(--border); align-items: flex-start;
}
.kpi-row:last-child { border-bottom: none; }
.kpi-row--editing { background: var(--surface-2); }

.kpi-num {
  width: 30px; height: 30px; border-radius: 8px;
  background: var(--surface-2); color: var(--ink-2);
  display: inline-flex; align-items: center; justify-content: center;
  font-weight: 600; font-size: 13px;
  font-family: 'JetBrains Mono', monospace;
}
.kpi-body { min-width: 0; }
.kpi-def { font-size: 13.5px; font-weight: 500; line-height: 1.5; color: var(--ink-1); margin-bottom: 6px; }
.kpi-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.kpi-slug { font-family: 'JetBrains Mono', monospace; font-size: 11px; padding: 2px 8px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 5px; color: var(--ink-2); }
.kpi-type { font-size: 11px; padding: 2px 8px; border-radius: 5px; font-weight: 500; }
.kpi-type--binary { background: #f1f5f9; color: #475569; }
.kpi-type--score { background: #ede9fe; color: #5b21b6; }
.kpi-stat-row { display: inline-flex; align-items: center; gap: 6px; }
.kpi-stat { font-size: 11.5px; font-weight: 500; display: inline-flex; align-items: center; gap: 3px; padding: 1px 7px; border-radius: 99px; border: 1px solid; }
.kpi-stat--pass { background: var(--green-bg); color: #047857; border-color: rgba(22,163,74,0.2); }
.kpi-stat--warn { background: var(--yellow-bg, #fefce8); color: #92400e; border-color: rgba(234,179,8,0.25); }
.kpi-stat--fail { background: var(--red-bg); color: var(--red); border-color: rgba(220,38,38,0.2); }
.kpi-stat--zero { background: var(--surface-2); color: var(--ink-3); border-color: var(--border); }
.kpi-actions { display: flex; gap: 6px; }

.kpi-edit-form { display: flex; flex-direction: column; gap: 8px; grid-column: 2 / -1; }
.kpi-edit-row { display: flex; align-items: center; gap: 8px; }
.kpi-input { padding: 6px 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px; font-family: inherit; background: var(--surface); color: var(--ink-1); }
.kpi-input:focus { outline: none; border-color: var(--ink-1); }
.kpi-input--name { width: 200px; }
.kpi-input--def { flex: 1; }
.kpi-type-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.kpi-type-label { font-size: 12px; color: var(--ink-3); font-weight: 500; }
.kpi-type-btn { padding: 4px 12px; border: 1px solid var(--border); border-radius: 20px; font-size: 12px; font-weight: 500; cursor: pointer; background: var(--surface); color: var(--ink-3); font-family: inherit; }
.kpi-type-btn.active { border-color: #6d28d9; background: #ede9fe; color: #6d28d9; }
.kpi-threshold-select { padding: 3px 8px; border: 1px solid var(--border); border-radius: 6px; font-size: 12px; background: var(--surface); cursor: pointer; font-family: inherit; }

.kpi-add-btn {
  border: 1px dashed var(--border-strong); background: var(--surface);
  padding: 12px 16px; text-align: center; font-size: 13px; font-weight: 500;
  color: var(--ink-2); cursor: pointer; border-radius: 0 0 10px 10px;
  display: flex; align-items: center; justify-content: center; gap: 6px;
  width: 100%;
}
.kpi-add-btn:hover { background: var(--surface-2); color: var(--ink-1); }

/* ── Calls ── */
/* ── Performance chart ── */
.perf-card { padding: 0; overflow: hidden; margin-bottom: 12px; }
.perf-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px 10px; border-bottom: 1px solid var(--border); }
.perf-title { display: flex; align-items: center; gap: 7px; }
.perf-label { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-2); }
.perf-sub { font-size: 11.5px; color: var(--ink-3); }
.perf-window { display: flex; gap: 2px; }
.perf-w-btn { padding: 2px 8px; font-size: 12px; border: 1px solid var(--border); background: transparent; color: var(--ink-3); border-radius: 4px; cursor: pointer; }
.perf-w-btn.is-active { background: var(--ink-1); color: #fff; border-color: var(--ink-1); }
.perf-body { display: flex; align-items: flex-start; justify-content: space-between; padding: 14px 18px 6px; }
.perf-stat { }
.perf-pct { font-size: 36px; font-weight: 700; line-height: 1; }
.pct-green { color: #16a34a; }
.pct-orange { color: #d97706; }
.pct-red { color: #dc2626; }
.perf-stat-label { font-size: 12.5px; color: var(--ink-2); margin-top: 4px; }
.perf-stat-sub { font-size: 11px; color: var(--ink-3); margin-top: 1px; }
.perf-legend { display: grid; grid-template-columns: auto auto; gap: 4px 16px; padding-top: 4px; }
.legend-item { display: flex; align-items: center; gap: 5px; font-size: 11.5px; color: var(--ink-2); }
.legend-dot { width: 9px; height: 9px; border-radius: 2px; flex-shrink: 0; }
.perf-chart-wrap { padding: 0 18px 14px; }
.chart-lbl { font-size: 10px; fill: var(--ink-3); font-family: inherit; }

.calls-head {
  display: flex; align-items: center;
  padding: 12px 16px; border-bottom: 1px solid var(--border);
}
.calls-head-title { display: flex; align-items: center; gap: 8px; font-size: 11.5px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-2); }
.calls-live-dot {
  width: 6px; height: 6px; border-radius: 50%; background: var(--green); flex-shrink: 0;
  box-shadow: 0 0 0 0 rgba(22,163,74,0.4);
  animation: live-pulse 2s ease-in-out infinite;
}
@keyframes live-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(22,163,74,0.4); } 50% { box-shadow: 0 0 0 5px rgba(22,163,74,0); } }
.calls-sub { font-weight: 500; text-transform: none; letter-spacing: 0; color: var(--ink-3); font-size: 12px; }
.calls-head-tools { margin-left: auto; display: flex; gap: 6px; align-items: center; }

.seg { display: inline-flex; background: var(--surface); border: 1px solid var(--border-strong); padding: 2px; border-radius: 8px; gap: 1px; }
.seg button {
  appearance: none; background: transparent; border: 0;
  font-family: inherit; font-size: 12px; font-weight: 600;
  letter-spacing: 0.04em; text-transform: uppercase;
  color: var(--ink-3); padding: 4px 10px; border-radius: 6px; cursor: pointer;
}
.seg button.is-active { background: var(--ink-1); color: #fff; }

.icon-btn {
  width: 30px; height: 30px;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--border-strong); border-radius: 7px;
  background: var(--surface); color: var(--ink-2);
  cursor: pointer; flex-shrink: 0;
}
.icon-btn:hover:not(:disabled) { background: var(--surface-2); color: var(--ink-1); }
.icon-btn:disabled { opacity: .45; cursor: not-allowed; }

.call-row {
  display: grid; grid-template-columns: 4px 70px 1fr 80px auto;
  gap: 14px; padding: 14px 16px;
  border-bottom: 1px solid var(--border); align-items: center;
  cursor: pointer; transition: background 0.1s;
}
.call-row:last-child { border-bottom: none; }
.call-row:hover { background: var(--surface-2); }

.call-bar { width: 3px; height: 100%; border-radius: 2px; min-height: 40px; }
.bar-fail { background: var(--red); }
.bar-warn { background: var(--amber); }
.bar-ok { background: var(--green); }
.bar-mute { background: var(--surface-3); }

.call-time { display: flex; flex-direction: column; gap: 2px; font-family: 'JetBrains Mono', monospace; }
.call-ago { font-size: 13px; font-weight: 600; color: var(--ink-1); }
.call-dur { font-size: 11.5px; color: var(--ink-3); }

.call-main { min-width: 0; }
.call-top { display: flex; align-items: center; gap: 8px; margin-bottom: 3px; }
.call-icon-wrap { width: 22px; height: 22px; border-radius: 6px; background: var(--surface-2); color: var(--ink-2); display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.call-number { font-weight: 600; font-size: 13.5px; }
.call-summary { font-size: 12.5px; color: var(--ink-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.call-badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 99px; border: 1.5px solid; }
.badge-pass { color: #166534; border-color: #86efac; background: #f0fdf4; }
.badge-warn { color: #92400e; border-color: #fcd34d; background: #fffbeb; }
.badge-fail { color: #991b1b; border-color: #fca5a5; background: #fff1f2; }
.badge-neutral { color: var(--ink-3); border-color: var(--border); background: var(--surface-2); }

.call-met { font-size: 13px; font-weight: 600; text-align: right; }
.met-all { color: var(--green); }
.met-partial { color: var(--amber); }
.met-none { color: var(--red); }
.open-btn { flex-shrink: 0; }

/* ── Settings ── */
.settings-card { overflow: hidden; }
.settings-card-head {
  padding: 12px 16px; border-bottom: 1px solid var(--border);
  display: flex; align-items: center; gap: 8px;
  font-size: 12.5px; color: var(--ink-2); font-weight: 500;
}
.settings-body {}
.settings-section { padding: 14px 16px; border-bottom: 1px solid var(--border); }
.settings-section:last-child { border-bottom: none; }
.settings-section-title { font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-3); margin-bottom: 10px; display: flex; align-items: center; gap: 6px; }
.kv { display: grid; grid-template-columns: 200px 1fr; gap: 16px; padding: 6px 0; font-size: 13px; }
.kv-k { color: var(--ink-3); }
.kv-v { color: var(--ink-1); }
.kv-v--mono { font-family: 'JetBrains Mono', monospace; font-size: 12px; }
.prompt-block { background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; font-family: 'JetBrains Mono', monospace; font-size: 12px; line-height: 1.65; max-height: 280px; overflow-y: auto; white-space: pre-wrap; color: var(--ink-1); }

/* Pills */
.pill { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; font-weight: 500; padding: 2px 9px; border-radius: 99px; background: var(--surface-3); color: var(--ink-2); border: 1px solid var(--border); white-space: nowrap; }
.pill-green { background: var(--green-bg); color: #047857; border-color: rgba(22,163,74,0.18); }
.pill-muted { background: var(--surface-2); color: var(--ink-3); border-color: var(--border); }

/* ── Recommendations ── */
.rec-card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 10px; padding: 16px 18px;
  display: flex; flex-direction: column; gap: 12px;
}
.rec-head { display: flex; align-items: center; gap: 10px; }
.rec-priority-pill { display: inline-flex; align-items: center; gap: 5px; font-size: 10.5px; font-weight: 700; letter-spacing: 0.06em; padding: 2px 9px; border-radius: 99px; }
.rec-priority-high { background: var(--red-bg); color: var(--red); border: 1px solid rgba(220,38,38,0.18); }
.rec-priority-medium { background: var(--amber-bg); color: var(--amber); border: 1px solid rgba(217,119,6,0.18); }
.rec-priority-low { background: var(--surface-3); color: var(--ink-3); border: 1px solid var(--border); }
.rec-kpi { font-weight: 600; font-size: 13.5px; flex: 1; }
.rec-status { margin-left: auto; }
.rec-action { font-weight: 600; font-size: 14px; line-height: 1.5; color: var(--ink-1); }
.rec-body { font-size: 13px; line-height: 1.6; color: var(--ink-2); background: var(--surface-2); padding: 12px 14px; border-radius: 8px; }

.rec-diff { display: grid; grid-template-columns: 80px 1fr 24px 1fr; gap: 10px; align-items: center; }
.diff-label { font-family: 'JetBrains Mono', monospace; font-size: 11.5px; color: var(--ink-3); }
.diff-before { padding: 9px 11px; border-radius: 8px; font-size: 12.5px; line-height: 1.55; background: var(--red-soft); color: #991b1b; border: 1px solid rgba(220,38,38,0.18); }
.diff-after { padding: 9px 11px; border-radius: 8px; font-size: 12.5px; line-height: 1.55; background: var(--green-soft); color: #14532d; border: 1px solid rgba(22,163,74,0.18); }
.diff-arrow { display: flex; align-items: center; justify-content: center; color: var(--ink-3); }
.rec-foot { display: flex; gap: 8px; padding-top: 4px; flex-wrap: wrap; }

/* ── Modal ── */
.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { width: 560px; max-height: 80vh; overflow-y: auto; }
.modal-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border); }
.modal-head h3 { font-size: 16px; font-weight: 600; }
.modal-body { padding: 20px; display: flex; flex-direction: column; gap: 12px; }
.field-label { font-size: 13px; font-weight: 500; }
.prompt-textarea { width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px; resize: vertical; font-family: inherit; }
.prompt-textarea:focus { outline: none; border-color: var(--ink-1); }
.suggested-kpis { display: flex; flex-direction: column; gap: 10px; }
.suggested-kpi { border: 1px solid var(--border); border-radius: 6px; padding: 10px; }
.suggested-check { display: flex; align-items: flex-start; gap: 10px; cursor: pointer; }
.suggested-name { font-weight: 500; font-size: 13px; font-family: monospace; display: flex; align-items: center; gap: 6px; }
.suggested-def, .suggested-rationale { font-size: 12px; color: var(--ink-2); }

.empty-state { text-align: center; padding: 48px 24px; color: var(--ink-2); font-size: 13px; line-height: 1.5; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.empty-icon { color: var(--ink-3); }
.text-muted { color: var(--ink-2); }
</style>
