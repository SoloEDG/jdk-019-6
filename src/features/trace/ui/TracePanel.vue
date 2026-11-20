<script setup lang="ts">
import { ref, watch } from "vue";
import { trace } from "../model/state";
import { cancel, close, loadFile, run, scheduleRun } from "../model/run";
import { confirmTrace } from "../model/confirm";

const file = ref<HTMLInputElement>();

watch(() => trace.params, scheduleRun, { deep: true });

function pick(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) loadFile(f);
  (e.target as HTMLInputElement).value = "";
}

function paletteReset() {
  trace.params.ignored = [];
  trace.params.ignoreAuto = true;
}

const isOff = (i: number) =>
  (i === trace.background && trace.params.ignoreAuto) ||
  trace.params.ignored.includes(i);

function toggle(i: number) {
  if (isOff(i)) {
    trace.params.ignored = trace.params.ignored.filter((x) => x !== i);
    if (i === trace.background) trace.params.ignoreAuto = false;
  } else if (i === trace.background) {
    trace.params.ignoreAuto = true;
  } else if (!trace.params.ignored.includes(i)) {
    trace.params.ignored.push(i);
  }
}
</script>

<template>
  <div class="trace-panel" v-if="trace.open">
    <h3>
      Trace bitmap
      <span>{{ trace.status }}</span>
      <button class="x" title="Close" @click="close">✕</button>
    </h3>

    <input ref="file" type="file" accept="image/*" hidden @change="pick" />
    <button class="drop" data-testid="trace-file" @click="file?.click()">
      {{ trace.image ? "↻ " + trace.fileName : "⇪ Choose a logo image…" }}
    </button>
    <img v-if="trace.imageUrl" class="thumb" :src="trace.imageUrl" alt="" />
    <p v-if="trace.scaled" class="note">Large image — traced at 2400 px.</p>

    <template v-if="trace.image">
      <label
        >Colors <b>{{ trace.params.colors }}</b
        ><input
          type="range"
          min="2"
          max="8"
          step="1"
          v-model.number="trace.params.colors"
          @change="paletteReset"
      /></label>
      <label
        >Denoise <b>{{ trace.params.denoise }} px</b
        ><input type="range" min="0" max="3" step="1" v-model.number="trace.params.denoise"
      /></label>
      <label
        >Precision <b>{{ trace.params.precision.toFixed(1) }} px</b
        ><input
          type="range"
          min="0.2"
          max="3"
          step="0.1"
          v-model.number="trace.params.precision"
        /><small>error budget — lower keeps more detail, costs more nodes</small></label
      >
      <label
        >Keep details ≥ <b>{{ trace.params.minArea }} px²</b
        ><input type="range" min="0" max="200" step="1" v-model.number="trace.params.minArea"
        /><small>specks and holes smaller than this are dropped</small></label
      >
      <label
        >Corners <b>{{ trace.params.corner }}°</b
        ><input type="range" min="20" max="120" step="1" v-model.number="trace.params.corner"
        /><small>turns sharper than this stay sharp corner nodes</small></label
      >

      <div class="palette" v-if="trace.palette.length">
        <button
          v-for="(c, i) in trace.palette"
          :key="i"
          class="sw"
          :class="{ off: isOff(i) }"
          :style="{ background: c }"
          :title="isOff(i) ? 'Background — click to trace it' : 'Traced — click to treat as background'"
          @click="toggle(i)"
        >
          {{ isOff(i) ? "✕" : "" }}
        </button>
      </div>

      <div class="busy" v-if="trace.status === 'busy'">
        <div class="bar"><i :style="{ width: Math.round(trace.progress * 100) + '%' }"></i></div>
        <p>
          {{ trace.stage }}… <button @click="cancel">Cancel</button>
        </p>
      </div>
      <p class="note" v-else-if="trace.status === 'ready'">{{ trace.stats }}</p>
      <p class="note err" v-else-if="trace.status === 'error'">{{ trace.error }}</p>

      <div class="row">
        <button @click="run" :disabled="trace.status === 'busy'">Retrace</button>
        <button
          class="primary"
          data-testid="trace-confirm"
          :disabled="!trace.shapes.length || trace.status === 'busy'"
          @click="confirmTrace"
        >
          Add layers ✓
        </button>
      </div>
    </template>
    <p class="note" v-else>
      Two-color logos work best. The preview renders on the artboard while you
      tune — confirming creates real curve paths, nothing is embedded.
    </p>
  </div>
</template>
