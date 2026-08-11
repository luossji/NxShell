<template>
	<div class="pt-xterm-session">
		<div ref="xtermContainerRef" class="xterm-container">
			<xterm-instance
				v-for="(sessionId, idx) in sessions"
				:key="sessionId"
				v-show="visible(sessionId)"
				:sessionInstanceId="sessionId"
				:style="xtermStyle"
				class="xterm-wrapper"
				@split_screen="(type) => settingStore.updateLayoutMode(type)"
				@titleChange="handleTitleChange"
				@remove-session="handleRemoveSession(idx)"
			/>
		</div>
	</div>
</template>

<script setup>
import XtermInstance from './xtermInstance'
import { useSettingStore } from '@/store'
import { computed, getCurrentInstance, nextTick, onActivated, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { onBeforeRouteUpdate, useRoute } from 'vue-router/composables'
import { useI18n } from 'vue-i18n-bridge'

const { t } = useI18n()
const xtermContainerRef = ref()
const sessions = ref([])
const currentSessionId = ref(-1)
const sessionIdMapSftpDir = ref({})
const tunnelMapTitle = ref({})
const settingStore = useSettingStore()
const { layoutMode } = storeToRefs(settingStore)
const proxy = getCurrentInstance().proxy
const sessionManager = proxy.$sessionManager
const initWidth = ref(0)
const getValidSessionId = (sessionId) => {
	const numericSessionId = Number.parseInt(sessionId, 10)
	if (Number.isNaN(numericSessionId)) {
		return null
	}

	const sessionInstance = sessionManager.getSessionInstance(numericSessionId)
	return sessionInstance?.type === 'shell' ? numericSessionId : null
}

const visible = (sessionId) => {
	if (!getValidSessionId(sessionId)) {
		return false
	}
	return layoutMode.value === 'normal' ? currentSessionId.value === sessionId : true
}
const xtermStyle = computed(() => {
	let width = '100%'
	let height = '100%'
	let min_width = 200
	let t_len = sessions.value.length
	let f_len = Math.floor((t_len + 1) / 2)

	if (layoutMode.value === 'grid') {
		if (t_len < 3) {
			height = '100%'
			width = Math.floor(100 / t_len)
			width = width + '%'
		} else {
			height = '50%'
			width = Math.floor(100 / f_len)
			width = width + '%'
			min_width = Math.floor(initWidth.value / f_len)
		}
	} else if (layoutMode.value === 'col') {
		height = '100%'
		width = Math.floor(100 / t_len)
		width = width + '%'
		min_width = Math.floor(initWidth.value / t_len)
	} else if (layoutMode.value === 'row') {
		width = '100%'
		height = Math.floor(100 / t_len)
		height = height + '%'
	}

	return {
		width,
		height,
		'min-width': `${min_width}px`
	}
})

const handleTitleChange = ({ sessionId, title }) => (sessionIdMapSftpDir[sessionId] = title)
const pruneInvalidSessions = () => {
	sessions.value = sessions.value.filter((sessionId) => getValidSessionId(sessionId) !== null)
	if (!sessions.value.includes(currentSessionId.value)) {
		const nextCurrentSessionId = getValidSessionId(route.params.sessionId)
		currentSessionId.value = nextCurrentSessionId ?? sessions.value[0] ?? -1
	}
	if (layoutMode.value !== 'normal' && sessions.value.length <= 1) {
		settingStore.updateLayoutMode('normal')
	}
}

const handleRemoveSession = (idx) => {
	sessions.value.splice(idx, 1)
	pruneInvalidSessions()
}
const addSession = (sessionId) => {
	const validSessionId = getValidSessionId(sessionId)
	if (validSessionId === null) {
		return
	}
	if (sessions.value.findIndex((v) => v === validSessionId) > -1) {
		return
	}
	sessions.value.push(validSessionId)
}
onBeforeRouteUpdate((to, from, next) => {
	if (to.path !== from.path) {
		currentSessionId.value = getValidSessionId(to.params.sessionId) ?? -1
		addSession(currentSessionId.value)
		if (!tunnelMapTitle.value[currentSessionId.value]) {
			tunnelMapTitle.value[currentSessionId.value] = t('home.session-instance.tunnel')
		}
		pruneInvalidSessions()
	}
	next()
})

const route = useRoute()
onActivated(() => {
	currentSessionId.value = getValidSessionId(route.params.sessionId) ?? -1
	addSession(currentSessionId.value)
	if (!tunnelMapTitle.value[currentSessionId.value]) {
		tunnelMapTitle.value[currentSessionId.value] = t('home.session-instance.tunnel')
	}
	pruneInvalidSessions()
})

onMounted(() => {
	nextTick(() => (initWidth.valu = xtermContainerRef.value.clientWidth))
	pruneInvalidSessions()
})

watch(layoutMode, () => {
	pruneInvalidSessions()
})
</script>

<style lang="scss" scoped>
.pt-xterm-session {
	position: relative;

	width: 100%;
	height: 100%;

	.pt-icon {
		// margin-left: 5px;
		// margin-right: 5px;
		color: var(--secondaryTextColor);
		transition: color 0.2s;

		&:hover {
			color: var(--n-text-color-base);
			transition: color 0.2s;
		}
	}

	.xterm-container {
		display: flex;
		flex-wrap: wrap;
		width: 100%;
		height: 100%;
		overflow: hidden;

		.xterm-wrapper {
			flex-grow: 1;
		}
	}
}
</style>
