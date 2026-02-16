/**
 * Marmot Web — Entry point
 */

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { createPersistedState } from './plugins/persistedState'
import './styles.css'

const app = createApp(App)

const pinia = createPinia()
pinia.use(createPersistedState())

app.use(pinia)
app.use(router)

app.mount('#app')
