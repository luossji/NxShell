<template>
	<div class="nx-layout-wrapper">
		<div v-show="configPanel" class="nx-layout-left" :style="leftPanelStyle">
			<nx-menus ref="menuRef" />
		</div>
		<div class="nx-layout-right" :style="rightPanelStyle">
			<div
				class="nx-layout-resize-rail"
				:class="{ 'nx-layout-resize-rail--resizing': isResizing }"
				@mousedown.prevent="handleResizeStart"
				@dblclick.prevent="handleResetSidebarWidth"
			>
				<div class="nx-layout-resize-rail__line"></div>
			</div>
			<nx-tab-menu v-if="showTabs" />
			<div class="nx-content" :style="{height: `calc(100% - ${showTabs ? '40px':'0px' })`}">
				<keep-alive :exclude="['GlobalSetting', 'lock']">
					<router-view />
				</keep-alive>
			</div>
		</div>
	</div>
</template>
<script setup>
import * as EventBus from '@/services/eventbus'
import { NxMenus, NxTabMenu } from './components'
import { storeToRefs } from 'pinia'
import { computed, getCurrentInstance, onBeforeMount, onBeforeUnmount, ref } from "vue";
import { useNxTabsStore } from '@/store'
import { getProfile, updateProfile } from '@/services/globalSetting'

const { configPanel, showTabs } = storeToRefs(useNxTabsStore())
const proxy = getCurrentInstance()?.proxy
const DEFAULT_SIDEBAR_WIDTH = 295
const MIN_SIDEBAR_WIDTH = 220
const MAX_SIDEBAR_WIDTH = 520

const resizeMoved = ref(false)
const isResizing = ref(false)
const sidebarWidth = ref(getStoredSidebarWidth())
let resizeStartX = 0
let resizeStartWidth = 0

function getMaxSidebarWidth() {
	if (typeof window === 'undefined') {
		return MAX_SIDEBAR_WIDTH
	}
	return Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, window.innerWidth - 240))
}

function clampSidebarWidth(width) {
	const normalizedWidth = Number.parseInt(width, 10)
	if (Number.isNaN(normalizedWidth)) {
		return DEFAULT_SIDEBAR_WIDTH
	}
	return Math.min(getMaxSidebarWidth(), Math.max(MIN_SIDEBAR_WIDTH, normalizedWidth))
}

function getStoredSidebarWidth() {
	return clampSidebarWidth(getProfile('xterm')?.layoutSidebarWidth || DEFAULT_SIDEBAR_WIDTH)
}

async function persistSidebarWidth() {
	const xtermProfile = getProfile('xterm') || {}
	await updateProfile('xterm', { ...xtermProfile, layoutSidebarWidth: sidebarWidth.value })
}

const leftPanelStyle = computed(() => ({ width: `${sidebarWidth.value}px` }))
const rightPanelStyle = computed(() => ({ width: configPanel.value ? `calc(100% - ${sidebarWidth.value}px)` : '100%' }))

const handleResetSidebarWidth = async () => {
	resizeMoved.value = false
	if (!configPanel.value) {
		configPanel.value = true
		EventBus.publish('session-config-panel', 'open')
	}
	sidebarWidth.value = clampSidebarWidth(DEFAULT_SIDEBAR_WIDTH)
	await persistSidebarWidth()
}

const handleResizeMove = (event) => {
	if (!isResizing.value) {
		return
	}
	const deltaX = event.clientX - resizeStartX
	if (Math.abs(deltaX) > 3) {
		resizeMoved.value = true
	}
	const nextWidth = clampSidebarWidth(resizeStartWidth + deltaX)
	if (!configPanel.value) {
		configPanel.value = true
		EventBus.publish('session-config-panel', 'open')
	}
	sidebarWidth.value = nextWidth
	window.getSelection?.()?.removeAllRanges()
}

const stopResize = async () => {
	if (!isResizing.value) {
		return
	}
	isResizing.value = false
	document.removeEventListener('mousemove', handleResizeMove)
	document.removeEventListener('mouseup', stopResize)
	document.body.style.cursor = ''
	if (resizeMoved.value) {
		await persistSidebarWidth()
	}
	window.removeEventListener('resize', syncSidebarWidthWithinViewport)
	window.addEventListener('resize', syncSidebarWidthWithinViewport)
	setTimeout(() => {
		resizeMoved.value = false
	}, 0)
}

const handleResizeStart = (event) => {
	resizeMoved.value = false
	isResizing.value = true
	resizeStartX = event.clientX
	resizeStartWidth = configPanel.value ? sidebarWidth.value : 0
	document.body.style.cursor = 'col-resize'
	document.addEventListener('mousemove', handleResizeMove)
	document.addEventListener('mouseup', stopResize)
}

const syncSidebarWidthWithinViewport = () => {
	const nextWidth = clampSidebarWidth(sidebarWidth.value)
	if (nextWidth !== sidebarWidth.value) {
		sidebarWidth.value = nextWidth
		persistSidebarWidth()
	}
	if (document.body.style.cursor === 'col-resize' && !isResizing.value) {
		document.body.style.cursor = ''
	}
	resizeStartWidth = sidebarWidth.value
}

onBeforeMount(async () => {
	// @ts-ignore
	const sessionManager = proxy.$sessionManager
	sidebarWidth.value = getStoredSidebarWidth()
	// 避免重复创建欢迎会话实例
	if (!sessionManager.getSessionIntances().find((x) => x.name === 'Welcome')) {
		await sessionManager.createWelcomeSessionInstance()
	}
	window.addEventListener('resize', syncSidebarWidthWithinViewport)
})

onBeforeUnmount(() => {
	document.removeEventListener('mousemove', handleResizeMove)
	document.removeEventListener('mouseup', stopResize)
	window.removeEventListener('resize', syncSidebarWidthWithinViewport)
	document.body.style.cursor = ''
})

</script>

<style lang="scss" scoped>
// 左侧工具栏宽度
// 顶部Tabs 高度
$nx-content-tabs: 40px;
.nx-layout-wrapper {
	display: flex;
	justify-content: flex-start;
	align-items: flex-start;
	box-sizing: border-box;

	.nx-layout-left {
		height: calc(100vh - 40px);
		box-sizing: border-box;
		padding: 0 5px 8px;
	}

	.nx-layout-right {
		position: relative;
		height: calc(100vh - 40px);
		box-sizing: border-box;

		.nx-layout-resize-rail {
			position: absolute;
			top: 0;
			bottom: 0;
			left: -10px;
			width: 20px;
			z-index: 100;
			cursor: col-resize;
			user-select: none;

			&__line {
				position: absolute;
				top: 0;
				bottom: 0;
				left: 9px;
				width: 2px;
				border-radius: 999px;
				background-color: rgba(64, 158, 255, 0);
				transition: background-color 0.2s ease, box-shadow 0.2s ease;
			}

			&:hover {
				.nx-layout-resize-rail__line {
					background-color: rgba(64, 158, 255, 0.45);
				}
			}

			&--resizing {
				.nx-layout-resize-rail__line {
					background-color: rgba(64, 158, 255, 0.95);
					box-shadow: 0 0 0 3px rgba(64, 158, 255, 0.18);
				}
			}
		}

		.nx-content {
			height: calc(100vh - #{$nx-content-tabs});
		}
	}
}
</style>
