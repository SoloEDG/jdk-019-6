<script setup lang="ts">
import { doc } from "../../../shared/document";
import { trace } from "../../trace/model/state";
import { scheduleRun } from "../../trace/model/run";
function toggleTrace() {
  trace.open = !trace.open;
  // reopening with an image but no preview: trace again
  if (trace.open && trace.image && !trace.shapes.length) scheduleRun();
}
</script>
<template>
  <nav>
    <button
      v-for="(icon, t) in { select: '↖', pen: '✒', nodes: '◇' }"
      :class="{ active: doc.tool === t }"
      @click="doc.tool = t"
      :data-testid="'tool-' + t"
    >
      {{ icon }}<small>{{ t }}</small>
    </button>
    <button
      :class="{ active: trace.open }"
      data-testid="tool-trace"
      @click="toggleTrace"
    >
      ▦<small>trace</small>
    </button>
  </nav>
</template>
