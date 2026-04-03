<script setup>
import { computed } from 'vue';
import ModList from './ModList.vue';

const props = defineProps({
  details: {
    type: Object,
    default: null
  },
  isLoading: {
    type: Boolean,
    default: false
  }
});

const frameworksDisplay = computed(() => {
  if (!props.details?.frameworks?.length) return 'None';
  return props.details.frameworks.map(f => f.charAt(0).toUpperCase() + f.slice(1)).join(', ');
});
</script>

<template>
  <div class="flex-1 p-6 overflow-auto bg-blue-50/40">
    <div v-if="isLoading" class="flex items-center justify-center h-full">
      <span class="text-gray-500">Loading...</span>
    </div>
    <div v-else-if="!details" class="flex items-center justify-center h-full">
      <span class="text-gray-400">Select a version</span>
    </div>
    <div v-else class="flex flex-col gap-6">
      <div class="flex flex-col gap-2">
        <div class="text-sm text-gray-500">Minecraft</div>
        <div class="text-xl font-medium text-gray-900">{{ details.minecraftVersion }}</div>
      </div>

      <div class="flex flex-col gap-2">
        <div class="text-sm text-gray-500">Frameworks</div>
        <div class="text-xl font-medium text-gray-900">{{ frameworksDisplay }}</div>
      </div>

      <div v-if="details.mods !== null" class="flex flex-col gap-2">
        <div class="text-sm text-gray-500">Mods</div>
        <ModList :mods="details.mods" />
      </div>
    </div>
  </div>
</template>
