import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router';

import HomeView from '@/views/HomeView.vue';
import { isStaticMode } from '@/lib/api';
import { isLoggedIn, restoreSession } from '@/lib/auth';
import { getToken } from '@/lib/http';

// 静态托管（GitHub Pages）没有「任意路径回退到 index.html」，用 hash 路由避免刷新 404
const useHash = import.meta.env.VITE_ROUTER_HASH === 'true';

const router = createRouter({
  history: useHash ? createWebHashHistory() : createWebHistory(),
  scrollBehavior(to) {
    if (to.hash) return { el: to.hash, behavior: 'smooth' };
    return { top: 0 };
  },
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/policies', name: 'policies', component: () => import('@/views/PoliciesView.vue') },
    { path: '/calendar', name: 'calendar', component: () => import('@/views/CalendarView.vue') },
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
