<template>
    <div class="pt-window" :class="{ 'not-macos': !IS_MAC_OS }">
        <div class="main-panel">
            <div class="title-bar" :class="{ drag: isMainWindow, deactive: !active, macos: IS_MAC_OS }">
                <nx-navbar class="title-bar-nav" />
                <!-- 右侧开关 -->
                <div class="window-controls-container" v-if="!IS_MAC_OS">
                    <n-space :size="6">
						<span class="control-btn" @click="doMinimize">
							<i class="el-icon-minus" />
						</span>
                        <span class="control-btn" @click="doMaximize">
                            <i :class="windowControlIcon" />
						</span>
                        <span class="control-btn" @click="doClose">
							<i class="el-icon-close" />
						</span>
                    </n-space>
                </div>
            </div>
            <div class="main-container" :style="main_container_fix_style">
                <slot name="main-panel"></slot>
            </div>
        </div>
    </div>
</template>

<script setup>
import { NxNavbar } from "@/layout/components";
import * as EventBus from '@/services/eventbus'
import { computed, getCurrentInstance, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { useSettingStore } from "@/store";
const IS_MAC_OS = /macintosh/i.test(navigator.userAgent)

const isMainWindow = ref(true)
const topPanel = ref(true)
const state = ref('normal')
const isFullscreen = ref(false)
const active = ref(true)
const window = ref()
const settingStore = useSettingStore()

const main_container_fix_style = computed(() => topPanel ? {} : { height: '100%' })
const windowControlIcon = computed(() => (isFullscreen.value || state.value !== 'normal' ? 'el-icon-copy-document' : 'el-icon-full-screen'))

function setWindowHandlers() {
    // @ts-ignore
    const currentWindow = powertools.getCurrentWindow()
    window.value = currentWindow

    currentWindow.on('blur', () => {
        active.value = false
    })

    currentWindow.on('focus', () => {
        active.value = true
    })

    currentWindow.on('maximize', () => {
        state.value = 'maximize'
    })

    currentWindow.on('unmaximize', () => {
        state.value = 'normal'
    })
}

function workaroundLinuxMaxMinEvent(status) {
    // @ts-ignore
    // electron version < 17.xx ,it not emit maximize/unmaximize events
    const os = powertools.getostype()
    if (os === 'Linux') {
        state.value = status
    }
}

function doMinimize() {
    // @ts-ignore
    window.value.minimize()
    workaroundLinuxMaxMinEvent('normal')
}

function doMaximize() {
	if (isFullscreen.value) {
		document.exitFullscreen()
		return
	}
    if (state.value === 'normal') {
        // @ts-ignore
        window.value.maximize()
        workaroundLinuxMaxMinEvent('maximize')
    } else {
        // @ts-ignore
        window.value.unmaximize()
        workaroundLinuxMaxMinEvent('normal')
    }
}

function doClose() {
    window.value.close()
}

const proxy = getCurrentInstance()?.proxy
const { configPanel } = storeToRefs(useSettingStore())

onMounted(() => {
    setWindowHandlers()
    EventBus.subscript('enter-fullscreen', async () => {
        try {
            topPanel.value = false
            EventBus.publish('session-config-panel', 'close')
            await document.body.requestFullscreen()
        } catch (e) {
            // pass
        }
    })
    document.addEventListener('fullscreenchange', () => {
        isFullscreen.value = !!document.fullscreenElement
        if (!isFullscreen.value) {
            if (configPanel.value) {
                EventBus.publish('session-config-panel', 'open')
            }
            topPanel.value = true
        }
    })
})
</script>

<style lang="scss">
@import '@/assets/scss/_const.scss';

.pt-window {
  display: flex;
  position: relative;
  box-sizing: border-box;

  width: 100%;
  height: 100%;
  min-width: 1000px;

  .main-panel {
        width: 100%;
    height: 100%;

    .title-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
            box-sizing: border-box;
      height: 40px;
      width: 100%;
      background-color: var(--n-bg-color-base);
      backdrop-filter: blur(5px);

      &.drag {
        -webkit-app-region: drag;
      }

            &.macos {
                padding-left: 78px;
            }

            .title-bar-nav {
		flex: 1;
		min-width: 0;
	  }

      .title-bar-search {
        width: 270px;
        z-index: 3000;
        -webkit-app-region: no-drag;
      }

      .window-controls-container {
        display: flex;
        flex-grow: 0;
        flex-shrink: 0;
        padding: 0 10px;
        -webkit-app-region: no-drag;

        .control-btn {
          display: inline-block;
          width: 32px;
          height: 32px;
          line-height: 32px;
          text-align: center;
          color: var(--n-text-color-base);

          &:hover {
            cursor: pointer;
            color: var(--n-text-color-light);
            background-color: var(--n-hover-bg-color);
          }
        }
      }
    }

    .main-container {
      position: relative;
      box-sizing: border-box;
      width: 100%;
      height: calc(100% - #{$titleBarHeight});
    }
  }
}
</style>
