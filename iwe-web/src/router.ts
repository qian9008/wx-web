import { createRouter, createWebHashHistory } from 'vue-router';

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/config',
      name: 'Config',
      component: () => import('@/views/Config.vue'),
    },
    {
      path: '/',
      name: 'Home',
      component: () => import('@/views/Home.vue'),
    },
    // 扫码登录页作为主页的一个弹窗或子路由
    {
      path: '/add-account',
      name: 'AddAccount',
      component: () => import('@/views/Login.vue'),
    }
  ],
});

router.beforeEach((to, from, next) => {
  const baseUrl = localStorage.getItem('iwe_base_url');
  const isDemoMode = localStorage.getItem('isDemoMode') === 'true';
  
  if (to.name !== 'Config' && !baseUrl && !isDemoMode) {
    next({ name: 'Config' });
  } else {
    next();
  }
});

export default router;
