<template>
	<el-dialog
		title="RDP 会话"
		:visible="visible"
		append-to-body
		width="70%"
		:show-close="false"
		:destroy-on-close="false"
		:close-on-click-modal="false"
		@close="handlerClose"
	>
		<el-form
			ref="formRef"
			:model="sessionForm"
			:rules="formRules"
			class="n-session-ssh-container"
			label-position="top"
			label-width="80px"
		>
			<div class="n-session-ssh-container__left">
				<el-form-item :label="t('home.profile.base.host-name.title')" prop="hostName">
					<el-input v-model="sessionForm.hostName" :placeholder="t('home.profile.base.host-name.placeholder')" />
				</el-form-item>
				<host-icon-field v-model="sessionForm.system" />
				<el-form-item :label="t('home.profile.base.host-group.title')" prop="group">
					<el-select v-model="sessionForm.group" clearable :placeholder="t('home.profile.base.host-group.placeholder')" style="width: 100%">
						<el-option v-for="(item, index) in group" :label="item.label" :value="item.value" :key="index" />
					</el-select>
				</el-form-item>
			</div>
			<div class="n-session-ssh-container__right">
				<el-tabs v-model="activeTab" type="border-card">
					<el-tab-pane label="基础" name="base">
						<el-row :gutter="10">
							<el-col :span="12">
								<el-form-item :label="t('home.profile.base.host.title')" prop="hostAddress">
									<el-input v-model="sessionForm.hostAddress" />
								</el-form-item>
							</el-col>
							<el-col :span="12">
								<el-form-item :label="t('home.profile.base.port.title')" prop="hostRdpPort">
									<el-input-number v-model="sessionForm.hostRdpPort" :min="1" :max="65535" controls-position="right" style="width: 100%" />
								</el-form-item>
							</el-col>
						</el-row>
						<session-credentials-fields
							:form="sessionForm"
							:username-label="t('home.profile.auth.username.title')"
							:password-label="t('home.profile.auth.password.title')"
							:username-placeholder="t('home.profile.auth.username.placeholder')"
							:password-placeholder="t('home.profile.auth.password.placeholder')"
						/>
						<el-row :gutter="10">
							<el-col :span="12">
								<el-form-item label="Domain">
									<el-input v-model="sessionForm.domain" />
								</el-form-item>
							</el-col>
							<el-col :span="12">
								<el-form-item label="FreeRDP 可执行文件">
									<el-input v-model="sessionForm.rdpExecutable" placeholder="默认使用 freerdp\\win\\sdl3-freerdp.exe，支持手动覆盖" />
								</el-form-item>
							</el-col>
						</el-row>
						<el-form-item label="附加参数">
							<el-input v-model="sessionForm.rdpArgs" placeholder="例如：/cert:ignore /sec:rdp /f" />
						</el-form-item>
					</el-tab-pane>
				</el-tabs>
			</div>
		</el-form>
		<div slot="footer" class="dialog-footer">
			<el-button @click="handlerClose">{{ t('components.Cancel') }}</el-button>
			<el-button type="primary" @click="handleOk">{{ t('components.OK') }}</el-button>
			<el-button type="primary" @click="handleSaveAndConnect">{{ t('home.profile.operator.save-conn') }}</el-button>
		</div>
	</el-dialog>
</template>

<script setup>
import { publish } from '@/services/eventbus'
import { SESSION_CONFIG_TYPE, SessionConfig } from '@/services/sessionMgr'
import { useSessionStore } from '@/store'
import { storeToRefs } from 'pinia'
import { getCurrentInstance, ref } from 'vue'
import { useI18n } from 'vue-i18n-bridge'
import HostIconField from '../components/HostIconField.vue'
import SessionCredentialsFields from '../components/SessionCredentialsFields.vue'
import { defaultForm } from './constants'

const { t } = useI18n()
const emits = defineEmits(['ok', 'cancel'])
const visible = ref(false)
const formRef = ref()
const sessionForm = ref({ ...defaultForm })
const formRules = {
	hostName: [{ required: true, message: '请输入会话名称', trigger: 'blur' }],
	hostAddress: [{ required: true, message: '请输入主机地址', trigger: 'blur' }],
	hostRdpPort: [{ required: true, message: '请输入主机端口', trigger: 'blur' }]
}
const sessionStore = useSessionStore()
const { group } = storeToRefs(sessionStore)
const activeTab = ref('base')
const isEdit = ref(false)
const proxy = getCurrentInstance().proxy
const sessionManager = proxy.$sessionManager
const sessionConfig = ref()

const showModal = (sessionId) => {
	sessionStore.updateProcess()
	const currentGroupId = sessionStore.currentNode.isFolder ? sessionStore.currentNode.sessionId : sessionStore.currentNode.node?.parent?.data?.id
	if (sessionId) {
		isEdit.value = true
		sessionConfig.value = sessionManager.getSessionConfigById(sessionId)
		const newFormKeys = Object.keys(sessionForm.value)
		const oldFormKeys = Object.keys(sessionConfig.value.config)
		for (let i = 0, len = oldFormKeys.length; i < len; i++) {
			const key = oldFormKeys[i]
			if (!newFormKeys.includes(key)) {
				delete sessionConfig.value.config[key]
			}
		}
		sessionForm.value = {
			...sessionForm.value,
			...sessionConfig.value.config,
			group: sessionConfig.value._parent?.type === SESSION_CONFIG_TYPE.FOLDER && sessionConfig.value._parent?._parent
				? sessionConfig.value._parent._id
				: ([0, '0', null, undefined].includes(sessionConfig.value.config.group) ? '' : sessionConfig.value.config.group)
		}
	} else {
		sessionForm.value = {
			...defaultForm,
			group: currentGroupId ?? ''
		}
	}
	visible.value = true
}

const saveOrUpdateSession = async () => {
	const sessionName = sessionForm.value.hostName
	if (isEdit.value) {
		await sessionManager.updateSessionConfig(sessionConfig.value, sessionName, Object.assign({}, sessionConfig.value.config, sessionForm.value), '', sessionForm.value.group)
	} else {
		sessionConfig.value = new SessionConfig(sessionName, SESSION_CONFIG_TYPE.NODE, sessionForm.value, 'rdp session')
		sessionStore.appendSessionConfig(sessionConfig.value)
	}
	publish('refresh-session-tree')
}

const handleOk = () => {
	formRef.value.validate(async (valid) => {
		if (!valid) {
			return false
		}
		await saveOrUpdateSession()
		emits('ok', sessionForm.value)
		visible.value = false
	})
}

const handleSaveAndConnect = () => {
	formRef.value.validate(async (valid) => {
		if (!valid) {
			return false
		}
		await saveOrUpdateSession()
		await sessionManager.createSessionInstance(sessionConfig.value)
		emits('ok', sessionForm.value)
		visible.value = false
	})
}

const handlerClose = () => {
	isEdit.value = false
	activeTab.value = 'base'
	sessionConfig.value = undefined
	sessionForm.value = { ...defaultForm }
	formRef.value?.clearValidate()
	visible.value = false
}

defineExpose({ showModal })
</script>

<style lang="scss" scoped>
::v-deep .el-dialog__body {
	max-height: 60vh;
	overflow: auto;
	padding-bottom: 12px;
}

::v-deep .el-dialog__footer {
	padding: 20px 28px 28px;
	position: relative;
	z-index: 2;
	background: #fff;
}

::v-deep .dialog-footer {
	display: flex;
	justify-content: flex-end;
	gap: 12px;
}

::v-deep .dialog-footer .el-button {
	min-width: 92px;
	height: 40px;
	padding: 0 18px;
}

.n-session-ssh-container {
	display: flex;
	justify-content: space-between;
	column-gap: 10px;
	padding-right: 4px;

	&__left {
		width: 30%;
		padding-top: 12px;
	}

	&__right {
		flex: 1;
	}
}
</style>