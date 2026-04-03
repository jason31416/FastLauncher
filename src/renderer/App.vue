<script setup>
import { onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useLauncherStore } from './stores/launcher.js';
import TitleBar from './components/TitleBar.vue';
import { stateToRouteMap } from './router/index.js';

const store = useLauncherStore();
const router = useRouter();

let unsubscribers = [];

watch(() => store.state, (newState) => {
  const route = stateToRouteMap[newState];
  if (route && router.currentRoute.value.path !== route) {
    router.push(route);
  }
});

onMounted(async () => {
  const api = window.launcherAPI;

  if (!api) {
    console.error('launcherAPI not found on window');
    return;
  }

  unsubscribers.push(
      api.onStateChange((data) => {
        store.setState(data.state, data.message);
        if (data.profile) {
          store.setProfile(data.profile);
        }
      })
  );

  unsubscribers.push(
      api.onVersionInfo((data) => {
        store.setVersionInfo(data);
      })
  );

  unsubscribers.push(
      api.onDownloadProgress((data) => {
        store.updateProgress(data);
      })
  );

  unsubscribers.push(
      api.onFileStart((data) => {
        store.setCurrentFile(data.path);
        store.updateWorkerStatus(data.workerId, { id: data.id, path: data.path });
      })
  );

  unsubscribers.push(
      api.onFileEnd((data) => {
        store.clearWorkerStatus(data.workerId);
      })
  );

  unsubscribers.push(
      api.onDownloadRetry((data) => {
        store.setRetryInfo(data);
      })
  );

  unsubscribers.push(
      api.onLauncherError((data) => {
        store.setError(data.error);
      })
  );

  unsubscribers.push(
      api.onCompletenessChange((data) => {
        store.setCompleteness(data.completeness);
      })
  );

  unsubscribers.push(
      api.onJavaDownloadStart((data) => {
        store.setJavaDownload(true, 0, `正在下载 Java ${data.version}...`);
        store.setState('java-downloading', `正在下载 Java ${data.version}...`);
      })
  );

  unsubscribers.push(
      api.onJavaDownloadStage((data) => {
        store.setJavaDownload(true, data.progress, data.stage);
        store.setState('java-downloading', data.stage);
      })
  );

  unsubscribers.push(
      api.onJavaDownloadProgress((data) => {
        const method = data.method ? ` (${data.method})` : '';
        store.setJavaDownload(true, data.progress, `下载中${method} ${data.progress}%`);
        store.setState('java-downloading', `下载中${method} ${data.progress}%`);
      })
  );

  unsubscribers.push(
      api.onJavaDownloadRetry((data) => {
        const msg = `下载失败，重试 (${data.attempt}/${data.maxRetries})...`;
        store.setJavaDownload(true, store.javaDownloadProgress, msg);
        store.setState('java-downloading', msg);
      })
  );

  unsubscribers.push(
      api.onJavaDownloadComplete(() => {
        store.setJavaDownload(false, 100, 'Java 下载完成');
      })
  );

  unsubscribers.push(
      api.onJavaDownloadError((data) => {
        store.setJavaDownload(false, 0, data.error);
        store.setError(data.error);
      })
  );

  const settings = await api.getSettings();
  if (settings.firstLaunch) {
    router.push('/setup');
    return;
  }

  const { lastUsedUsername } = await api.getProfiles();
  if (lastUsedUsername) {
    store.setUsername(lastUsedUsername);
  }

  const pack = await api.getCurrentPack();
  if (pack?.id) {
    store.setVersionInfo({ id: pack.name || pack.id });
  }

  router.push('/home');
});

onUnmounted(() => {
  unsubscribers.forEach(unsub => unsub());
});
</script>

<template>
  <div class="h-full flex flex-col bg-white overflow-hidden">
    <TitleBar />

    <main class="flex-1 flex items-center justify-center overflow-hidden">
      <router-view />
    </main>
  </div>
</template>
