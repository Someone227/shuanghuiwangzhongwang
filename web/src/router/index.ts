import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router';

import HomeView from '@/views/HomeView.vue';
import { isStaticMode } from '@/lib/api';
import { isLoggedIn, restoreSession } from '@/lib/auth';
import { getToken } from '@/lib/http';

// 静态托管（GitHub Pages）没有「任意路径回退到 index.html」，用 hash 路由避免刷新 404
const useHash = import.meta.env.VITE_ROUTER_HASH === 'true';

const router = createRouter({
  // history 模式必须带上 BASE_URL：GitHub Pages 部署在 /<repo>/ 子路径下，
  // 否则刷新子页面时 vue-router 会把「/repo/calendar」当成未知路径、重定向回首页。
  history: useHash ? createWebHashHistory() : createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior(to) {
    if (to.hash) return { el: to.hash, behavior: 'smooth' };
    return { top: 0 };
  },
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/policies', name: 'policies', component: () => import('@/views/PoliciesView.vue') },
    {
      path: '/policies/:id',
      name: 'policy-detail',
      component: () => import('@/views/PolicyDetailView.vue'),
    },
    { path: '/calendar', name: 'calendar', component: () => import('@/views/CalendarView.vue') },
    { path: '/radar', name: 'radar', component: () => import('@/views/RadarView.vue') },
    { path: '/match/:id', name: 'match', component: () => import('@/views/MatchView.vue') },
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue') },
    {
      path: '/account',
      name: 'account',
      component: () => import('@/views/AccountView.vue'),
      meta: { requiresAuth: true },
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

/** 每个页面的标签页标题：浏览器标签、收藏夹、演示录屏里都看得见 */
const PAGE_TITLES: Record<string, string> = {
  home: '能申吗 · 政策资格匹配器',
  policies: '政策库 · 能申吗',
  'policy-detail': '政策详情 · 能申吗',
  calendar: '申报日历 · 能申吗',
  radar: '政策雷达 · 能申吗',
  match: '逐条判定 · 能申吗',
  login: '登录 · 能申吗',
  account: '个人中心 · 能申吗',
};

router.afterEach((to) => {
  document.title = PAGE_TITLES[String(to.name)] ?? '能申吗 · 政策资格匹配器';
});

/** 需要登录的页面：先确认登录态，失效则跳登录并记住来源地址 */
router.beforeEach(async (to) => {
  // 在线演示版没有账号后端：登录页与个人中心直接回首页
  if (isStaticMode && (to.meta.requiresAuth || to.name === 'login')) return { path: '/' };
  if (!to.meta.requiresAuth) return true;
  if (!isLoggedIn.value && getToken()) await restoreSession();
  if (!isLoggedIn.value) {
    return { path: '/login', query: { redirect: to.fullPath } };
  }
  return true;
});

export default router;