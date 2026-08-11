<template>
	<div class="rdp-view">
		<div v-show="showSessionToolbar" class="rdp-view__header">
			<div>
				<h2 class="rdp-view__title">{{ sessionName }}</h2>
				<p class="rdp-view__subtitle">使用 FreeRDP 在外部窗口中建立远程桌面连接。</p>
			</div>
			<div class="rdp-view__actions">
				<el-button type="primary" @click="launchRdp(true)">重新连接</el-button>
				<el-button v-if="launcherPath" @click="showLauncherScript">定位启动脚本</el-button>
			</div>
		</div>

		<el-alert
			v-if="osType !== 'Windows_NT'"
			type="warning"
			show-icon
			:closable="false"
			title="当前 RDP MVP 仅实现 Windows 下通过 FreeRDP 外部启动"
			description="如果需要 macOS 或 Linux 的 xfreerdp 拉起链路，还需要继续补充平台脚本和权限处理。"
		/>

		<div class="rdp-view__status" :class="`is-${launchStatus}`">
			<div class="rdp-view__status-label">状态</div>
			<div class="rdp-view__status-value">{{ statusText }}</div>
			<div v-if="launchMessage" class="rdp-view__status-message">{{ launchMessage }}</div>
		</div>

		<div class="rdp-view__grid">
			<div class="rdp-view__card">
				<div class="rdp-view__card-label">地址</div>
				<div class="rdp-view__card-value">{{ hostAddress }}</div>
			</div>
			<div class="rdp-view__card">
				<div class="rdp-view__card-label">端口</div>
				<div class="rdp-view__card-value">{{ hostPort }}</div>
			</div>
			<div class="rdp-view__card">
				<div class="rdp-view__card-label">用户名</div>
				<div class="rdp-view__card-value">{{ username || '-' }}</div>
			</div>
			<div class="rdp-view__card">
				<div class="rdp-view__card-label">可执行文件</div>
				<div class="rdp-view__card-value">{{ rdpExecutable }}</div>
			</div>
			<div class="rdp-view__card">
				<div class="rdp-view__card-label">当前命中</div>
				<div class="rdp-view__card-value">{{ resolvedClientDisplay }}</div>
			</div>
			<div class="rdp-view__card rdp-view__card--wide">
				<div class="rdp-view__card-label">附加参数</div>
				<div class="rdp-view__card-value">{{ rdpArgs || '-' }}</div>
			</div>
			<div class="rdp-view__card rdp-view__card--wide" v-if="launcherPath">
				<div class="rdp-view__card-label">启动脚本</div>
				<div class="rdp-view__card-value">{{ launcherPath }}</div>
			</div>
		</div>
	</div>
</template>

<script>
import { createLocalFs } from '@/services/nxsys/localfs'
import * as EventBus from '@/services/eventbus'
import { getProfile } from '@/services/globalSetting'
const path = require('path')

export default {
	name: 'RdpView',
	props: {
		sessionId: {
			type: Number,
			required: true
		}
	},
	data() {
		return {
			sessionInstance: null,
			sessionConfig: null,
			showSessionToolbar: !getProfile('xterm')?.hideSessionShortcutBar,
			osType: '',
			launchStatus: 'idle',
			launchMessage: '',
			launcherPath: '',
			resolvedClientPath: ''
		}
	},
	computed: {
		sessionName() {
			return this.sessionConfig?.name || 'RDP'
		},
		cfg() {
			return this.sessionConfig?.config || {}
		},
		hostAddress() {
			return this.cfg.hostAddress || '-'
		},
		hostPort() {
			return this.cfg.hostRdpPort || 3389
		},
		username() {
			return this.cfg.username || ''
		},
		rdpExecutable() {
			return this.cfg.rdpExecutable || 'freerdp\\win\\sdl3-freerdp.exe'
		},
		rdpArgs() {
			return this.cfg.rdpArgs || ''
		},
		resolvedClientDisplay() {
			return this.resolvedClientPath || '-'
		},
		statusText() {
			switch (this.launchStatus) {
				case 'launching':
					return '正在启动'
				case 'launched':
					return '已发起启动'
				case 'error':
					return '启动失败'
				default:
					return '待启动'
			}
		}
	},
	async mounted() {
		EventBus.subscript('toggle-session-shortcut-bar', this.handleToggleShortcutBarEvent)
		this.osType = window.powertools.getostype()
		this.sessionInstance = this.$sessionManager.getSessionInstanceById(this.sessionId)
		this.sessionConfig = this.$sessionManager.getSessionConfigByInstanceId(this.sessionId)
		this.syncLaunchState()
		if (!this.sessionInstance?.launched) {
			await this.launchRdp()
		}
	},
	beforeDestroy() {
		EventBus.unsubscript('toggle-session-shortcut-bar', this.handleToggleShortcutBarEvent)
	},
	methods: {
		handleToggleShortcutBarEvent(payload) {
			if (!payload || payload.sessionId !== this.sessionId) {
				return
			}
			if (typeof payload.visible === 'boolean') {
				this.showSessionToolbar = payload.visible
			} else {
				this.showSessionToolbar = !this.showSessionToolbar
			}
		},
		syncLaunchState() {
			if (!this.sessionInstance) {
				return
			}
			this.launchStatus = this.sessionInstance.launchStatus || 'idle'
			this.launchMessage = this.sessionInstance.launchError || ''
			this.launcherPath = this.sessionInstance.launcherPath || ''
			this.resolvedClientPath = this.sessionInstance.resolvedClientPath || ''
		},
		setLaunchState(status, message = '') {
			this.launchStatus = status
			this.launchMessage = message
			if (!this.sessionInstance) {
				return
			}
			this.sessionInstance.launchStatus = status
			this.sessionInstance.launchError = message
			if (status !== 'launched') {
				this.sessionInstance.launched = false
			}
		},
		escapeBatchValue(value) {
			return String(value || '').replace(/%/g, '%%').replace(/[\r\n]+/g, ' ').trim()
		},
		isPackagedApp() {
			const appPath = path.normalize(window.powertools.getAppPath())
			return appPath.endsWith('.asar') || appPath.includes(`${path.sep}resources${path.sep}`)
		},
		getAppPathCandidates() {
			const appPath = path.normalize(window.powertools.getAppPath())
			const candidates = [appPath, path.dirname(appPath), path.dirname(path.dirname(appPath))]
			return Array.from(new Set(candidates.filter(Boolean).map((item) => path.normalize(item))))
		},
		getWorkspaceRootPath() {
			return this.getAppPathCandidates()[1] || path.dirname(window.powertools.getAppPath())
		},
		getResourcesRootPath() {
			const appPath = path.normalize(window.powertools.getAppPath())
			if (appPath.endsWith('.asar')) {
				return path.dirname(appPath)
			}

			const match = `${path.sep}resources${path.sep}`
			const index = appPath.lastIndexOf(match)
			if (index > -1) {
				return appPath.slice(0, index + 'resources'.length)
			}

			return path.dirname(appPath)
		},
		getBundledFreeRdpPath() {
			if (this.isPackagedApp()) {
				return path.normalize(path.join(this.getResourcesRootPath(), 'freerdp', 'win', 'sdl3-freerdp.exe'))
			}

			return path.normalize(path.join(this.getWorkspaceRootPath(), 'src', 'tools', 'freerdp', 'win', 'sdl3-freerdp.exe'))
		},
		getConfiguredClientCandidates() {
			const configuredClient = this.cfg.rdpExecutable || ''
			if (!configuredClient) {
				return []
			}

			const normalizedConfiguredClient = configuredClient.replace(/\\/g, '/')

			if (/^[a-zA-Z]:[\\/]/.test(configuredClient) || configuredClient.startsWith('\\\\')) {
				return [path.normalize(configuredClient)]
			}

			const candidates = []

			if (normalizedConfiguredClient.startsWith('freerdp/')) {
				if (this.isPackagedApp()) {
					candidates.push(path.normalize(path.join(this.getResourcesRootPath(), configuredClient)))
				} else {
					for (const rootPath of this.getAppPathCandidates()) {
						candidates.push(path.normalize(path.join(rootPath, 'src', 'tools', configuredClient)))
						candidates.push(path.normalize(path.join(rootPath, configuredClient)))
					}
				}
			}

			if (this.isPackagedApp() && normalizedConfiguredClient.startsWith('src/tools/freerdp/')) {
				candidates.push(path.normalize(path.join(this.getResourcesRootPath(), 'freerdp', 'win', path.basename(configuredClient))))
			} else {
				for (const rootPath of this.getAppPathCandidates()) {
					candidates.push(path.normalize(path.join(rootPath, configuredClient)))
				}
			}

			return Array.from(new Set(candidates.filter(Boolean)))
		},
		getResolvedConfiguredClient() {
			return this.getConfiguredClientCandidates()[0] || ''
		},
		async resolveLaunchClient(fsClient) {
			const configuredClientCandidates = this.getConfiguredClientCandidates()
			for (const configuredClient of configuredClientCandidates) {
				if (await fsClient.exists(configuredClient)) {
					return configuredClient
				}
			}

			const bundledFreeRdpPath = this.getBundledFreeRdpPath()
			if (await fsClient.exists(bundledFreeRdpPath)) {
				return bundledFreeRdpPath
			}

			const commonClientPaths = [
				path.normalize('C:\\Program Files\\FreeRDP\\bin\\sdl3-freerdp.exe'),
				path.normalize('C:\\Program Files (x86)\\FreeRDP\\bin\\sdl3-freerdp.exe'),
				path.normalize('C:\\Program Files\\FreeRDP\\bin\\sdl2-freerdp.exe'),
				path.normalize('C:\\Program Files (x86)\\FreeRDP\\bin\\sdl2-freerdp.exe'),
				path.normalize('C:\\Program Files\\FreeRDP\\bin\\wfreerdp.exe'),
				path.normalize('C:\\Program Files (x86)\\FreeRDP\\bin\\wfreerdp.exe')
			]

			for (const clientPath of commonClientPaths) {
				if (await fsClient.exists(clientPath)) {
					return clientPath
				}
			}

			return 'mstsc.exe'
		},
		updateResolvedClientPath(resolvedClientPath) {
			this.resolvedClientPath = resolvedClientPath
			if (!this.sessionInstance) {
				return
			}
			this.sessionInstance.resolvedClientPath = resolvedClientPath
		},
		buildConfiguredClientProbe() {
			const configuredClient = this.escapeBatchValue(this.getResolvedConfiguredClient())
			if (!configuredClient) {
				return []
			}

			return [
				`set "NX_RDP_CONFIGURED=${configuredClient}"`,
				'if not defined NX_RDP_CLIENT if exist "%NX_RDP_CONFIGURED%" set "NX_RDP_CLIENT=%NX_RDP_CONFIGURED%"',
				'if not defined NX_RDP_CLIENT where.exe "%NX_RDP_CONFIGURED%" >nul 2>nul && set "NX_RDP_CLIENT=%NX_RDP_CONFIGURED%"'
			]
		},
		buildResolvedClientProbe() {
			const resolvedClientPath = this.escapeBatchValue(this.resolvedClientPath)
			if (!resolvedClientPath || resolvedClientPath.toLowerCase() === 'mstsc.exe') {
				return []
			}

			if (/^[a-zA-Z]:[\\/]/.test(resolvedClientPath) || resolvedClientPath.startsWith('\\\\')) {
				return [`if exist "${resolvedClientPath}" set "NX_RDP_CLIENT=${resolvedClientPath}"`]
			}

			return [`set "NX_RDP_CLIENT=${resolvedClientPath}"`]
		},
		buildWindowsLauncherScript() {
			const target = this.escapeBatchValue(`${this.hostAddress}:${this.hostPort}`)
			const bundledFreeRdp = this.escapeBatchValue(this.getBundledFreeRdpPath())
			const args = [`/v:${target}`]
			if (this.cfg.username) {
				args.push(`/u:"${this.escapeBatchValue(this.cfg.username)}"`)
			}
			if (this.cfg.password) {
				args.push(`/p:"${this.escapeBatchValue(this.cfg.password)}"`)
			}
			if (this.cfg.domain) {
				args.push(`/d:"${this.escapeBatchValue(this.cfg.domain)}"`)
			}
			if (this.cfg.rdpArgs) {
				args.push(this.escapeBatchValue(this.cfg.rdpArgs))
			}

			return [
				'@echo off',
				'setlocal',
				`set "NX_RDP_TARGET=${target}"`,
				'set "NX_RDP_CLIENT="',
				'set "NX_RDP_CLIENT_DIR="',
				...this.buildResolvedClientProbe(),
				...this.buildConfiguredClientProbe(),
				`if not defined NX_RDP_CLIENT if exist "${bundledFreeRdp}" set "NX_RDP_CLIENT=${bundledFreeRdp}"`,
				'if not defined NX_RDP_CLIENT where.exe sdl3-freerdp.exe >nul 2>nul && set "NX_RDP_CLIENT=sdl3-freerdp.exe"',
				'if not defined NX_RDP_CLIENT if exist "%ProgramFiles%\FreeRDP\bin\sdl3-freerdp.exe" set "NX_RDP_CLIENT=%ProgramFiles%\FreeRDP\bin\sdl3-freerdp.exe"',
				'if not defined NX_RDP_CLIENT if exist "%ProgramFiles(x86)%\FreeRDP\bin\sdl3-freerdp.exe" set "NX_RDP_CLIENT=%ProgramFiles(x86)%\FreeRDP\bin\sdl3-freerdp.exe"',
				'if not defined NX_RDP_CLIENT where.exe sdl2-freerdp.exe >nul 2>nul && set "NX_RDP_CLIENT=sdl2-freerdp.exe"',
				'if not defined NX_RDP_CLIENT if exist "%ProgramFiles%\FreeRDP\bin\sdl2-freerdp.exe" set "NX_RDP_CLIENT=%ProgramFiles%\FreeRDP\bin\sdl2-freerdp.exe"',
				'if not defined NX_RDP_CLIENT if exist "%ProgramFiles(x86)%\FreeRDP\bin\sdl2-freerdp.exe" set "NX_RDP_CLIENT=%ProgramFiles(x86)%\FreeRDP\bin\sdl2-freerdp.exe"',
				'if not defined NX_RDP_CLIENT where.exe wfreerdp.exe >nul 2>nul && set "NX_RDP_CLIENT=wfreerdp.exe"',
				'if not defined NX_RDP_CLIENT if exist "%ProgramFiles%\FreeRDP\bin\wfreerdp.exe" set "NX_RDP_CLIENT=%ProgramFiles%\FreeRDP\bin\wfreerdp.exe"',
				'if not defined NX_RDP_CLIENT if exist "%ProgramFiles(x86)%\FreeRDP\bin\wfreerdp.exe" set "NX_RDP_CLIENT=%ProgramFiles(x86)%\FreeRDP\bin\wfreerdp.exe"',
				'if not defined NX_RDP_CLIENT set "NX_RDP_CLIENT=mstsc.exe"',
				'if /I "%NX_RDP_CLIENT%"=="mstsc.exe" goto launch_mstsc',
				'if exist "%NX_RDP_CLIENT%" for %%I in ("%NX_RDP_CLIENT%") do set "NX_RDP_CLIENT_DIR=%%~dpI"',
				`if defined NX_RDP_CLIENT_DIR start "" /D "%NX_RDP_CLIENT_DIR%" "%NX_RDP_CLIENT%" ${args.join(' ')}`,
				`if not defined NX_RDP_CLIENT_DIR start "" "%NX_RDP_CLIENT%" ${args.join(' ')}`,
				'exit /b 0',
				':launch_mstsc',
				'start "" mstsc.exe /v:%NX_RDP_TARGET%',
				'exit /b 0',
				''
			].join('\r\n')
		},
		async ensureDirectory(fsClient, dirPath) {
			const exists = await fsClient.exists(dirPath)
			if (!exists) {
				await fsClient.mkdir(dirPath)
			}
		},
		async writeLauncherScript() {
			const fsClient = await createLocalFs()
			const appDataDir = window.powertools.getAppDataDirty()
			const appDir = `${appDataDir}\\nxshell`
			const launcherDir = `${appDir}\\rdp`
			await this.ensureDirectory(fsClient, appDir)
			await this.ensureDirectory(fsClient, launcherDir)
			const launcherPath = `${launcherDir}\\rdp-${this.sessionId}.cmd`
			const handle = await fsClient.open(launcherPath, 'w')
			const resolvedClientPath = await this.resolveLaunchClient(fsClient)
			this.updateResolvedClientPath(resolvedClientPath)
			const content = Buffer.from(this.buildWindowsLauncherScript(), 'utf8')
			await fsClient.write(handle, content, 0, content.length, 0)
			await fsClient.close(handle)
			return launcherPath
		},
		buildRdpLaunchCommand(resolvedClientPath) {
			if (!resolvedClientPath || resolvedClientPath.toLowerCase() === 'mstsc.exe') {
				return {
					command: 'mstsc.exe',
					args: [`/v:${this.hostAddress}:${this.hostPort}`],
					cwd: undefined
				}
			}

			const args = [`/v:${this.hostAddress}:${this.hostPort}`]
			if (this.cfg.username) {
				args.push(`/u:${this.cfg.username}`)
			}
			if (this.cfg.password) {
				args.push(`/p:${this.cfg.password}`)
			}
			if (this.cfg.domain) {
				args.push(`/d:${this.cfg.domain}`)
			}
			if (this.cfg.rdpArgs) {
				args.push(...this.cfg.rdpArgs.split(/\s+/).filter(Boolean))
			}

			return {
				command: resolvedClientPath,
				args,
				cwd: path.dirname(resolvedClientPath)
			}
		},
		async spawnRdpProcess(resolvedClientPath) {
			const launchInfo = this.buildRdpLaunchCommand(resolvedClientPath)
			return window.powertools.spawnDetachedProcess(launchInfo.command, launchInfo.args, launchInfo.cwd)
		},
		async launchRdp(force = false) {
			if (!this.sessionInstance || !this.sessionConfig) {
				return
			}
			if (this.osType !== 'Windows_NT') {
				this.setLaunchState('error', '当前仅支持在 Windows 上通过 FreeRDP 客户端启动。')
				return
			}
			if (!force && this.sessionInstance.launched) {
				this.syncLaunchState()
				return
			}

			this.setLaunchState('launching', '正在启动 FreeRDP 客户端')
			try {
				const fsClient = await createLocalFs()
				const resolvedClientPath = await this.resolveLaunchClient(fsClient)
				this.updateResolvedClientPath(resolvedClientPath)
				const launcherPath = await this.writeLauncherScript()
				const pid = await this.spawnRdpProcess(resolvedClientPath)
				if (!pid) {
					const openResult = await window.powertools.openPath(launcherPath)
					if (openResult) {
						throw new Error(openResult)
					}
				}
				this.launcherPath = launcherPath
				this.sessionInstance.launcherPath = launcherPath
				this.sessionInstance.launched = true
				this.setLaunchState('launched', `已发起外部 RDP 客户端启动请求，当前命中：${this.resolvedClientPath || '未知'}${pid ? `，PID: ${pid}` : '，已回退到启动脚本'}`)
			} catch (error) {
				this.setLaunchState('error', error?.message || 'FreeRDP 启动失败')
			}
		},
		showLauncherScript() {
			if (!this.launcherPath) {
				return
			}
			window.powertools.showItemInFolder(this.launcherPath)
		}
	}
}
</script>

<style lang="scss" scoped>
.rdp-view {
	padding: 24px;
	height: 100%;
	overflow: auto;
	background: linear-gradient(180deg, #f8fbff 0%, #eef4fb 100%);

	&__header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		column-gap: 16px;
		margin-bottom: 20px;
	}

	&__title {
		margin: 0;
		font-size: 28px;
		font-weight: 600;
		color: #17324d;
	}

	&__subtitle {
		margin: 8px 0 0;
		font-size: 14px;
		color: #55708d;
	}

	&__actions {
		display: flex;
		column-gap: 12px;
	}

	&__status {
		margin: 20px 0;
		padding: 18px 20px;
		border-radius: 16px;
		background: rgba(255, 255, 255, 0.88);
		border: 1px solid #d7e4f1;
		box-shadow: 0 12px 24px rgba(23, 50, 77, 0.08);
		color: #17324d;

		&.is-launching {
			border-color: #f3c266;
		}

		&.is-launched {
			border-color: #77c48b;
		}

		&.is-error {
			border-color: #e28b8b;
		}
	}

	&__status-label {
		font-size: 12px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #7a8fa6;
	}

	&__status-value {
		margin-top: 6px;
		font-size: 22px;
		font-weight: 600;
	}

	&__status-message {
		margin-top: 8px;
		font-size: 14px;
		color: #55708d;
		word-break: break-all;
	}

	&__grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 16px;
		margin-top: 20px;
	}

	&__card {
		padding: 18px 20px;
		border-radius: 16px;
		background: rgba(255, 255, 255, 0.92);
		border: 1px solid #d7e4f1;
		box-shadow: 0 10px 20px rgba(23, 50, 77, 0.06);
		min-height: 100px;

		&--wide {
			grid-column: 1 / -1;
		}
	}

	&__card-label {
		font-size: 12px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #7a8fa6;
	}

	&__card-value {
		margin-top: 10px;
		font-size: 16px;
		font-weight: 600;
		color: #17324d;
		word-break: break-all;
	}
}

@media (max-width: 960px) {
	.rdp-view {
		padding: 16px;

		&__header {
			flex-direction: column;
			row-gap: 12px;
		}

		&__actions {
			width: 100%;
			flex-wrap: wrap;
		}

		&__grid {
			grid-template-columns: 1fr;
		}
	}
}
</style>