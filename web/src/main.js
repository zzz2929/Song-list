import { createApp } from 'vue';
import ElementPlus from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import 'element-plus/dist/index.css';
import 'element-plus/theme-chalk/dark/css-vars.css';
import './design/tokens.css';
import './style.css';
import * as Icons from '@element-plus/icons-vue';
import App from './App.vue';
import router from './router.js';
import { applyTheme, currentTheme } from './theme.js';

// 挂载前应用主题(令牌 + Element 暗色变量)
applyTheme(currentTheme());

const app = createApp(App);
app.use(ElementPlus, { locale: zhCn });
for (const [name, comp] of Object.entries(Icons)) app.component(name, comp);
app.use(router);
app.mount('#app');
