import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/r/:code', name: 'room', component: () => import('../views/RoomView.vue') },
    { path: '/about', name: 'about', component: () => import('../views/AboutView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.afterEach((to, _from, failure) => {
  // 被取消的導覽（例如離開房間時按了「繼續烤肉」）也會跑到這裡，不能改標題
  if (failure) return
  if (to.name !== 'room') document.title = '夯肉'
})

export default router
