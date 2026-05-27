<template>
  <div class="kpi-row">
    <div class="kpi-num">{{ String(index + 1).padStart(2, '0') }}</div>
    <div class="kpi-body">
      <div class="kpi-def">{{ kpi.definition || kpi.kpi_name }}</div>
      <div class="kpi-meta">
        <code class="kpi-slug">{{ kpi.kpi_name }}</code>
        <span :class="['kpi-type', kpi.type === 'score' ? 'kpi-type--score' : 'kpi-type--binary']">
          {{ kpi.type === 'score' ? `score ≥${kpi.threshold}` : 'binary' }}
        </span>
        <span v-if="stat" class="kpi-stat-row">
          <span v-if="stat.passed > 0" class="kpi-stat kpi-stat--pass">{{ stat.passed }}/{{ stat.total }} passed</span>
          <span v-if="stat.warn > 0" class="kpi-stat kpi-stat--warn">{{ stat.warn }}/{{ stat.total }} warn</span>
          <span class="kpi-stat" :class="failed > 0 ? 'kpi-stat--fail' : 'kpi-stat--zero'">
            {{ failed }}/{{ stat.total }} failed
          </span>
        </span>
      </div>
    </div>
    <div v-if="$slots.default" class="kpi-actions">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { KpiStat } from "@/lib/api";

interface Kpi {
  kpi_name: string;
  definition: string;
  type: string;
  threshold: number;
}

const props = defineProps<{
  index: number;
  kpi: Kpi;
  stat?: KpiStat;
}>();

const failed = computed(() =>
  props.stat ? props.stat.total - props.stat.passed - props.stat.warn : 0,
);
</script>

<style scoped>
.kpi-row {
  display: grid; grid-template-columns: 36px 1fr auto;
  gap: 14px; padding: 14px 16px;
  border-bottom: 1px solid var(--border); align-items: flex-start;
}
.kpi-row:last-child { border-bottom: none; }
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
.kpi-actions { display: flex; gap: 6px; align-items: flex-start; padding-top: 2px; }
</style>
