import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useLauncherStore = defineStore('launcher', () => {
  const state = ref('idle');
  const message = ref('');
  const username = ref('');
  const versionInfo = ref(null);
  const profile = ref(null);
  const error = ref(null);
  
  const progress = ref({
    completed: 0,
    total: 0,
    downloadedSize: 0,
    totalSize: 0,
    currentFile: '',
    speed: 0
  });
  
  const currentFile = ref('');
  const retryInfo = ref(null);
  const workerStatus = ref(Array.from({ length: 32 }, () => ({ fileId: null, path: '' })));

  const completenessFlag = ref(true);
  
  const isDownloading = computed(() => state.value === 'downloading');
  const isReady = computed(() => state.value === 'ready');
  const isPlaying = computed(() => state.value === 'playing');
  const hasError = computed(() => state.value === 'error');
  
  const progressPercent = computed(() => {
    if (progress.value.total === 0) return 0;
    return Math.round((progress.value.completed / progress.value.total) * 100);
  });
  
  const downloadedMB = computed(() => {
    return (progress.value.downloadedSize / 1024 / 1024).toFixed(2);
  });
  
  const totalMB = computed(() => {
    return (progress.value.totalSize / 1024 / 1024).toFixed(2);
  });
  
  function setState(newState, newMessage) {
    state.value = newState;
    message.value = newMessage || '';
  }
  
  function setVersionInfo(info) {
    versionInfo.value = info;
  }
  
  function setProfile(p) {
    profile.value = p;
  }
  
  function setError(err) {
    error.value = err;
  }
  
  function updateProgress(p) {
    progress.value = { ...progress.value, ...p };
  }

  function setCompleteness(completeness) {
    completenessFlag.value = completeness;
  }
  
  function setCurrentFile(file) {
    currentFile.value = file;
  }
  
  function setRetryInfo(info) {
    retryInfo.value = info;
  }

  function updateWorkerStatus(workerId, data) {
    const newStatus = [...workerStatus.value];
    newStatus[workerId] = { fileId: data.id, path: data.path };
    workerStatus.value = newStatus;
  }

  function clearWorkerStatus(workerId) {
    const newStatus = [...workerStatus.value];
    newStatus[workerId] = { fileId: null, path: '' };
    workerStatus.value = newStatus;
  }
  
  function reset() {
    state.value = 'idle';
    message.value = '';
    error.value = null;
    progress.value = {
      completed: 0,
      total: 0,
      downloadedSize: 0,
      totalSize: 0,
      currentFile: '',
      speed: 0
    };
    currentFile.value = '';
    retryInfo.value = null;
    workerStatus.value = Array.from({ length: 32 }, () => ({ fileId: null, path: '' }));
  }
  
  return {
    state,
    message,
    username,
    versionInfo,
    profile,
    error,
    progress,
    currentFile,
    retryInfo,
    workerStatus,
    updateWorkerStatus,
    clearWorkerStatus,
    completenessFlag,
    setCompleteness,
    isDownloading,
    isReady,
    isPlaying,
    hasError,
    progressPercent,
    downloadedMB,
    totalMB,
    setState,
    setVersionInfo,
    setProfile,
    setError,
    updateProgress,
    setCurrentFile,
    setRetryInfo,
    reset
  };
});
