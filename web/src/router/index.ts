import { createRouter, createWebHistory } from 'vue-router';

import HomeView from '@/views/HomeView.vue';
import { isLoggedIn, restoreSession } from '@/lib/auth';
import { getToken } from '@/lib/http';

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior(to) {
    if (to.hash) return { el: to.hash, behavior: 'smooth' };
    return { top: 0 };
  },
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/policies', name: 'policies', component: () => import('@/views/PoliciesView.vue') },
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
  if (!to.meta.requiresAuth) return true;
  if (!isLoggedIn.value && getToken()) await restoreSession();
  if (!isLoggedIn.value) {
    return { path: '/login', query: { redirect: to.fullPath } };
  }
  return true;
});

export default router;
