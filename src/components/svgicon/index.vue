<template>
    <div v-if="isExternal" :style="styleExternalIcon" class="svg-external-icon svg-icon" v-on="$listeners" />
    <svg
        v-else-if="type === 'svg'"
        class="svg-icon"
        :class="className"
        :width="iconSize"
        :height="iconSize"
        :style="{'min-width': `${iconSize}px`,'min-height': `${iconSize}px`}"
        aria-hidden="true"
        v-on="$listeners"
    >
        <!-- key 跟随图标 sprite 版本，异步图标 chunk 到位后强制重新解析引用 -->
        <use :xlink:href="iconName" :key="spriteVersion" />
    </svg>
    <img
        v-else
        class="n-icon-img"
        :src="name"
        :class="className"
        :width="iconSize"
        :height="iconSize"
        :style="{'min-width': `${iconSize}px`,'min-height': `${iconSize}px`}"
        aria-hidden="true"
        alt="img"
        v-on="$listeners"
    />
</template>

<script>
import { iconState } from '@/icons/state'

export default {
    name: 'NIcon',
    props: {
        name: {
            type: String,
            required: true
        },
        type: {
            type: String,
            default: () => 'svg'
        },
        className: {
            type: String,
            default: ''
        },
        size: {
            type: [Number, String],
            default: 18
        }
    },
    computed: {
        spriteVersion() {
            // 依赖异步图标加载状态：加载完成后重新解析 <use>，图标即时补齐
            return iconState.fileIconsLoaded ? 1 : 0
        },
        isExternal() {
            // return isExternal(this.name)
            return false
        },
        iconName() {
            return `#icon-${ this.name }`
        },
        iconSize() {
            switch (this.size) {
                case 'mini':
                    return 12
                case 'small':
                    return 18
                case 'medium':
                    return 24
                case 'large':
                    return 32
                case 'huge':
                    return 64
                default:
                    try {
                        return parseInt(this.size)
                    } catch (error) {
                        return 18
                    }
            }
        },
        styleExternalIcon() {
            return {
                mask: `url(${ this.name }) no-repeat 50% 50%`,
                '-webkit-mask': `url(${ this.name }) no-repeat 50% 50%`,
                width: `${ this.size }px`,
                height: `${ this.size }px`
            }
        }
    }
}
</script>

<style lang="scss" scoped>
.svg-icon {
  vertical-align: -0.15em;
  fill: currentColor;
  overflow: hidden;
  cursor: pointer;
}

.svg-external-icon {
  background-color: currentColor;
  mask-size: cover !important;
  display: inline-block;
}

.n-icon-img {
  vertical-align: middle;
}
</style>
