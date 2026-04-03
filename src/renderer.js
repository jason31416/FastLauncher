import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './renderer/App.vue';
import router from './renderer/router/index.js';
import './index.css';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);
app.mount('#app');
