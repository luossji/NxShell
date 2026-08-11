<template>
	<div ref="nxTabsRef" class="nx-tabs-wrapper">
		<div ref="tabsScrollRef" class="nx-tabs-scroll">
			<transition-group name="drag" class="content" tag="div">
				<div
					v-for="(item, index) in tabData"
					:key="item.id"
					class="tabs-item"
					:class="{ 'item-active': currentActive === index }"
					draggable="true"
					@dragstart="dragstart(index)"
					@dragenter="dragenter($event, index)"
					@dragover.prevent
					@click.prevent="nxTabStore.activateSession(index)"
					v-context-menu="getTabContextMenu"
					@contextmenu.prevent="handleSessionTabsContextMenu(index, item.sessionType)"
				>
					<n-space size="5" fill>
						<n-icon size="18" :name="item.icon" />
						<span>{{ item.title }}</span>
					</n-space>
					<span
						v-if="tabData.length !== 1 || tabData[0].sessionType !== 'welcome'"
						class="tabs-item__close"
						@click="handleSessionInstRemove(index)"
					>
						<i class="el-icon-close"></i>
					</span>
				</div>
			</transition-group>
		</div>
		<div v-if="false && showLayoutToolbar" class="tabs-layout-toolbar">
			<el-tooltip class="item" effect="dark" :content="t('home.session-instance.context-menu.split-normal')" placement="bottom">
				<span class="tabs-layout-toolbar__button" :class="{ 'is-active': layoutMode === 'normal' }" @click="changeLayout('normal')">
					<n-icon name="layout-alone" size="15" />
				</span>
			</el-tooltip>
			<el-tooltip class="item" effect="dark" :content="t('home.session-instance.context-menu.split-row')" placement="bottom">
				<span class="tabs-layout-toolbar__button" :class="{ 'is-active': layoutMode === 'row' }" @click="changeLayout('row')">
					<n-icon name="layout-row" size="15" />
				</span>
			</el-tooltip>
			<el-tooltip class="item" effect="dark" :content="t('home.session-instance.context-menu.split-column')" placement="bottom">
				<span class="tabs-layout-toolbar__button" :class="{ 'is-active': layoutMode === 'col' }" @click="changeLayout('col')">
					<n-icon name="layout-col" size="15" />
				</span>
			</el-tooltip>
			<el-tooltip class="item" effect="dark" :content="t('home.session-instance.context-menu.split-grid')" placement="bottom">
				<span class="tabs-layout-toolbar__button" :class="{ 'is-active': layoutMode === 'grid' }" @click="changeLayout('grid')">
					<n-icon name="layout-lattice" size="15" />
				</span>
			</el-tooltip>
		</div>
	</div>
</template>

<script setup>
import BScroll from '@better-scroll/core'
import MouseWheel from '@better-scroll/mouse-wheel'
import { publish } from '@/services/eventbus'
import { getProfile } from '@/services/globalSetting'
import { storeToRefs } from 'pinia'
import { useNxTabsStore, useSettingStore } from '@/store'
import mousetrap from 'mousetrap'
import { computed, getCurrentInstance, onBeforeUnmount, onMounted, onUpdated, reactive, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n-bridge'

BScroll.use(MouseWheel)

const nxTabStore = useNxTabsStore()
const settingStore = useSettingStore()
const scrollbar = ref()
const nxTabsRef = ref()
const tabsScrollRef = ref()
const dragIndex = ref()
const { tabData, currentActive, editorChange, checkedTabType, noConfirm } = storeToRefs(nxTabStore)
const { layoutMode } = storeToRefs(settingStore)
const proxy = getCurrentInstance().proxy
const sessionManager = proxy.$sessionManager
const { t } = useI18n()
const showLayoutToolbar = computed(() => tabData.value.some((item) => item.sessionType === 'shell'))
const hiddenShortcutBarSessionMap = reactive({})

function getGlobalHideShortcutBar() {
	return !!getProfile('xterm')?.hideSessionShortcutBar
}

// 右键菜单相关

async function handleClose() {
	await handleSessionInstRemove(currentActive.value)
}

async function handleCopy() {
	let sessTabItem = tabData.value[currentActive.value]
	await sessionManager.duplicateSessionInstance(sessTabItem.session)
}

async function handleCloseLeft() {
	let index = currentActive.value - 1
	if (index < 0) {
		return
	}
	const sessions = tabData.value.slice(0, index + 1).map(item => item.session)
	await Promise.all(sessions.map(session => session.close()))
}

async function handleCloseRight() {
	let len = tabData.value.length
	let index = currentActive.value + 1
	if (index > len - 1) {
		return
	}
	const sessions = tabData.value.slice(index).map(item => item.session)
	await Promise.all(sessions.map(session => session.close()))
}

async function handleCloseOther() {
	const sessions = tabData.value.filter((item, index) => index !== currentActive.value).map(item => item.session)
	await Promise.all(sessions.map(session => session.close()))
}

async function handleProp() {
	const sessTabItem = tabData.value[currentActive.value]
	const sessionConfig = sessionManager.getSessionConfigByInstanceId(sessTabItem.id)
	if (!sessionConfig) {
		return
	}
	publish('open-session-property', {
		sessionId: sessionConfig._id,
		protocol: sessionConfig.config?.protocal || sessionConfig.config?.sessType
	})
}

function handleToggleShortcutBar() {
	const sessTabItem = tabData.value[currentActive.value]
	if (!sessTabItem) {
		return
	}
	const sessionId = sessTabItem.id
	const isHidden = Object.prototype.hasOwnProperty.call(hiddenShortcutBarSessionMap, sessionId)
		? !!hiddenShortcutBarSessionMap[sessionId]
		: getGlobalHideShortcutBar()
	const visible = isHidden
	hiddenShortcutBarSessionMap[sessionId] = !visible
	publish('toggle-session-shortcut-bar', {
		sessionId,
		visible
	})
}

const sessionTabContextMenu = reactive({
	shell: [
		{
			label: 'home.sessions-context-menu.duplicate',
			type: 'normal',
			handler: handleCopy
		},
		{
			label: 'home.sessions-context-menu.close',
			type: 'normal',
			handler: handleClose
		},
		{
			label: 'home.sessions-context-menu.close-other',
			type: 'normal',
			handler: handleCloseOther
		},
        {
			label: 'home.sessions-context-menu.close-left',
			type: 'normal',
			handler: handleCloseLeft
		},
        {
			label: 'home.sessions-context-menu.close-right',
			type: 'normal',
			handler: handleCloseRight
		},
		{
			type: 'separator'
		},
		{
			id: 'toggle-shortcut-bar',
			label: 'home.sessions-context-menu.hide-shortcut-bar',
			type: 'normal',
			handler: handleToggleShortcutBar
		},
		{
			type: 'separator'
		},
		{
			label: 'home.sessions-context-menu.prop',
			type: 'normal',
			handler: handleProp
		}
	],
	welcome: [
		{
			label: 'home.sessions-context-menu.close-other',
			type: 'normal',
			icon: '',
			handler: handleCloseOther
		}
	],
	login: [
		{
			label: 'home.sessions-context-menu.close',
			type: 'normal',
			handler: handleClose
		}
	],
	unknown: [
		{
			label: 'home.sessions-context-menu.close',
			type: 'normal',
			handler: handleClose
		},
		{
			label: 'home.sessions-context-menu.close-left',
			type: 'normal',
			handler: handleCloseLeft
		},
		{
			label: 'home.sessions-context-menu.close-right',
			type: 'normal',
			handler: handleCloseRight
		},
		{
			label: 'home.sessions-context-menu.close-other',
			type: 'normal',
			handler: handleCloseOther
		},
		{
			type: 'separator'
		},
		{
			id: 'toggle-shortcut-bar',
			label: 'home.sessions-context-menu.hide-shortcut-bar',
			type: 'normal',
			handler: handleToggleShortcutBar
		}
	]
})

function getTabContextMenu() {
	let menus = sessionTabContextMenu[checkedTabType.value]
	if (!menus) {
		menus = sessionTabContextMenu['unknown']
	}
	const sessTabItem = tabData.value[currentActive.value]
	const sessionId = sessTabItem?.id
	const isHidden = Object.prototype.hasOwnProperty.call(hiddenShortcutBarSessionMap, sessionId)
		? !!hiddenShortcutBarSessionMap[sessionId]
		: getGlobalHideShortcutBar()
	const toggleMenu = menus.find((menu) => menu.id === 'toggle-shortcut-bar')
	if (toggleMenu) {
		toggleMenu.label = isHidden
			? 'home.sessions-context-menu.show-shortcut-bar'
			: 'home.sessions-context-menu.hide-shortcut-bar'
	}
	return menus
}

const handleSessionInstRemove = (index) => {
	const { title, sessionType, session } = tabData.value[index]
	// 首页不需要确认
	if (title === 'Welcome') {
		session.close()
		return
	}
	// 编辑器特殊处理
	if (sessionType === 'editor' && !editorChange.value) {
		session.beforeClose()
		session.close()
		nxTabStore.updateActiveTabIndex(index)
		return
	} else if (sessionType === 'editor') {
		proxy.$confirm(
			t('home.session-instance.save-dialog.message'),
			t('home.session-instance.save-dialog.title'),
			{
				cancelButtonText: '不保存',
				showClose: false
			}
		)
			.then(() => {
				session.beforeClose()
				session.close()
			})
			.catch(() => {
				session.close()
			})
		return
	}
	if (noConfirm.value && sessionType !== 'editor') {
		session.beforeClose()
		session.close()
		nxTabStore.updateActiveTabIndex(index)
		return
	}

	const isEditor = session && sessionType === 'editor'
	const h = proxy.$createElement
	proxy.$msgbox({
		title: t(`home.session-instance.${ isEditor ? 'save-dialog.title' : 'delete-dialog.message' }`),
		message: h(
			'div',
			{
				style: 'display:flex;flex-direction: column;row-gap: 20px'
			},
			[
				h(
					'div',
					{
						style: 'display:flex;align-items: center;column-gap: 10px;'
					},
					[
						h('i', {
							class: 'el-icon-warning',
							style: 'font-size: 20px;color: #E6A23C'
						}),
						t(`home.session-instance.${ isEditor ? 'save-dialog.message' : 'delete-dialog.title' }`)
					]
				),
				h(
					'el-checkbox',
					{
						props: {
							label: '下次不再确认'
						},
						trueLabel: true,
						falseLabel: false,
						on: {
							change: (value) => nxTabStore.updateNoConfirm(value)
						}
					},
					null
				)
			]
		),
		showClose: false,
		showCancelButton: true,
		closeOnClickModal: false,
		cancelButtonText: t('components.Cancel'),
		confirmButtonText: t('components.OK')
	})
		.then(() => {
			session.beforeClose()
			session.close()
			nxTabStore.updateActiveTabIndex(index)
		})
		.catch(() => {
		})
}

/**
 * 处理会话Tab的右键菜单
 *
 * @param index 选中的Tab 编号
 * @param sessionType 选中的Tab会话类型
 */
function handleSessionTabsContextMenu(index, sessionType) {
	checkedTabType.value = sessionType
	nxTabStore.updateActiveTabIndex(index)
}

function dragstart(index) {
	dragIndex.value = index
}

function dragenter(e, index) {
	// 避免源对象触发自身的dragenter事件
	if (dragIndex !== index) {
		const moving = tabData.value[dragIndex.value]
		tabData.value.splice(dragIndex.value, 1)
		tabData.value.splice(index, 0, moving)
		// 排序变化后目标对象的索引变成源对象的索引
		nxTabStore.updateActiveTabIndex(index)
		dragIndex.value = index
	}
}

function changeLayout(layout) {
	settingStore.updateLayoutMode(layout)
}

const hotKey = (type) => {
	for (let i = 0; i < 10; i++) {
		mousetrap[type === 1 ? 'bind' : 'unbind'](`alt+${ i }`, (e) => nxTabStore.activateSession(parseInt(e.key)))
	}
}
onMounted(() => {
	scrollbar.value = new BScroll(tabsScrollRef.value, {
		scrollX: true,
		mouseWheel: true,
		disableMouse: true, // 支持监听鼠标相关事件
		disableTouch: true, // 不监听touch相关事件
		preventDefault: false // 事件派发后不阻止默认行为，比如选中文字
	})
	// 注册快捷键
	hotKey(1)
})
watchEffect(() => {
	if (tabData.value) {
		setTimeout(() => {
			scrollbar.value?.refresh()
			// 获取当前选中的元素，之后将滚动到该位置
			const activeElement = document.getElementsByClassName(' item-active')[0]
			scrollbar.value?.scrollToElement(activeElement, 500, true, false)
		}, 200)
	}
})
onUpdated(scrollbar.value?.refresh)
// 页面销毁前取消绑定
onBeforeUnmount(hotKey)
</script>
<style lang="scss" scoped>
.nx-tabs-wrapper {
	display: flex;
	align-items: stretch;
	justify-content: space-between;
	width: 100%;
	height: 40px;
	overflow: hidden;
	white-space: nowrap;
	box-sizing: border-box;
	background-color: var(--n-tabs-bg-color);
	gap: 0;
	padding-right: 0;

	.nx-tabs-scroll {
		flex: 1;
		min-width: 0;
		height: 100%;
		overflow: hidden;
	}

	.content {
		display: inline-flex;
		align-items: stretch;
		column-gap: 5px;
		padding-left: 5px;
		padding-right: 0;
		height: 100%;

		.drag-move {
			transition: transform 0.3s;
		}

		.tabs-item {
			flex-shrink: 0;
			display: inline-flex;
			justify-content: space-between;
			align-items: center;
			padding: 0 8px;
			height: 100%;
			font-size: 12px;
			color: var(--n-text-color-base);
			background: var(--n-tabs-item-bg-color);
			box-sizing: border-box;
			column-gap: 5px;
			border-radius: 0;

			&:first-child {
				border-top-left-radius: 6px;
			}

			&:hover {
				cursor: pointer;
				color: var(--n-tabs-item-active-color);
				font-weight: 600;
				background: var(--n-tabs-item-hover-bg-color);
			}

			&__close {
				display: inline-block;
				padding: 2px;
				border-radius: 2px;

				&:hover {
					background-color: #ffffff6b;
				}
			}
		}

		.item-active {
			font-weight: 600;
			color: var(--n-tabs-item-active-color);
			background: var(--n-tabs-item-hover-bg-color);
		}
	}

	.tabs-layout-toolbar {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		align-self: stretch;
		gap: 2px;
		height: 100%;
		margin-left: 0;
		padding: 0 6px 0 6px;
		border-left: 1px solid rgba(71, 85, 105, 0.16);
		background: var(--n-tabs-item-bg-color);

		&__button {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 22px;
			height: 22px;
			border-radius: 5px;
			color: rgba(203, 213, 225, 0.92);
			transition: background-color 0.18s ease, color 0.18s ease;

			&:hover {
				cursor: pointer;
				background-color: rgba(51, 65, 85, 0.5);
			}

			&.is-active {
				background: linear-gradient(180deg, rgba(20, 184, 166, 0.2), rgba(13, 148, 136, 0.12));
				color: #5eead4;
			}
		}
	}
}
</style>
