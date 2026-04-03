import { createRouter, createWebHashHistory } from 'vue-router';

import HomeView from '../views/HomeView.vue';
import SetupView from '../views/SetupView.vue';
import CheckingView from '../views/CheckingView.vue';
import DownloadingView from '../views/DownloadingView.vue';
import ExtractingView from '../views/ExtractingView.vue';
import JavaDownloadingView from '../views/JavaDownloadingView.vue';
import LaunchingView from '../views/LaunchingView.vue';
import PlayingView from '../views/PlayingView.vue';
import ErrorView from '../views/ErrorView.vue';
import ProfileSelectionView from '../views/ProfileSelectionView.vue';
import VersionSelectorView from '../views/VersionSelectorView.vue';

const routes = [
  { path: '/home', name: 'home', component: HomeView },
  { path: '/setup', name: 'setup', component: SetupView },
  { path: '/profiles', name: 'profiles', component: ProfileSelectionView },
  { path: '/versions', name: 'versions', component: VersionSelectorView },
  { path: '/checking', name: 'checking', component: CheckingView },
  { path: '/downloading', name: 'downloading', component: DownloadingView },
  { path: '/extracting', name: 'extracting', component: ExtractingView },
  { path: '/java-downloading', name: 'java-downloading', component: JavaDownloadingView },
  { path: '/launching', name: 'launching', component: LaunchingView },
  { path: '/playing', name: 'playing', component: PlayingView },
  { path: '/error', name: 'error', component: ErrorView },
];

const stateToRouteMap = {
  'idle': '/home',
  'checking': '/checking',
  'downloading': '/downloading',
  'extracting': '/extracting',
  'java-downloading': '/java-downloading',
  'launching': '/launching',
  'playing': '/playing',
  'error': '/error',
};

export function setupRouter(router) {
  return router;
}

export { stateToRouteMap };

export default createRouter({
  history: createWebHashHistory(),
  routes,
});
