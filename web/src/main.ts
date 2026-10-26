import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import { initTheme } from './lib/theme';
import './style.css';

initTheme();

createApp(App).use(createPinia()).use(router).mount('#app');
