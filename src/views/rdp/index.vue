<template>
	<div class="rdp-workspace">
		<pt-rdp-view
			v-for="sessId in sessions"
			:key="sessId"
			v-show="currentSessionId == sessId"
			:sessionId="sessId"
		></pt-rdp-view>
	</div>
</template>

<script>
import PtRdpView from './rdpview'

export default {
	name: 'RdpWorkspace',
	components: {
		PtRdpView
	},
	data() {
		return {
			sessions: [],
			currentSessionId: -1
		}
	},
	beforeRouteUpdate(to, from, next) {
		if (to.path !== from.path) {
			const sessionId = parseInt(to.params.sessionId)
			this.currentSessionId = sessionId
			this.addSession(sessionId)
		}
		next()
	},
	activated() {
		this.currentSessionId = parseInt(this.$route.params.sessionId)
		this.addSession(this.currentSessionId)
	},
	methods: {
		addSession(sessId) {
			if (this.sessions.findIndex((v) => v == sessId) > -1) {
				return
			}
			this.sessions.push(sessId)
		}
	}
}
</script>

<style lang="scss">
.rdp-workspace {
	position: relative;
	width: 100%;
	height: 100%;
}
</style>