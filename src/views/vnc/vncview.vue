<template>
	<div class="pt-vnc-view">
		<pt-toolbar v-show="showSessionToolbar" :height="40">
			<el-input v-model="url" readonly slot="center" />
			<el-tooltip slot="right" class="item" effect="dark" :content="$t('home.session-instance.ctrldelete')" placement="top-start">
				<span class="btn" @click="sendCtrlAltDel">
					<i class="el-icon-s-operation" />
				</span>
			</el-tooltip>
			<el-tooltip slot="right" class="item" effect="dark" :content="$t('home.session-instance.duplicate-session')" placement="top-start">
				<span class="btn" @click="copySession">
					<i class="el-icon-copy-document" />
				</span>
			</el-tooltip>
			<el-tooltip slot="right" class="item" effect="dark" :content="$t('home.session-instance.reconnect')" placement="top-start">
				<span class="btn" @click="reconnect">
					<i class="el-icon-refresh" />
				</span>
			</el-tooltip>
		</pt-toolbar>
		<div ref="screen" class="screen" :style="screenStyle">
			<!-- This is where the remote screen will appear -->
		</div>

		<pt-auth-dialog ref="dialog" @authOk="handleAuthOk" />
	</div>
</template>

<script>
import FileView from '../components/fileview/fileview'
import PtAuthDialog from '../components/auth/auth'
import RFB from '@novnc/novnc/lib/rfb'
import * as EventBus from '../../services/eventbus'
import { getProfile } from '@/services/globalSetting'

export default {
	name: 'PtVncView',
	components: {
		FileView,
		PtAuthDialog
	},
	props: {
		mode: {
			type: String,
			default: 'full'
		},
		sessionId: {
			type: Number
		}
	},

	data() {
		return {
			status_text: 'Loading',
			host: 'localhost',
			port: 5900,
			showSessionToolbar: !getProfile('xterm')?.hideSessionShortcutBar,
			url: '',
			lastClipboardText: '',
			sessionInstance: null,
			sessionCloseHandler: null,
			suppressDisconnectWarning: false
		}
	},

	computed: {
		screenStyle() {
			return {
				height: this.showSessionToolbar ? 'calc(100% - 40px)' : '100%'
			}
		}
	},

	mounted() {
		this.init()
		EventBus.subscript('toggle-session-shortcut-bar', this.handleToggleShortcutBarEvent)
		window.addEventListener('keydown', this.handleClipboardShortcut, true)
	},

	methods: {
		handleAuthOk(data) {
			this.sessionInstance.sendControlData(data)
		},
		handleClipboardShortcut(e) {
			if (!this.rfb || !this.isVncFocused()) {
				return
			}

			const isPasteShortcut = (e.ctrlKey || e.metaKey) && e.key?.toLowerCase?.() === 'v'
			const isShiftInsert = e.shiftKey && e.key === 'Insert'
			if (!isPasteShortcut && !isShiftInsert) {
				return
			}

			this.syncLocalClipboardToRemote()
		},
		isVncFocused() {
			const activeElement = document.activeElement
			return !!(this.$refs.screen && activeElement && this.$refs.screen.contains(activeElement))
		},
		syncLocalClipboardToRemote() {
			if (!this.rfb) {
				return
			}

			const text = powertools.clipboardReadText()
			if (typeof text !== 'string' || !text.length) {
				return
			}

			this.lastClipboardText = text
			this.rfb.clipboardPasteFrom(text)
		},
		init() {
			// RFB holds the API to connect and communicate with a VNC server
			let rfb
			const sessionInstance = this.$sessionManager.getSessionInstanceById(this.sessionId)
			this.detachSessionCloseHandler()
			this.sessionInstance = sessionInstance
			this.sessionCloseHandler = () => {
				// destroy vnc instance
				try {
					this.$destroy()
					// this.$el.parentNode.removeChild(this.$el)
				} catch (e) {
					console.log('vnc instance remove error', e)
				}
			}
			sessionInstance.on('close', this.sessionCloseHandler)

			const config = sessionInstance.cfg
			// Read parameters specified in the URL query string
			// By default, use the host and port of server that served this file
			this.host = config.hostAddress
			this.port = config.hostVncPort
			this.password = config.password
			this.username = config.username
			this.url = `vnc://${this.host}:${this.port}`

			this.status('Connecting')
			let url = `ws://${this.host}:${this.port}`
			// Creating a new RFB object will start a new connection
			rfb = new RFB(this.$refs.screen, url)
			this.rfb = rfb

			// Add listeners to important events from the RFB module
			rfb.addEventListener('connect', () => {
				this.connectedToServer()
			})
			rfb.addEventListener('disconnect', (e) => {
				this.disconnectedFromServer(e)
			})
			rfb.addEventListener('credentialsrequired', (e) => {
				this.credentialsAreRequired(e)
			})
			rfb.addEventListener('desktopname', (e) => {
				this.updateDesktopName(e)
			})
			rfb.addEventListener('clipboard', (e) => {
				this.clipborad(e)
			})

			// Set parameters that can be changed on an active connection
			rfb.viewOnly = false
			rfb.scaleViewport = true
			rfb.resizeSession = true

			if (this.resizeObject) {
				this.resizeObject.disconnect()
			}

			this.resizeObject = new ResizeObserver(() => {
				if (!this.rfb || this.rfb !== rfb) {
					return
				}

				rfb.scaleViewport = true
			})
			this.resizeObject.observe(this.$refs.screen)
		},
		credentialsAreRequired(e) {
			if (this.username && this.password) {
				this.rfb.sendCredentials({username: this.username, password: this.password})
				return
			}
			let auths = e.detail.types
			this.credentials = {}
			this.handleAuth(auths)
		},
		handleAuth(auths) {
			if (!auths.length) {
				this.rfb.sendCredentials(this.credentials)
				return
			}
			this.cur_auth = auths.shift()
			this.auths = auths
			this.$refs.dialog.show({type: 'authPrompt', data: [{prompt: this.cur_auth}]})
		},
		handleAuthOk(e) {
			if (e.type !== 'cannel') {
				this.credentials[this.cur_auth] = e.data[0]
			}
			this.handleAuth(this.auths)
		},
		status(text) {
			this.status_text = text
		},
		detachSessionCloseHandler() {
			if (!this.sessionInstance || !this.sessionCloseHandler) {
				return
			}

			if (typeof this.sessionInstance.off === 'function') {
				this.sessionInstance.off('close', this.sessionCloseHandler)
			} else if (typeof this.sessionInstance.removeListener === 'function') {
				this.sessionInstance.removeListener('close', this.sessionCloseHandler)
			}

			this.sessionCloseHandler = null
		},
		cleanupRfb({ hardClose = false, suppressWarning = false } = {}) {
			const rfb = this.rfb
			if (!rfb) {
				return
			}

			this.suppressDisconnectWarning = suppressWarning
			this.rfb = null

			try {
				const connectionState = rfb._rfbConnectionState
				if (connectionState === 'disconnecting' || connectionState === 'disconnected') {
					return
				}

				if (hardClose && typeof rfb._disconnect === 'function') {
					rfb._disconnect()
					return
				}

				rfb.disconnect()
			} catch (error) {
				console.log('vnc cleanup error', error)
			}
		},
		disconnectedFromServer(e) {
			if (this.suppressDisconnectWarning) {
				this.suppressDisconnectWarning = false
				this.status('Disconnected')
				return
			}

			if (e.detail.clean) {
				this.status('Disconnected')
			} else {
				this.warn('Connection is closed')
			}
		},
		connectedToServer(e) {
			this.suppressDisconnectWarning = false
			this.status('Connected to ' + this.desktopName)
		},
		updateDesktopName(e) {
			this.desktopName = e.detail.name
		},
		copySession() {
			const sessionInstance = this.$sessionManager.getSessionInstanceById(this.sessionId)
			if (!sessionInstance) {
				return
			}

			this.$sessionManager.duplicateSessionInstance(sessionInstance)
		},
		sendCtrlAltDel() {
			if (this.rfb) {
				this.rfb.scaleViewport = true
				this.rfb.sendCtrlAltDel()
			}
		},
		reconnect() {
			this.cleanupRfb({ hardClose: true, suppressWarning: true })
			this.init()
		},
		clipborad(e) {
			const text = e.detail.text
			if (typeof text !== 'string') {
				return
			}

			this.lastClipboardText = text
			powertools.clipboardWriteText(text)
		},

		warn(info) {
			this.$confirm(info, 'VNC', {type: 'warning'})
		},
		handleToggleShortcutBarEvent(payload) {
			if (!payload || payload.sessionId !== this.sessionId) {
				return
			}
			if (typeof payload.visible === 'boolean') {
				this.showSessionToolbar = payload.visible
			} else {
				this.showSessionToolbar = !this.showSessionToolbar
			}
			this.$nextTick(() => {
				if (this.rfb) {
					this.rfb.scaleViewport = true
				}
			})
		}
	},

	async beforeDestroy() {
		EventBus.unsubscript('toggle-session-shortcut-bar', this.handleToggleShortcutBarEvent)
		window.removeEventListener('keydown', this.handleClipboardShortcut, true)
		this.detachSessionCloseHandler()
		this.cleanupRfb({ hardClose: true, suppressWarning: true })
		if (this.resizeObject) {
			this.resizeObject.disconnect()
			this.resizeObject = null
		}
	}
}
</script>

<style lang="scss">
.pt-vnc-view {
	height: 100%;
	width: 100%;

	.top_bar {
		width: 100%;
		height: 40px;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		margin-left: 8px;
		border-radius: 4px;
		cursor: pointer;
		color: #606266;
		font-size: 16px;
		transition: background-color 0.2s ease, color 0.2s ease;

		&:hover {
			background: rgba(64, 158, 255, 0.1);
			color: #409eff;
		}
	}

	.screen {
		width: 100%;
		height: calc(100% - 40px);
	}
}
</style>
