import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import vuetify, { transformAssetUrls } from 'vite-plugin-vuetify'

const alias = {
  // 根目录
  '@resources': resolve('./'),
  // 共有
  '@common': resolve('src/common'),
  // 主进程
  '@main': resolve('src/main'),
  // 预加载进程
  '@preload': resolve('src/preload'),
  // 渲染进程
  '@renderer': resolve('src/renderer/src')
}

export default defineConfig({
  main: {
    resolve: {
      alias
    },
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    resolve: {
      alias
    },
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias
    },
    plugins: [
      vue({
        template: { transformAssetUrls }
      }),
      AutoImport({
        resolvers: [ElementPlusResolver()]
      }),
      Components({
        resolvers: [ElementPlusResolver()]
      }),
      vuetify({ autoImport: true })
    ]
  }
})
