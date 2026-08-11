<template>
	<el-row :gutter="gutter">
		<el-col :span="usernameSpan">
			<el-form-item :label="usernameLabel" :prop="usernameProp">
				<el-input v-model="form[usernameField]" :placeholder="usernamePlaceholder" />
			</el-form-item>
		</el-col>
		<el-col v-if="showPasswordField" :span="passwordSpan">
			<el-form-item :label="passwordLabel" :prop="passwordProp">
				<el-input
					v-model="form[passwordField]"
					type="password"
					:placeholder="passwordPlaceholder"
					show-password
				/>
			</el-form-item>
		</el-col>
	</el-row>
</template>

<script setup>
defineProps({
	form: {
		type: Object,
		required: true
	},
	usernameField: {
		type: String,
		default: 'username'
	},
	passwordField: {
		type: String,
		default: 'password'
	},
	usernameProp: {
		type: String,
		default: 'username'
	},
	passwordProp: {
		type: String,
		default: 'password'
	},
	usernameLabel: {
		type: String,
		required: true
	},
	passwordLabel: {
		type: String,
		required: true
	},
	usernamePlaceholder: {
		type: String,
		default: ''
	},
	passwordPlaceholder: {
		type: String,
		default: ''
	},
	showPasswordField: {
		type: Boolean,
		default: true
	},
	usernameSpan: {
		type: Number,
		default: 12
	},
	passwordSpan: {
		type: Number,
		default: 12
	},
	gutter: {
		type: Number,
		default: 10
	}
})
</script>