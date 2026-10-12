import Vue from 'vue'
import NIcon from '@/components/svgicon/index.vue' // svg component
import { setFileIconsLoaded } from './state'

Vue.component(NIcon.name, NIcon);

/**
 * 首屏 UI 图标（菜单、页签、工具栏、设置、协议、系统品牌等）
 * 只有 ~60 个、体积 ~100KB，保持同步注册，保证首帧就有图标
 */
const uiIcons = require.context('./svg', false, /\.svg$/)
const requireAll = requireContext => requireContext.keys().map(requireContext)
requireAll(uiIcons)

/**
 * 文件类型图标（800+ 个 vscode-material-icon-theme 图标）
 * 只在展示文件列表 / 文件页签时按文件名动态解析，没必要进首屏。
 * lazy-once：整组图标只打成一个异步 chunk，首次访问时一次拉回来。
 */
const fileIcons = require.context('./svg-file', false, /\.svg$/, 'lazy-once')

let fileIconsLoading = null

/**
 * 按需加载文件类型图标（幂等，可重复调用）
 *
 * svg-sprite-loader 是在「模块执行」时把 <symbol> 注入页面的，
 * 所以这里必须把每个 key 都 require 一遍（chunk 只会下载一次），
 * 只 require 一个 key 的话其余图标不会注册，页面上就是空白图标。
 *
 * @returns {Promise<any>} 图标资源加载完成的 Promise
 */
export function ensureFileIcons() {
	if (!fileIconsLoading) {
		const keys = fileIcons.keys()
		fileIconsLoading = keys.length
			? Promise.all(keys.map((key) => fileIcons(key))).then((res) => {
				setFileIconsLoaded(true)
				return res
			})
			: Promise.resolve()
	}
	return fileIconsLoading
}
