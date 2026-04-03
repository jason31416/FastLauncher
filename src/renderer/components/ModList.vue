<script setup>
defineProps({
  mods: {
    type: Array,
    default: () => []
  }
});
</script>

<template>
  <div class="flex flex-col gap-1">
    <div
      v-for="mod in mods"
      :key="mod.id"
      class="px-3 py-2 text-sm text-gray-700 bg-blue-50/50 rounded hover:bg-blue-100 transition-colors"
    >
      <span class="font-medium text-base">{{ mod.name }}</span>
      <span class="text-gray-400 ml-2">v{{ mod.version }}</span>
    </div>
    <div
      v-if="mods.length === 0"
      class="px-3 py-2 text-sm text-gray-400 italic"
    >
      No mods installed
    </div>
  </div>
</template>
