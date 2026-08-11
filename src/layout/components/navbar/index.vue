<template>
	<div class="pt-shell-app-nav-bar">
		<div class="pt-logo">
			<el-avatar shape="square" fit="fill" size="small" :src="require('@/assets/logo.png')" />
			<span class="pt-logo__text">NxShell</span>
		</div>
		<div class="icon-setting-container">
			<el-button v-if="false" type="text" icon="el-icon-user" @click="goLogin" />
			<el-dropdown trigger="click" placement="bottom-end" @command="toggleTheme">
				<el-button type="text" :icon="themeIconConstants[theme]" class="topbar-icon-btn" />
				<el-dropdown-menu class="theme-btn" slot="dropdown">
					<el-dropdown-item :disabled="theme === 'light'" command="light" icon="el-icon-sunny">
						{{ t("app.theme.light") }}
					</el-dropdown-item>
					<el-dropdown-item :disabled="theme === 'dark'" command="dark" icon="el-icon-moon">
						{{ t("app.theme.dark") }}
					</el-dropdown-item>
					<el-dropdown-item :disabled="theme === 'pink'" command="pink" icon="el-icon-grape">
						{{ t("app.theme.pink") }}
					</el-dropdown-item>
				</el-dropdown-menu>
			</el-dropdown>
			<el-button type="text" icon="el-icon-setting" class="topbar-icon-btn" @click="gotoGlobalSetting" />
			<el-tooltip effect="dark" :content="configPanel ? t('app.collapse-sidebar') : t('app.expand-sidebar')" placement="bottom">
				<el-button type="text" class="topbar-icon-btn sidebar-toggle-btn" @click="toggleSidebar">
					<span class="sidebar-toggle-icon" :class="{ 'is-collapsed': !configPanel }"></span>
				</el-button>
			</el-tooltip>
			<el-tooltip v-if="needUpdate" effect="dark" :content="t('app.need-update')" placement="bottom">
				<el-button type="text" :class="['topbar-icon-btn', { 'version-btn': needUpdate }]" icon="el-icon-sold-out" @click="handlerVersionUpdate" />
			</el-tooltip>
		</div>
	</div>
</template>

<script setup>
import * as EventBus from '@/services/eventbus'
import { createLocalFs } from "@/services/nxsys/localfs"
import { SESSION_TYPES } from "@/services/session"
import { useNxTabsStore, useSettingStore } from "@/store"
import axios from "axios"
import { storeToRefs } from "pinia"
import semver from "semver"
import { getCurrentInstance, onMounted, ref } from "vue"
import { useI18n } from "vue-i18n-bridge"

const { t } = useI18n()
const version = ref("V1.0.0")
const needUpdate = ref(false)
const capture = ref(false)
const captureIcon = ref("")
const fsClient = ref()
const instance = getCurrentInstance()
const settingStore = useSettingStore()
const nxTabsStore = useNxTabsStore()
const { theme } = storeToRefs(settingStore)
const { configPanel } = storeToRefs(nxTabsStore)
const themeIconConstants = {
	light: "el-icon-sunny",
	dark: "el-icon-moon",
	pink: "el-icon-grape",
	hazy: "el-icon-sunny"
}
const doCapture = async (e) => {
	capture.value = !capture.value
	captureIcon.value = capture.value ? "VideoPlay" : "VideoPause"
	if (capture.value) {
		const save_buffer = await window.powertools.captureStop()
		const coreService = window.powertools.getService("powertools-core")
		const { canceled, filePath } = await coreService.showSaveDialog({
			defaultPath: `nxshell-capture-${Date.now()}.webm`
		})
		if (canceled) {
			return
		}
		if (!fsClient.value) {
			fsClient.value = await createLocalFs()
		}
		const w_handle = await fsClient.value.open(filePath, "w")
		await fsClient.value.write(w_handle, save_buffer, 0, save_buffer.length, 0)
		fsClient.value.close(w_handle)
		return
	}
	await window.powertools.captureStart()
}

const checkAppUpdate = async () => {
	const versionUrl = "http://106.15.238.81:56789/oauth/version"
	try {
		const {
			data: { version: remoteVersion = "" }
		} = await axios.get(versionUrl, { timeout: 60 * 1000 })
		if (remoteVersion !== "" && remoteVersion !== version.value) {
			needUpdate.value = semver.gt(remoteVersion, version.value)
		}
	} catch (e) {
		console.error("App版本检测异常", e)
	}
}

const goLogin = () => {
	// const { $sessionManager: sessionManager } = instance?.proxy
	// const loginInstances = sessionManager.matchSessionInstanceBySessionType(SESSION_TYPES.LOGIN)
	// if (loginInstances.length) {
	// 	return
	// }
	// sessionManager.createLoginSessionInstance()
}
const toggleTheme = (theme) => {
	settingStore.changeTheme(theme)
}
const toggleSidebar = () => {
	const action = configPanel.value ? 'close' : 'open'
	configPanel.value = !configPanel.value
	EventBus.publish('session-config-panel', action)
}
const gotoGlobalSetting = () => {
	const proxy = instance?.proxy
	// @ts-ignore
	const sessionManager = proxy && proxy.$sessionManager
	const globalSettingInstances = sessionManager.matchSessionInstanceBySessionType(SESSION_TYPES.GLOBALSETTING)
	if (globalSettingInstances.length) {
		return
	}

	sessionManager.createGlobalSettingSessionInstance()
}
const handlerVersionUpdate = async () => {
	// 外链打开github地址
	const update = "https://gitee.com/luossji/nxshell/releases"
	await window.powertools.openExterUrl(update)
}

onMounted(() => {
	version.value = window.powertools.getVersion()
	//checkAppUpdate()
})
</script>

<style lang="scss" scoped>
.theme-btn {
	padding: 5px;
	border-color: var(--n-border-color);
	background-color: var(--n-bg-color-light);

	::v-deep .el-dropdown-menu__item:not(.is-disabled) {
		color: var(--n-text-color-base);
		border-radius: 4px;

		&:focus,
		&:not(.is-disabled):hover {
			background-color: var(--n-bg-color-base);
		}
	}

	.el-dropdown-menu__item {
		margin-bottom: 5px;
	}

	.is-disabled {
		border-radius: 4px;
		background-color: var(--n-bg-color-base);
	}

	::v-deep .popper__arrow {
		border-top-color: var(--n-bg-color-light) !important;

		&::after {
			border-top-color: var(--n-bg-color-light) !important;
		}
	}
}

.pt-shell-app-nav-bar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	box-sizing: border-box;
	width: 100%;
	height: 40px;
	padding: 0 14px 0 18px;
	-webkit-app-region: drag;

	.sidebar-toggle-icon {
		display: inline-block;
		position: relative;
		width: 14px;
		height: 14px;
		border: 1px solid currentColor;
		border-radius: 3px;
		opacity: 0.88;

		&::before {
			content: "";
			position: absolute;
			top: 1px;
			bottom: 1px;
			left: 1px;
			width: 3px;
			border-radius: 2px;
			background-color: currentColor;
		}

		&.is-collapsed::before {
			left: auto;
			right: 1px;
		}
	}

	.pt-logo {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;

		.el-avatar {
			background: transparent;
		}

		&__text {
			font-size: 15px;
			font-weight: 800;
			letter-spacing: 0.01em;
			background: linear-gradient(180deg, var(--n-text-color-active) 0%, var(--n-text-color-base) 100%);
			-webkit-background-clip: text;
			background-clip: text;
			-webkit-text-fill-color: transparent;
		}
	}

	.icon-setting-container {
		display: flex;
		align-items: center;
		gap: 4px;
		-webkit-app-region: no-drag;

		::v-deep .el-button.topbar-icon-btn {
			width: 32px;
			height: 32px;
			padding: 0;
			border-radius: 8px;
			color: var(--n-text-color-base);

			i {
				font-size: 16px;
			}

			&:hover {
				background-color: rgba(148, 163, 184, 0.12);
			}
		}

		::v-deep .el-button.sidebar-toggle-btn {
			-webkit-app-region: no-drag;
		}

		.version-btn {
			color: #1de9b6 !important;
			text-shadow: 0 0 7px #1de9b6;
			animation: breathe 2.7s ease-in-out 0s infinite alternate;
			-webkit-animation: breathe 2.7s ease-in-out 0s infinite alternate;
		}
	}
}
</style>
