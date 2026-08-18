<template>
	<div class="xterm-instance" :style="{ 'background-color': backgroundColor }" @mousedown.middle="handleSelectPaste">
		<div v-show="showSessionToolbar" class="session-toolbar">
			<span class="host-url">{{ currentSessionInfo.url }}</span>
			<el-tooltip class="item" effect="dark" :content="$t('home.session-instance.duplicate-session')" placement="top-start">
				<span class="btn" @click="copySession">
					<i class="el-icon-copy-document" />
				</span>
			</el-tooltip>
			<el-tooltip class="item" effect="dark" :content="$t('home.session-instance.reconnect')" placement="top-start">
				<span class="btn" @click="reconSession">
					<i class="el-icon-refresh" />
				</span>
			</el-tooltip>
			<el-tooltip v-if="showFileTransferActions" class="item" effect="dark" :content="$t('home.session-instance.SFTP')" placement="top-start">
				<span class="btn" @click="openSFTP">
					<i class="el-icon-folder-opened" />
				</span>
			</el-tooltip>
			<el-tooltip v-if="showFileTransferActions" class="item" effect="dark" :content="tunnelTitle" placement="top-start">
				<span class="btn" :class="{ active: isTunnelActive }" @click="openTunnel">
					<i class="el-icon-position" />
				</span>
			</el-tooltip>
		</div>
		<PtXterm
			class="xterm-pt"
			:style="xtermHeightStyle"
			ref="xterm"
			:sendToAllTerm="keyboardToAll"
			@xterm-focus="xtermFocus"
			@sendToAll="openSendAll"
			@line-data="handleLog"
			@file-drop="handleFileDrop"
			@link="openLink"
			@key="onXtermKey"
			@termdata="onXtermData"
			@resize="onXtermResize"
			@titleChange="onTitleChange"
			@shortcut="handleShortCutEvent"
			v-context-menu="xtermMenu"
			:options="options"
		/>
		<pt-auth-dialog ref="dialog" @authOk="handleAuthOk" />
	</div>
</template>

<script>
import path from "path"
import xtermTheme from "xterm-theme"
import PtAuthDialog from "../components/auth/auth"
import { getProfile } from "@/services/globalSetting"
import * as EventBus from "../../services/eventbus"
import { PtXterm } from "@/components"
import { xzmodem } from "./xzmodem.js"
import { create_iconv } from "./iconv.js"
import { createLogger } from "@/services/nxsys/logger"
import mousetrap from "mousetrap"
import { mapState, mapStores } from "pinia"
import { useSessionStore } from "@/store"

export default {
	name: "XtermInstance",
	components: {
		PtXterm,
		PtAuthDialog
	},
	props: {
		sessionInstanceId: {
			type: Number,
			required: true
		}
	},

	data() {
		return {
			mousetrap: null,
			tunnelMapTitle: {},
			tunnelMapPort: {},
			showSessionToolbar: !getProfile("xterm")?.hideSessionShortcutBar,
			backgroundColor: "#000",
			isComponentAlive: true,
			sessionInstance: null,
			currentDirectory: "",
			pendingCwdRequest: null,
			enableSendToAllTerm: false,
			xtermMenu: [
				{
					label: "home.session-instance.context-menu.copy",
					type: "normal",
					accelerator: "Alt + C",
					handler: this.handleCopy
				},
				{
					label: "home.session-instance.context-menu.paste",
					type: "normal",
					accelerator: "Alt + V",
					handler: this.handlePaste
				},
				{
					label: "home.session-instance.context-menu.select-paste",
					type: "normal",
					accelerator: "Alt + S",
					handler: this.handleSelectPaste
				},
				{
					label: "home.session-instance.context-menu.search",
					type: "normal",
					handler: this.handleSearch
				},
				{
					label: "home.session-instance.context-menu.fullscreen",
					type: "normal",
					accelerator: "Alt + Enter",
					handler: this.handleFullscreen
				},
				{
					label: "home.session-instance.context-menu.log-manager",
					type: "submenu",
					submenu: [
						{
							label: "home.session-instance.context-menu.open-log",
							type: "normal",
							handler: this.openLog
						},
						{
							label: "home.session-instance.context-menu.close-log",
							type: "normal",
							handler: this.closeLog
						},
						{
							label: "home.session-instance.context-menu.log-editor",
							type: "normal",
							handler: this.openLogFileByEditor
						},
						{
							label: "home.session-instance.context-menu.log-folder",
							type: "normal",
							handler: this.openLogFileInFolder
						}
					]
				},
				{
					label: "home.session-instance.context-menu.find",
					type: "normal",
					accelerator: "Alt + F",
					handler: this.handleFind
				},
				{
					type: "separator"
				},
				{
					label: "home.session-instance.context-menu.screen-split",
					type: "submenu",
					submenu: [
						{
							label: "home.session-instance.context-menu.split-row",
							type: "normal",
							handler: this.split_row
						},
						{
							label: "home.session-instance.context-menu.split-column",
							type: "normal",
							handler: this.split_col
						},
						{
							label: "home.session-instance.context-menu.split-grid",
							type: "normal",
							handler: this.split_grid
						},
						{
							label: "home.session-instance.context-menu.split-normal",
							type: "normal",
							handler: this.split_normal
						}
					]
				},
				{
					label: "home.session-instance.context-menu.send-all",
					type: "submenu",
					submenu: [
						{
							label: "home.session-instance.context-menu.send-many",
							type: "normal",
							handler: this.send_many
						},
						{
							label: "home.session-instance.context-menu.send-one",
							type: "normal",
							handler: this.send_one
						}
					]
				},
				{
					label: "home.session-instance.context-menu.select-all",
					type: "normal",
					accelerator: "Alt + A",
					handler: this.handleSelectAll
				},
				{
					label: "home.session-instance.context-menu.property",
					type: "normal",
					handler: this.handleProperty
				}
			],
			options: {}
		}
	},

	mounted() {
		this.init()
		EventBus.subscript("toggle-session-shortcut-bar", this.handleToggleShortcutBarEvent)
	},

	beforeDestroy() {
		EventBus.unsubscript("toggle-session-shortcut-bar", this.handleToggleShortcutBarEvent)
		this.isComponentAlive = false
	},

	computed: {
		...mapStores(useSessionStore),
		...mapState(useSessionStore, ["keyboardToAll"]),
		currentSessionInfo() {
			const currentSessionInfo = {
				url: ""
			}
			if (this.sessionInstanceId === -1) {
				return currentSessionInfo
			}
			const sessionConfig = this.$sessionManager.getSessionConfigByInstanceId(this.sessionInstanceId)
			if (!sessionConfig) {
				return currentSessionInfo
			}

			currentSessionInfo.url = this.genrateUrlBySessionCfg(sessionConfig.config)
			return currentSessionInfo
		},
		toolbarShow() {
			const sessionConfig = this.$sessionManager.getSessionConfigByInstanceId(this.sessionInstanceId)
			return sessionConfig && sessionConfig.config.protocal === "ssh"
		},
		showFileTransferActions() {
			const sessionConfig = this.$sessionManager.getSessionConfigByInstanceId(this.sessionInstanceId)
			return sessionConfig?.config?.protocal === "ssh"
		},
		isTunnelActive() {
			return !!this.tunnelMapPort[this.sessionInstanceId]
		},
		tunnelTitle() {
			return this.tunnelMapTitle[this.sessionInstanceId] ? this.tunnelMapTitle[this.sessionInstanceId] : this.$t("home.session-instance.tunnel")
		},
		xtermHeightStyle() {
			return {
				height: this.showSessionToolbar ? "calc(100% - 40px)" : "100%"
			}
		}
	},

	watch: {
		$route: {
			handler(route) {
				if (route.name === "XTermSession") {
					this.$refs.xterm?.onFocus("focus")
					this.$refs.xterm?.currentSize()
				}
			}
		}
	},

	methods: {
		emitXterm(eventName, payload) {
			if (!this.isComponentAlive) {
				return false
			}

			const xtermRef = this.$refs?.xterm
			if (!xtermRef || typeof xtermRef.$emit !== "function") {
				return false
			}

			xtermRef.$emit(eventName, payload)
			return true
		},
		showDialog(payload) {
			if (!this.isComponentAlive) {
				return false
			}

			const dialogRef = this.$refs?.dialog
			if (!dialogRef || typeof dialogRef.show !== "function") {
				return false
			}

			dialogRef.show(payload)
			return true
		},
		xtermFocus() {
			// EventBus.publish("updateTabBySessionId", this.sessionInstanceId)
		},
		genrateUrlBySessionCfg(config) {
			let url = ""
			if (config.protocal === "ssh") {
				const { hostAddress, hostPort, username, password, authType } = config
				// URL对于SSH这种自定义protocol的解析都是当做类似file的解析方式
				// 为了更方便的处理，这里先用http代替protocol ssh
				let sessionURL = {}
				try {
					sessionURL = new URL(`http://${hostAddress || "localhost"}`)
				} catch (e) {
					sessionURL.href = `ssh://${username}:****@${hostAddress}:${hostPort}`
				}

				sessionURL.port = hostPort || 22
				if (username) {
					sessionURL.username = username
				}
				if (authType === "password" && password) {
					sessionURL.password = "*".padStart(4, "*")
				}
				// 把输出的http协议转换为ssh
				url = sessionURL.href.replace("http", "ssh")
			} else if (config.protocal === "telnet") {
				const { hostAddress, hostTelnetPort, username, password } = config
				url = `telnet://${hostAddress}:${hostTelnetPort}`
			} else if (config.protocal === "localshell") {
				url = "LocalShell Tool"
			} else {
				// serial protocol
				const { port } = config
				url = `serial@${port}`
			}
			return url
		},
		copySession() {
			let sessionInstance = this.$sessionManager.getSessionInstanceById(this.sessionInstanceId)
			if (!sessionInstance) {
				return
			}
			this.$sessionManager.duplicateSshInstance(sessionInstance)
		},
		async reconSession() {
			let sessionInstance = this.$sessionManager.getSessionInstanceById(this.sessionInstanceId)
			if (!sessionInstance) {
				return
			}
			await sessionInstance.refresh()
		},
		handleToggleShortcutBarEvent(payload) {
			if (!payload || payload.sessionId !== this.sessionInstanceId) {
				return
			}
			if (typeof payload.visible === "boolean") {
				this.showSessionToolbar = payload.visible
			} else {
				this.showSessionToolbar = !this.showSessionToolbar
			}
			this.$nextTick(() => {
				this.$refs?.xterm?.currentSize?.()
			})
		},

		async openTunnel() {
			const sessionInstance = this.$sessionManager.getSessionInstanceById(this.sessionInstanceId)
			try {
				const port = await sessionInstance.openTunnel()
				if (port) {
					const proxyAddress = `socks5://127.0.0.1:${port}`
					powertools.clipboardWriteText(proxyAddress)
					this.$set(this.tunnelMapPort, this.sessionInstanceId, port)
					this.updateTunnelTitle(this.sessionInstanceId, this.$t("home.session-instance.tunnel-success", [port]))
					this.$message.success(`${this.$t('components.copy-success')} ${proxyAddress}`)
				} else {
					this.$delete(this.tunnelMapPort, this.sessionInstanceId)
					this.updateTunnelTitle(this.sessionInstanceId, this.$t("home.session-instance.tunnel"))
				}
			} catch (err) {
				const message = err?.message || this.$t('home.session-instance.tunnel-open-failed-default')
				this.$delete(this.tunnelMapPort, this.sessionInstanceId)
				this.updateTunnelTitle(this.sessionInstanceId, this.$t("home.session-instance.tunnel"))
				this.$message.error(this.$t('home.session-instance.tunnel-open-failed', [message]))
			}
		},

		updateTunnelTitle(id, title) {
			this.$set(this.tunnelMapTitle, id, title)
		},

		async openSFTP() {
			// get reconnid
			let connId = -1
			let sessionInstance = null
			try {
				sessionInstance = this.$sessionManager.getSessionInstanceById(this.sessionInstanceId)
				connId = await sessionInstance.getTermConnId()
			} catch (e) {
				console.log("openSFTP ssh instance error ", e)
				return
			}

			const sessionConfig = this.$sessionManager.getSessionConfigByInstanceId(this.sessionInstanceId)
			let sftCfg = { ...sessionConfig }
			if (sessionConfig?.config?.protocal === "ssh" && this.isMacOSSession(sessionConfig)) {
				await this.requestCurrentDirectoryFromShell(sessionInstance)
			}
			const sftpDirt = this.getSftpOpenDirectory(this.currentDirectory || this.title, sftCfg.config.sftpDirt)
			sftCfg.config = { ...sftCfg.config, sftpDirt: sftpDirt, connId: connId }
			await this.$sessionManager.createSFTPSessionInstance(sftCfg)
		},
		isMacOSSession(sessionConfig) {
			const system = sessionConfig?.config?.system?.toLowerCase?.() || ""
			return ["mac", "macos", "darwin", "osx", "apple"].some((keyword) => system.includes(keyword))
		},
		async requestCurrentDirectoryFromShell(sessionInstance) {
			if (!sessionInstance || !this.iconv_to_charset) {
				return ""
			}

			if (this.pendingCwdRequest) {
				return await this.pendingCwdRequest.promise
			}

			let resolveRequest = null
			const promise = new Promise((resolve) => {
				resolveRequest = resolve
			})

			const timeout = setTimeout(() => {
				if (this.pendingCwdRequest) {
					this.pendingCwdRequest = null
				}
				resolveRequest(this.currentDirectory || "")
			}, 1200)

			this.pendingCwdRequest = {
				buffer: "",
				resolve: (cwd) => {
					clearTimeout(timeout)
					this.pendingCwdRequest = null
					resolveRequest(cwd)
				},
				promise
			}

			// Ask the active interactive shell to print a unique marker-wrapped pwd result.
			this.iconv_to_charset.write("printf '__NXSHELL_CWD_BEGIN__%s__NXSHELL_CWD_END__\\n' \"$PWD\"\r")

			return await promise
		},
		captureCurrentDirectoryFromShellOutput(data) {
			if (!this.pendingCwdRequest) {
				return
			}

			const chunk = typeof data === "string" ? data : data?.toString?.("utf8") || ""
			if (!chunk) {
				return
			}

			this.pendingCwdRequest.buffer += chunk
			if (this.pendingCwdRequest.buffer.length > 4096) {
				this.pendingCwdRequest.buffer = this.pendingCwdRequest.buffer.slice(-4096)
			}

			const beginMarker = "__NXSHELL_CWD_BEGIN__"
			const endMarker = "__NXSHELL_CWD_END__"
			const endIndex = this.pendingCwdRequest.buffer.lastIndexOf(endMarker)
			if (endIndex === -1) {
				return
			}

			const beginIndex = this.pendingCwdRequest.buffer.lastIndexOf(beginMarker, endIndex)
			if (beginIndex === -1) {
				return
			}

			const cwd = this.pendingCwdRequest.buffer.slice(beginIndex + beginMarker.length, endIndex).trim()
			if (cwd) {
				this.currentDirectory = cwd
				this.title = cwd
				this.$emit("titleChange", { sessionId: this.sessionInstanceId, title: cwd })
			}

			this.pendingCwdRequest.resolve(cwd)
		},
		getSftpOpenDirectory(title, fallback) {
			const currentPath = this.extractPathFromTerminalTitle(title)
			if (currentPath) {
				return currentPath
			}

			return fallback || "/"
		},
		extractPathFromTerminalTitle(title) {
			if (!title || typeof title !== "string") {
				return ""
			}

			const normalizedTitle = title.trim()
			if (!normalizedTitle) {
				return ""
			}

			const pathMatches = normalizedTitle.match(/(~\/[^\r\n]*)|(\/[^\r\n]*)/g)
			if (!pathMatches || !pathMatches.length) {
				return ""
			}

			return pathMatches[pathMatches.length - 1].trim()
		},
		init() {
			this.sessionInstance = this.$sessionManager.getSessionInstanceById(this.sessionInstanceId)
			let sessionCfg = this.$sessionManager.getSessionConfigByInstanceId(this.sessionInstanceId)
			if (!this.sessionInstance || !sessionCfg || !sessionCfg.config) {
				return
			}
			const globalXtermProfile = getProfile("xterm") || {}

			this.options = {
				...globalXtermProfile,
				...sessionCfg.config,
				fontWeight: this.getFontWeight(sessionCfg.config.fontWeight),
				theme: this.getTheme(sessionCfg.config.xtermTheme || "default"),
				fontFamily: this.getFontFamily(sessionCfg.config.fontFamily || "default")
			}
			// 优化会话窗口背景样式
			if (xtermTheme[this.options?.xtermTheme]) {
				this.backgroundColor = xtermTheme[this.options?.xtermTheme].background
			}

			// charset covert
			this.iconv_charset = sessionCfg.config.charset || "UTF-8"
			// iconv to xterm
			this.iconv_to_uft8 = create_iconv(this.iconv_charset, "UTF-8")
			// iconv to ssh
			this.iconv_to_charset = create_iconv("UTF-8", this.iconv_charset)
			this.iconv_to_charset.on("data", (d) => {
				this.sessionInstance.emit("send_data", d)
			})

			const xzm = this.loadXzmode()
			this.xzm = xzm
			this.sessionInstance.on("data", (data) => {
				this.captureCurrentDirectoryFromShellOutput(data)
				//this.$refs.xterm.$emit("data", data);
				xzm.consume(data)
				this.sessionConnect = true
			})

			this.sessionInstance.on("control", (data) => {
				this.showDialog(data)
			})

			this.sessionConnect = true
			this.sessionInstance.on("error", (data) => {
				this.emitXterm("data", "\r\n")
				this.emitXterm("data", data)
				this.emitXterm("data", "\r\n")
				this.sessionConnect = false
			})

			this.sessionInstance.on("close", () => {
				// destroy ssh instance
				this.$emit("remove-session")
                this.$destroy()
                //this.$el.parentNode.removeChild(this.$el)
			})

			this.sessionInstance.on("active", () => {
				this.emitXterm("focus")
			})

			this.$nextTick(() => {
				this.emitXterm("data", "Hello \x1B[1;3;31mNxShell\x1B[0m !\r\n")
				this.emitXterm("focus")
			})
			this.setupshortcut()
		},
		setupshortcut() {
			if (this.mousetrap) {
				return
			}
			this.mousetrap = new mousetrap(/*this.$refs.xterm*/)
			this.mousetrap.bind("alt+c", (e) => {
				this.handleCopy()
			})
			this.mousetrap.bind("alt+v", (e) => {
				this.handlePaste()
			})
			this.mousetrap.bind("alt+s", (e) => {
				this.handleSelectPaste()
			})
			this.mousetrap.bind("alt+f", (e) => {
				this.handleFind()
			})
			this.mousetrap.bind("alt+Enter", (e) => {
				this.handleFullscreen()
			})
			this.mousetrap.bind("alt+a", (e) => {
				this.handleSelectAll()
			})
			this.mousetrap.bind("alt+-", (e) => {
				this.handleZoomIn()
			})
			this.mousetrap.bind("alt+=", (e) => {
				this.handleZoomOut()
			})
			this.mousetrap.bind("alt+0", (e) => {
				this.handleZoomOver()
			})
		},
		handleShortCutEvent(evt) {
			if (this.mousetrap) {
				this.mousetrap.trigger(evt)
			}
		},
		handleAuthOk(data) {
			this.sessionInstance.sendControlData(data)
			this.$nextTick(() => {
				this.$refs.xterm.focus()
			})

			let newConfig = null
			if (data.type === "password") {
				newConfig = {
					authType: "password",
					username: data.username,
					password: data.password
				}
			} else if (data.type === "publickey") {
				newConfig = {
					authType: "cert",
					username: data.username,
					passphrase: data.passphrase,
					cert: data.publickey
				}
			}

			if (newConfig) {
				this._updateConfig(newConfig)
			}
		},
		_updateConfig(newConfig) {
			function merge(dest, src) {
				Object.keys(src).forEach((key) => {
					dest[key] = src[key]
				})
				return dest
			}

			// update config data
			let sessionCfg = this.$sessionManager.getSessionConfigByInstanceId(this.sessionInstanceId)
			if (sessionCfg) {
				let oldConfig = merge(sessionCfg.config, newConfig)
				sessionCfg.update(oldConfig.hostName, oldConfig, "")
			}
		},
		loadXzmode() {
            let that = this
			const sendTo = async (data) => {
				//console.log('sendTo data with ', data);
				this.sessionInstance.emit("send_data", data)
			}

			this.iconv_to_uft8.on("data", (d) => {
				that.$nextTick(() => 
                {
					that.emitXterm("data", d)
                })
			})

			const write = async (data) => {
				this.iconv_to_uft8.write(data)
			}
			return new xzmodem({ sendTo, write })
		},
		onXtermKey(e) {
			const event = e.domEvent
			if (event.ctrlKey && event.key === "c") {
				this.xzm.handleInterrupt()
			} else if (!this.sessionConnect) {
				if (event.key === "Enter") {
					this.sessionInstance.refresh()
				}
			}
		},
		async handleFileDrop(files) {
			for (let i = 0; i < files.length; i++) {
				let file = files[i]
				try {
					let type = file.isDir ? "dir" : "file"
					await this.xzm.dropFile(file.path)
				} catch (err) {
					console.log("file drop error ", err)
				}
			}
		},
		onXtermData(data) {
			if (this.sessionConnect) {
				this.iconv_to_charset.write(data)
				if (this.enableSendToAllTerm) {
					this.sendToAllTerm(data)
				}
			} else {
				console.log("ssh disconnected ", data)
			}
		},
		onXtermResize(cols, rows) {
			this.sessionInstance && this.sessionInstance.emit("resize", cols, rows)
		},
		onTitleChange(title) {
			const currentPath = this.extractPathFromTerminalTitle(title)
			this.title = currentPath
			this.$emit("titleChange", { sessionId: this.sessionInstanceId, title: currentPath })
		},
		handleCopy() {
			let s = this.$refs.xterm.getSelection()
			if (!s) {
				return
			}
			powertools.clipboardWriteText(s)
			this.$nextTick(() => {
				this.$refs.xterm.focus()
			})
		},
		handlePaste() {
			let s = powertools.clipboardReadText()
			if (!s) {
				return
			}
			this.$refs.xterm.pasteText(s)
			this.$nextTick(() => {
				this.$refs.xterm.focus()
			})
		},
		handleSelectPaste() {
			let s = this.$refs.xterm.getSelection()
			if (!s) {
				return
			}
			this.$refs.xterm.pasteText(s)
			this.$nextTick(() => {
				this.$refs.xterm.focus()
			})
		},
		handleZoomIn() {
			this.$refs.xterm.zoom_in()
		},
		handleZoomOut() {
			this.$refs.xterm.zoom_out()
		},
		handleZoomOver() {
			this.$refs.xterm.zoom_over()
		},
		handleSelectAll() {
			this.$refs.xterm.selectAll()
		},
		handleProperty() {
			let sessionId = this.sessionInstance.getId()
			let sessionCfg = this.$sessionManager.getSessionConfigByInstanceId(sessionId)
			if (!sessionCfg) {
				return
			}
			EventBus.publish('open-session-property', {
				sessionId: sessionCfg._id,
				protocol: sessionCfg.config?.protocal || sessionCfg.config?.sessType
			})
		},
		send_many() {
			this.sessionStore.updateSendToAllXterm(true)
		},
		send_one() {
			this.sessionStore.updateSendToAllXterm(false)
			this.keyboardToAll = false
			EventBus.remove("xterm-send-to-all")
		},
		handleSearch() {
			let s = this.$refs.xterm.getSelection()
			if (!s) {
				return
			}
			let uri = "https://cn.bing.com/search?q=" + s
			this.openLink(uri)
		},
		async handleFullscreen() {
			try {
				EventBus.publish("enter-fullscreen", "open")
			} catch (e) {
				//pass
				console.log("handle full screen error ", e)
			}
			this.$refs?.xterm.focus()
		},
		openLink(uri) {
			powertools.openExterUrl(uri)
		},

		getTheme(themeName) {
			const globalXtermProfile = getProfile("xterm") || {}
			let theme = {}
			if (themeName === "default") {
				themeName = globalXtermProfile.xtermTheme
			}
			if (themeName !== "default") {
				theme = xtermTheme[themeName]
			}
			if (["Tomorrow", "Spring"].indexOf(themeName) >= 0) {
				// Fix selection no effect
				theme.selection = theme.brightBlack
			}
			return theme
		},

		getFontWeight(size) {
			const globalXtermProfile = getProfile("xterm") || {}
			size = size === "default" ? globalXtermProfile.fontWeight : size
			size = size === "default" ? "normal" : size
			return size
		},

		getFontFamily(font) {
			const globalXtermProfile = getProfile("xterm") || {
				fontFamily: "courier-new, courier, monospace"
			}
			font = font === "default" ? globalXtermProfile.fontFamily : font
			if (font === "default" || !font) {
				return '"DejaVu Mono", courier-new, courier, monospace'
			}
			return font
		},
		getLogFileName() {
			const logDirectory = powertools.getLogDirty()
			const config = this.$sessionManager.getSessionConfigByInstanceId(this.sessionInstanceId)
			const name = config.name + "-" + config.uuid + ".log"
			return path.join(logDirectory, name)
		},

		async openLog() {
			try {
				if (!this.logger) {
					this.logger = await createLogger(this.getLogFileName())
				}
			} catch (e) {
				console.log("create logger error ", e)
				return
			}
			this.$refs.xterm.openLog()
		},

		closeLog() {
			this.$refs.xterm.closeLog()
		},

		handleLog(data) {
			if (this.logger) {
				this.logger.info(data)
			}
		},

		openSendAll(enable) {
			this.enableSendToAllTerm = enable
			if (enable) {
				EventBus.subscript("xterm-send-to-all", this.lisenOnOtherTermData)
			} else {
				EventBus.unsubscript("xterm-send-to-all", this.lisenOnOtherTermData)
			}
		},

		sendToAllTerm(data) {
			if (this.keyboardToAll) {
				EventBus.publish("xterm-send-to-all", {
					src: this.sessionInstanceId,
					data: data
				})
			}
		},

		lisenOnOtherTermData(data) {
			if (data.src !== this.sessionInstanceId) {
				this.iconv_to_charset.write(data.data)
			}
		},

		openLogFileInFolder() {
			let file = powertools.getLogDirty()
			powertools.showItemInFolder(file)
		},

		openLogFileByEditor() {
			let file = this.getLogFileName()
			powertools.openPath(file)
		},

		handleFind() {
			let s = this.$refs.xterm.getSelection()
			this.$refs.xterm.searchOpen(s)
		},

		split_row() {
			this.$emit("split_screen", "row")
		},
		split_col() {
			this.$emit("split_screen", "col")
		},
		split_grid() {
			this.$emit("split_screen", "grid")
		},
		split_normal() {
			this.$emit("split_screen", "normal")
		}
	}
}
</script>

<style lang="scss">
.xterm-instance {
	width: 100%;
	height: 100%;

	.session-toolbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		overflow: hidden;
		height: 40px;
		padding: 5px 0 5px 5px;
		box-sizing: border-box;
		background-color: var(--n-bg-color-base);

		.host-url {
			flex: 1;
			display: inline-block;
			width: 100%;
			height: 34px;
			line-height: 34px;
			padding: 0 10px;
			color: var(--n-text-color-base);
			background-color: var(--n-bg-color-light);
			margin-right: 5px;
			user-select: text;
		}

		.host-tools {
			display: flex;
			justify-content: space-between;
			align-items: center;
			width: 143px;
			min-width: 143px;
		}

		.btn {
			display: inline-block;
			box-sizing: border-box;
			text-align: center;
			width: 32px;
			height: 32px;
			line-height: 22px;
			padding: 5px;
			color: var(--n-text-color-base);
			border-radius: 4px;
			margin-right: 5px;

			&:hover {
				cursor: pointer;
				color: var(--n-button-primary-text);
				background-color: var(--n-button-primary-hover);
			}

			&.active {
				color: #ffffff;
				background-color: #3b82f6;
			}
		}
	}

	.xterm-pt {
		height: 100%;
	}
}
</style>
