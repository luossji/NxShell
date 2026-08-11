<template>
	<el-form-item label="主机图标" prop="system">
		<n-space class="n-host-icon-field" size="8">
			<el-select
				:value="value"
				:placeholder="resolvedPlaceholder"
				class="n-host-icon-field__select"
				filterable
				clearable
				default-first-option
				@input="handleInput"
			>
				<el-option v-for="item in hostIconOptions" :key="item.value" :label="item.label" :value="item.value">
					<div class="n-host-icon-option">
						<n-icon :name="item.value" size="18" />
						<span>{{ item.label }}</span>
					</div>
				</el-option>
			</el-select>
			<n-icon v-if="value" :name="value" size="20" />
		</n-space>
	</el-form-item>
</template>

<script setup>
import { computed } from 'vue'
import { systems } from '@/icons/system-icon'

const props = defineProps({
	value: {
		type: String,
		default: ''
	},
	placeholder: {
		type: String,
		default: ''
	}
})

const emits = defineEmits(['input'])

const ftpIconOptions = [
	{ label: 'FTP', value: 's-ftp' },
	{ label: 'Host', value: 'host' },
	{ label: 'Server', value: 'server' },
	{ label: 'SSH', value: 'ssh' },
	{ label: 'Telnet', value: 'telnet' },
	{ label: 'Serial', value: 'serial' },
	{ label: 'VNC', value: 'vnc' },
	{ label: 'PowerShell', value: 'powershell' }
]

const hostIconOptions = computed(() => {
	const mergedOptions = [
		...ftpIconOptions,
		...systems.map((item) => ({
			label: item.label,
			value: item.icon
		}))
	]

	return mergedOptions.filter((item, index, list) => {
		return list.findIndex((candidate) => candidate.value === item.value) === index
	})
})

const resolvedPlaceholder = computed(() => {
	if (props.placeholder) {
		return props.placeholder
	}

	return '请选择主机图标'
})

const handleInput = (value) => {
	emits('input', value)
}
</script>

<style lang="scss" scoped>
.n-host-icon-field {
	display: flex;
	width: 100%;

	&__select {
		flex: 1;
	}
}

.n-host-icon-option {
	display: flex;
	align-items: center;
	gap: 8px;
}
</style>