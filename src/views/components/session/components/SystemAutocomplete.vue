<template>
	<n-space>
		<el-autocomplete
			ref="systemAutocompleteRef"
			:value="value"
			value-key="icon"
			:fetch-suggestions="querySearch"
			:debounce="0"
			trigger-on-focus
			clearable
			:placeholder="placeholder"
			@input="handleInput"
		>
			<template slot-scope="{ item }">
				<div style="display: flex; align-items: center; gap: 8px;">
					<n-icon :name="item.icon" size="18" />
					<span>{{ item.label || item.icon }}</span>
				</div>
			</template>
		</el-autocomplete>
		<n-icon :name="value" size="24" />
	</n-space>
</template>

<script setup>
import { querySearch } from '@/icons/system-icon'
import { ref } from 'vue'

defineProps({
	value: {
		type: String,
		default: ''
	},
	placeholder: {
		type: String,
		default: '请输入内容'
	}
})

const emits = defineEmits(['input'])
const systemAutocompleteRef = ref()

const handleInput = (value) => {
	emits('input', value)
	if (!systemAutocompleteRef.value) {
		return
	}
	systemAutocompleteRef.value.activated = true
	systemAutocompleteRef.value.suggestionDisabled = false
}
</script>