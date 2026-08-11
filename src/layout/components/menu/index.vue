<template>
	<div class="nx-menu-wrapper" v-context-menu="contextMenus.empty" @contextmenu.stop="handleSessionTreeContainerClick" @click="handleSessionTreeContainerClick">
		<div class="nx-menu-toolbar" @click.stop>
			<el-input v-model="searchKeywords" :placeholder="t('home.host-manager.search.placeholder')" clearable suffix-icon="el-icon-search" />
			<el-popover v-model="createSessionVisible" placement="bottom-end" popper-class="nx-session-popover">
				<template #reference>
					<el-button type="primary" icon="el-icon-plus" circle class="nx-menu-toolbar__create-button" />
				</template>
				<ul class="n-session-mode" @click.prevent="gotoCreateShellSession">
					<li class="n-session-mode__item" data-type="ssh">
						<n-icon name="ssh" />
						SSH
					</li>
					<li class="n-session-mode__item" data-type="ftp">
						<n-icon name="s-ftp" />
						FTP
					</li>
					<li class="n-session-mode__item" data-type="telnet">
						<n-icon name="telnet" />
						Telnet
					</li>
					<li class="n-session-mode__item" data-type="serial">
						<n-icon name="serial" />
						Serial
					</li>
					<li class="n-session-mode__item" data-type="rdp">
						<n-icon name="windows" />
						RDP
					</li>
					<li class="n-session-mode__item" data-type="vnc">
						<n-icon name="vnc" />
						Vnc
					</li>
					<li class="n-session-mode__item" data-type="localShell">
						<n-icon name="powershell" />
						LocalShell
					</li>
				</ul>
			</el-popover>
		</div>
		<el-scrollbar class="nx-menu-scrollbar">
			<el-tree
				v-show="menuTree.length > 0"
				ref="sessionTreeRef"
				node-key="id"
				icon-class="empty"
				draggable
				:highlight-current="menuProps.highlightCurrent"
				:data="menuTree"
				:props="{ children: 'children', label: 'text' }"
				:filter-node-method="menuSearch"
				:empty-text="t('home.host-manager.session-tree.no-search-result')"
				@node-contextmenu="nodeContextmenu"
				@node-drop="handleNodeDrop"
				@node-click="handleNodeSelected"
			>
				<template v-slot="{ node, data: { type, icon, data } }">
					<span class="custom-tree-node" :class="{ 'is-folder': type === 'folder', 'is-node': type === 'node' }" @dblclick.stop="handleHostOpen(data)">
						<template v-if="type === 'folder'">
							<n-space class="session-tree-item" size="8">
								<n-icon :name="`${node.expanded ? 'folder-client-open' : 'folder-client'}`" />
								<span class="session-tree-item__label" :title="node.label || '-'">{{ node.label }}</span>
							</n-space>
						</template>
						<template v-else>
							<n-space class="session-tree-item" size="8">
								<n-icon :name="icon" class-name="session-tree-item__icon" />
								<span class="session-tree-item__label" :title="node.label || '-'">{{ node.label }}</span>
							</n-space>
						</template>
					</span>
				</template>
			</el-tree>
			<el-empty v-show="menuTree.length === 0" :description="t('home.host-manager.session-tree.no-session-data')" />
		</el-scrollbar>
		<!--编辑文件夹-->
		<nx-folder-dialog ref="folderDialogRef" />
		<!-- 编辑及新建会话弹窗 -->
		<component ref="sessionModalRef" :is="sessionModal" />
	</div>
</template>

<script setup>
import { SESSION_CONFIG_TYPE } from "@/services/sessionMgr"
import { subscript, unsubscript } from "@/services/eventbus"
import NxFolderDialog from "./components/FolderDialog.vue"
import NSpace from "@/components/space"
import { showContextMenu } from "@/components/menu/contextmenu"
import { storeToRefs } from "pinia"
import { useNxTabsStore, useSessionStore } from "@/store"
import { getCurrentInstance, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from "vue"
import { useI18n } from "vue-i18n-bridge"
import { shellModalInstance } from "@/views/components/session"
import { NxButton } from "@/components"

const sessionTreeRef = ref()
const folderDialogRef = ref()
const sshModalRef = ref()
const { t } = useI18n()
const menuProps = reactive({
	highlightCurrent: false,
	expandedKeys: []
})
const nxTabStore = useNxTabsStore()
const sessionStore = useSessionStore()
const {} = storeToRefs(nxTabStore)
const { menuTree, currentNode } = storeToRefs(sessionStore)
const proxy = getCurrentInstance().proxy
const sessionManager = proxy.$sessionManager
const sessionModal = shallowRef()
const sessionModalRef = ref()
const searchKeywords = ref("")
const createSessionVisible = ref(false)
const createFolder = (name) => {
	folderDialogRef.value?.show(name)
}

const openSessionPropertyModal = (payload = {}) => {
	const sessionId = payload.sessionId
	if (!sessionId) {
		return
	}
	const sessionConfig = sessionManager.getSessionConfigById(sessionId)
	const protocol = payload.protocol || sessionConfig?.config?.protocal || sessionConfig?.config?.sessType
	sessionModal.value = shellModalInstance(protocol)
	nextTick(() => sessionModalRef.value?.showModal(sessionId))
}

const clipboard = reactive({
	data: null,
	operate: ""
})

const handleOpenSFTP = (data) => {
	sessionManager.createSFTPSessionInstance(data)
}

// 复制/剪切会话
const menuClipboard = (type) => {
	clipboard.operate = type
	clipboard.data = currentNode.value.sessionData
}

// 粘贴会话
const handleSessionTreeContextMenu_Paste = () => {
	try {
		const { data, operate } = clipboard
		if (!data) {
			return
		}
		let sessionConfig = sessionManager.getSessionConfigById(data?.id)
		if (!sessionConfig) {
			console.warn("source session config is null")
			return
		}
		if (operate === "cut") {
			sessionConfig._parent.removeSubSessionConfig(sessionConfig, true)
		} else {
            sessionConfig = sessionConfig.duplicate()
            sessionConfig.name = `${sessionConfig.name} (Copy)`
        }
		sessionStore.appendSessionConfig(sessionConfig)
	} catch (error) {
		console.error("剪切复制异常", error)
		return null
	} finally {
		// 当前只粘贴一次，避免不必要的麻烦
		clipboard.data = null
		clipboard.operate = ""
	}
}

/**
 * 删除会话或者会话目录
 */
const handleDelete = (sessionId) => {
	const sessionConfig = sessionManager.getSessionConfigById(sessionId)
	const message =
		sessionConfig.type === SESSION_CONFIG_TYPE.NODE
			? t("home.host-manager.dialog-delete-confirm.delete-node", [sessionConfig.name])
			: t("home.host-manager.dialog-delete-confirm.delete-folder", [sessionConfig.name])
	proxy
		?.$confirm(message, t("home.host-manager.dialog-delete-confirm.title"), {
			type: "warning"
		})
		.then(() => {
			sessionManager.removeSessionConfig(sessionConfig)
			handleSessionTreeContainerClick()
			sessionStore.updateProcess()
		})
}
/**
 * 编辑文件夹
 */
const renameFolder = () => folderDialogRef.value?.show(currentNode.value.sessionId)
/**
 * 打开会话
 *
 * @param sessionData
 * @return {Promise<void>}
 */
const handleHostOpen = async (sessionData) => {
	if (sessionData.type === SESSION_CONFIG_TYPE.FOLDER) {
		// 目录节点不启动会话实例
		return
	}
	await sessionManager.createSessionInstance(sessionData)
}

/**
 * 导出配置文件
 *
 * @returns 导出的配置文件
 */
async function exportSessionConfig() {
	const coreService = powertools.getService("powertools-core")
	const selectedFiles = await coreService.showSaveDialog({
		properties: ["openFile"]
	})

	if (selectedFiles.canceled) {
		return
	}

	const filePath = selectedFiles.filePath
	try {
		await sessionManager.exportConfig(filePath)
	} catch (e) {
		console.log("export config error ", e)
	}
}

/**
 * 导入配置文件
 *
 */
async function importSessionConfig() {
	const coreService = powertools.getService("powertools-core")
	const selectedFiles = await coreService.showOpenDialog({
		properties: ["openFile"]
	})

	if (selectedFiles.canceled) {
		return
	}

	const filePath = selectedFiles.filePaths[0]

	try {
		await sessionManager.importConfig(filePath)
		sessionStore.updateProcess()
	} catch (e) {
		console.log("import config error ", e)
	}
}

const createShellModal = (type) => {
	sessionModal.value = shellModalInstance(type)
	nextTick(() => sessionModalRef.value?.showModal())
}

const gotoCreateShellSession = (event) => {
	const sessionItem = event.target.closest("[data-type]")
	const type = sessionItem?.dataset?.type || "ssh"
	createSessionVisible.value = false
	createShellModal(type)
}

const createSessionSubmenu = () => [
	{
		label: "SSH",
		icon: "ssh",
		type: "normal",
		handler: () => createShellModal("ssh")
	},
	{
		label: "FTP",
		icon: "s-ftp",
		type: "normal",
		handler: () => createShellModal("ftp")
	},
	{
		label: "Telnet",
		icon: "telnet",
		type: "normal",
		handler: () => createShellModal("telnet")
	},
	{
		label: "Serial",
		icon: "serial",
		type: "normal",
		handler: () => createShellModal("serial")
	},
	{
		label: "RDP",
		icon: "windows",
		type: "normal",
		handler: () => createShellModal("rdp")
	},
	{
		label: "Vnc",
		icon: "vnc",
		type: "normal",
		handler: () => createShellModal("vnc")
	},
	{
		label: "LocalShell",
		icon: "powershell",
		type: "normal",
		handler: () => createShellModal("localShell")
	}
]

const contextMenus = {
	folder: [
		{
			label: "home.sessions-context-menu.create-folder",
			type: "normal",
			handler: createFolder
		},
		{
			label: "home.sessions-context-menu.create-session",
			type: "submenu",
			submenu: createSessionSubmenu()
		},
		{
			label: "home.sessions-context-menu.cut",
			type: "normal",
			handler: () => menuClipboard("cut")
		},
		{
			label: "home.sessions-context-menu.copy",
			type: "normal",
			handler: () => menuClipboard("copy")
		},
		{
			label: "home.sessions-context-menu.paste",
			type: "normal",
			handler: handleSessionTreeContextMenu_Paste
		},
		{
			label: "home.sessions-context-menu.delete",
			type: "normal",
			handler: () => handleDelete(currentNode.value.sessionId)
		},
		{
			label: "home.sessions-context-menu.rename",
			type: "normal",
			handler: renameFolder
		}
	],
	node: [
		{
			label: "home.sessions-context-menu.connect",
			type: "normal",
			handler: () => handleHostOpen(currentNode.value.sessionData.data)
		},
		{
			label: "home.sessions-context-menu.cut",
			type: "normal",
			handler: () => menuClipboard("cut")
		},
		{
			label: "home.sessions-context-menu.copy",
			type: "normal",
			handler: () => menuClipboard("copy")
		},
		{
			label: "home.sessions-context-menu.delete",
			type: "normal",
			handler: () => handleDelete(currentNode.value.sessionId)
		},
		{
			label: "home.sessions-context-menu.prop",
			type: "normal",
			handler: () => {
				const { sessionId, protocol } = currentNode.value
				sessionModal.value = shellModalInstance(protocol)
				nextTick(() => sessionModalRef.value?.showModal(sessionId))
			}
		}
	],
	empty: [
		{
			label: "home.sessions-context-menu.create-folder",
			type: "normal",
			handler: createFolder
		},
		{
			label: "home.sessions-context-menu.create-session",
			type: "submenu",
			submenu: createSessionSubmenu()
		},
		{
			label: "home.sessions-context-menu.save-config",
			type: "normal",
			handler: exportSessionConfig
		},
		{
			label: "home.sessions-context-menu.import-config",
			type: "normal",
			handler: importSessionConfig
		}
	]
}

const handleNodeDrop = async (source, parentNode, position) => {
	const targetSession = sessionManager.getSessionConfigById(parentNode.data.data._id)
	const sourceNode = sessionManager.getSessionConfigById(source.data.data._id)
	sourceNode._parent.removeSubSessionConfig(sourceNode, true)
	if (position === "inner") {
		targetSession.addSessionConfig(sourceNode)
	} else {
		const { index } = targetSession._parent.findSubSessionConfig(parentNode.data.data._id)
		const destIndex = index + (position === "before" ? 0 : 1)
		targetSession._parent.addSessionConfig(sourceNode, destIndex)
	}
	await sessionManager.saveSessionConfigs()
	sessionStore.updateProcess()
}

/**
 * 树容器操作
 */
const handleSessionTreeContainerClick = () => {
	sessionStore.updateCurrentNode(sessionTreeRef.value)
	menuProps.highlightCurrent = false
}

const handleNodeSelected = (data, node, _vnode, _element) => {
	// 修复由于当前文件夹下子元素为0 导致tree无法触发原有打开关闭事件
	if (data.isFolder && data.children.length === 0) node.expanded = !node.expanded
	const { data: sessionData } = data
	sessionStore.updateCurrentNode(sessionTreeRef.value, node, data)
	if (data.isFolder) {
		// 目录节点不启动会话实例
		return
	}
	// 尝试激活会话实例窗口
	const sessionInstance = sessionManager.matchSessionInstanceByConfig(sessionData)
	if (!sessionInstance) {
		// 没有匹配到则创建新的实例
		return
	}

	nextTick(() => {
		nxTabStore.activateSessionByInstance(sessionInstance[0])
	})
}

const nodeContextmenu = (event, data, node, _vnode) => {
	sessionStore.updateCurrentNode(sessionTreeRef.value, node, data)
	const { type: nodeType } = data.data
	let menuContent = []
	if (data.isFolder) {
		menuContent = contextMenus.folder
	}

	if (nodeType === SESSION_CONFIG_TYPE.NODE) {
		// TODO: 获取SessionConfig的状态，过滤掉一些无用状态
		const contextMenu = [...contextMenus.node]
		const { data } = currentNode.value.sessionData
		if (data.config.protocal === "ssh") {
			contextMenu.unshift({
				label: "home.sessions-context-menu.sftp",
				type: "normal",
				handler: () => handleOpenSFTP(data)
			})
		}
		menuContent = contextMenu
	}
	showContextMenu(menuContent, event)
}

const menuSearch = (value, data) => {
	if (!value) return true
	return data.text.indexOf(value) !== -1
}

watch(searchKeywords, (keywords) => {
	sessionTreeRef.value?.filter(keywords)
})

onMounted(() => {
	// 订阅新建文件夹事件
	subscript("create-session-folder", () => createFolder())
	// 订阅菜单刷新事件
	subscript("refresh-session-tree", () => sessionStore.updateProcess())
	// 订阅会话创建事件
	// subscript('create-session-toolbar', () => telnetModalRef.value?.showModal())
	subscript("create-session-toolbar", (type) => createShellModal(type))
	subscript('open-session-property', openSessionPropertyModal)
	nextTick(() => sessionStore.updateCurrentNode(sessionTreeRef.value))
})
onBeforeUnmount(() => {
	// 订阅新建文件夹事件
	unsubscript("create-session-folder", () => createFolder())
	// 订阅菜单刷新事件
	unsubscript("refresh-session-tree", () => sessionStore.updateProcess())
	// 订阅会话创建事件
	unsubscript("create-session-toolbar", () => sshModalRef.value?.showModal())
	unsubscript('open-session-property', openSessionPropertyModal)
})
</script>

<style lang="scss" scoped>
//::v-deep .collapse-transition{
//  transition: none !important;
//}
.nx-menu-wrapper {
	position: relative;
	display: flex;
	flex-direction: column;
	height: 100%;
	background-color: var(--n-bg-color-base);
	padding: 6px 0 0;

	.nx-menu-toolbar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 10px 10px;

		::v-deep .el-input {
			flex: 1;
		}

		::v-deep .el-input__wrapper,
		::v-deep .el-input__inner {
			border: 1px solid rgba(56, 189, 248, 0.12);
			border-radius: 12px;
			background-color: rgba(15, 23, 42, 0.5);
			color: var(--n-text-color-base);
			box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
		}

		::v-deep .el-input__inner {
			height: 40px;
			padding-left: 14px;
			padding-right: 38px;
			font-size: 13px;
			text-align: left;
		}

		::v-deep .el-input__prefix,
		::v-deep .el-input__suffix {
			color: rgba(148, 163, 184, 0.88);
		}

		&__create-button {
			width: 36px;
			height: 36px;
			padding: 0;
			border: 1px solid var(--n-button-primary);
			background: var(--n-button-primary);
			box-shadow: none;

			&:hover,
			&:focus {
				background: var(--n-button-primary-hover);
				border-color: var(--n-button-primary-hover);
			}
		}
	}

	.nx-menu-scrollbar {
		flex: 1;
		min-height: 0;
	}

	.el-empty {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);

		.el-empty__description {
			p {
				color: var(--n-text-color-base);
			}
		}
	}

	.pt-tree {
		.nx-menu-item {
			padding-top: 5px;
			padding-right: 3px;
			padding-left: 4px;

			.pt-tree-item {
				border-radius: 4px;
				color: var(--n-text-color-base);

				.session-extend {
					display: inline-flex;
					align-items: center;
					justify-content: center;
					column-gap: 5px;
					box-sizing: border-box;
					border-radius: 4px;
				}
			}
		}
	}

	.n-content-menu {
		position: absolute;
		top: 0;
		left: 0;
		color: #ffffff;
		padding: 10px;
		border-radius: 4px;

		background-color: var(--n-color-modal);
	}
}

.n-session-mode {
	min-width: 118px;
	padding: 6px;
	border: 1px solid var(--n-hover-bg-color);
	border-radius: 12px;
	background-color: var(--n-select-bg-color);
	box-shadow: 0 10px 28px rgba(0, 0, 0, 0.22);

	&__item {
		display: flex;
		justify-content: flex-start;
		align-items: center;
		column-gap: 10px;
		padding: 8px 10px;
		border-radius: 8px;
		font-size: 13px;
		font-weight: 500;
		color: var(--n-text-color-light);
		transition: background-color 0.18s ease, color 0.18s ease;

		::v-deep .n-icon {
			width: 16px;
			font-size: 16px;
			color: var(--n-text-color-base);
		}

		&:hover {
			cursor: pointer;
			color: var(--n-text-color-base);
			background-color: var(--n-select-hover-bg-color);
		}
	}
}

::v-deep .nx-session-popover.el-popover {
	padding: 0;
	border: 0;
	background: transparent;
	box-shadow: none;
	margin-bottom: 6px;
}

::v-deep .el-tree {
	color: var(--n-text-color-base);
	background-color: var(--n-bg-color-base);
	padding: 2px 6px 2px 8px;
	margin-right: 6px;

	&.el-tree--highlight-current {
		.el-tree-node.is-current > .el-tree-node__content {
			background-color: var(--n-hover-bg-color);
		}
	}

	.el-tree-node {
		&:focus,
		&:hover {
			> .el-tree-node__content {
				background-color: transparent;

				.custom-tree-node {
					.session-extend {
						display: inline-flex;
					}
				}
			}
		}

		.custom-tree-node {
			display: flex;
			justify-content: space-between;
			align-items: center;
			width: 100%;
			gap: 8px;
			height: 32px;

			&.is-folder {
				padding-right: 2px;
			}

			&.is-node {
				padding-right: 2px;
			}

			.session-tree-item {
				display: flex;
				align-items: center;
				gap: 8px;
				min-width: 0;
				color: var(--n-text-color-base);

				&__icon {
					flex-shrink: 0;
					font-size: 18px;
				}

				&__name {
					font-size: 13px;
					font-weight: 500;
				}

				&__label {
					min-width: 0;
					overflow: hidden;
					text-overflow: ellipsis;
					white-space: nowrap;
					font-size: 13px;
					font-weight: 500;
					color: var(--n-text-color-base);
				}
			}

			.session-extend {
				display: none;
				align-items: center;
				justify-content: center;
				column-gap: 5px;
				box-sizing: border-box;
				border-radius: 4px;
			}
		}

		.el-tree-node__content {
			height: 32px;
			padding: 0;

			.el-tree-node__expand-icon {
				font-size: 16px;
				color: rgba(148, 163, 184, 0.8);
				padding: 7px 4px;
			}
		}

		&.is-current > .el-tree-node__content,
		&:hover > .el-tree-node__content {
			background-color: var(--n-hover-bg-color);
		}
	}
}
</style>
