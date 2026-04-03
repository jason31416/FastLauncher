<script setup>
import { ArrowLeft } from 'lucide-vue-next';
import { useRouter } from 'vue-router';

defineProps({
  versions: {
    type: Array,
    default: () => []
  },
  selectedId: {
    type: String,
    default: null
  },
  isLoading: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['select']);
const router = useRouter();

function handleSelect(versionId) {
  emit('select', versionId);
}

function goBack() {
  router.push('/home');
}
</script>

<template>
  <div class="w-64 border-r border-gray-200 flex flex-col bg-white">
    <div class="p-4 border-b border-gray-200 flex items-center gap-2">
      <button
        @click="goBack"
        class="p-1.5 rounded hover:bg-blue-50 transition-colors text-gray-500 hover:text-blue-500"
      >
        <ArrowLeft :size="18" />
      </button>
      <h2 class="text-sm font-semibold text-gray-700">Installed Versions</h2>
    </div>

    <div class="flex-1 overflow-y-auto p-2">
      <div v-if="isLoading" class="p-4 text-center text-gray-500 text-sm">
        Loading...
      </div>
      <div v-else-if="versions.length === 0" class="p-4 text-center text-gray-400 text-sm">
        No versions installed
      </div>
      <div v-else class="flex flex-col gap-1">
        <button
          v-for="version in versions"
          :key="version.id"
          @click="handleSelect(version.id)"
          class="w-full px-3 py-2 text-base text-left rounded transition-colors flex items-center gap-2"
          :class="[
            version.id === selectedId
              ? 'bg-blue-50 text-blue-600 font-medium'
              : 'text-gray-700 hover:bg-blue-50/70'
          ]"
        >
          <span
            class="w-2 h-2 rounded-full"
            :class="version.id === selectedId ? 'bg-blue-500' : 'bg-gray-300'"
          ></span>
          {{ version.name }}
        </button>
      </div>
    </div>
  </div>
</template>
