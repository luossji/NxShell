import Vue from 'vue'

/**
 * 图标 sprite 的加载状态
 *
 * svg-sprite-loader 是把 <symbol> 注入到页面的，文件类型图标是异步 chunk，
 * NIcon 依赖这个标记在图标补齐后重新解析 <use>，避免首帧缺失的图标一直空着。
 */
export const iconState = Vue.observable({
	fileIconsLoaded: false
})

export function setFileIconsLoaded(loaded) {
	iconState.fileIconsLoaded = loaded
}
