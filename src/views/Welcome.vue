<template>
	<div class='n-home-empty'>
		<div class='n-home-content'>
      <div class='n-home-content__brand'>
        <span class='n-logo'>
          <n-icon name='logo' size='70' />
        </span>
        <p class='n-logo-text'>NxShell</p>
      </div>
      <el-popover v-model='createSessionVisible' placement='bottom' popper-class='nx-session-popover'>
        <template #reference>
          <el-button type='primary' class='n-home-content__create-button'>
            <i class='el-icon-plus'></i>
            <span>{{ t('home.sessions-context-menu.create-session') }}</span>
          </el-button>
        </template>
        <ul class='n-session-mode' @click.prevent='gotoCreateShellSession'>
          <li class='n-session-mode__item' data-type='ssh'>
            <n-icon name='ssh' />
            SSH
          </li>
          <li class='n-session-mode__item' data-type='ftp'>
            <n-icon name='s-ftp' />
            FTP
          </li>
          <li class='n-session-mode__item' data-type='telnet'>
            <n-icon name='telnet' />
            Telnet
          </li>
          <li class='n-session-mode__item' data-type='serial'>
            <n-icon name='serial' />
            Serial
          </li>
          <li class='n-session-mode__item' data-type='rdp'>
            <n-icon name='windows' />
            RDP
          </li>
          <li class='n-session-mode__item' data-type='vnc'>
            <n-icon name='vnc' />
            Vnc
          </li>
          <li class='n-session-mode__item' data-type='localShell'>
            <n-icon name='powershell' />
            LocalShell
          </li>
        </ul>
      </el-popover>
		</div>
		<h1>{{ t('app.welcome') }}</h1>
		<div class='n-home-footer'>
			<div class='n-home-footer__feedback'>
				<nx-button icon='official-website' label='app.website' label-align='flex-end' @click='toWebsite' />
			</div>
			<div class='n-home-footer__version'>{{ t('home.welcome.software-version') }} {{ version }}</div>
		</div>
	</div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n-bridge'
import NxButton from '@/components/nxButton/index.vue'
import { publish } from '@/services/eventbus'

const { t } = useI18n()
const version = computed(() => `V${window.powertools.getVersion()}`)
const createSessionVisible = ref(false)

const toWebsite = () => {
	window.powertools.openExterUrl('https://gitee.com/luossji/nxshell')
}

const gotoCreateShellSession = (event) => {
  const sessionItem = event.target.closest('[data-type]')
  const type = sessionItem?.dataset?.type || 'ssh'
  createSessionVisible.value = false
  publish('create-session-toolbar', type)
}
</script>

<style lang='scss' scoped>
.n-home-empty {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  width: 100%;
  height: 100%;
  // background-color: var(--n-bg-color-base);
  h1 {
    color: var(--n-text-color-base);
  }

  .n-home-content {
    flex: 1 0 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;

    &__brand {
    display: flex;
    justify-content: center;
    align-items: center;
  }

  &__create-button {
    margin-top: 28px;
    height: 40px;
    padding: 0 18px;
    border: 1px solid var(--n-button-primary);
    border-radius: 999px;
    background: var(--n-button-primary);
    box-shadow: none;
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.01em;

    i {
      margin-right: 8px;
    }

    &:hover,
    &:focus {
      background: var(--n-button-primary-hover);
      border-color: var(--n-button-primary-hover);
    }
  }

    .n-logo {
      display: inline-block;
      width: 80px;
      height: 80px;
      box-sizing: border-box;
      z-index: 0;

      &::before {
        position: absolute;
        content: '';
        width: 65px;
        height: 60px;
        background: var(--n-text-color-base);
        opacity: 0.2;
        transform: translate(-35px, 25px) scaleY(0.5) skew(50deg);
        z-index: -1;
        filter: blur(5px);
        -webkit-mask-image: -webkit-gradient(linear, left top, left bottom, from(transparent), to(#000));
        mask-image: linear-gradient(to bottom, transparent, #000);
      }
    }

    .n-logo-text {
      margin-left: 60px;
      font-size: 80px;
      font-weight: 800;
      background: linear-gradient(180deg, var(--n-text-color-active) 0%, var(--n-text-color-base) 100%);
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
      z-index: 0;

      &::before {
        position: absolute;
        content: 'NxShell';
        color: var(--n-text-color-base);
        opacity: 0.2;
        transform: translate(-35px, 15px) scaleY(0.5) skew(50deg);
        z-index: -1;
        filter: blur(3px);
        -webkit-mask-image: -webkit-gradient(linear, left top, left bottom, from(transparent), to(#000));
        mask-image: linear-gradient(to bottom, transparent, #000);
      }
    }
  }

  .n-home-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    height: 40px;
    padding: 5px 15px;
    box-sizing: border-box;
    background-color: var(--n-bg-color-base);
    color: var(--n-text-color-base);

    &__feedback {
      display: flex;
      align-items: center;
      column-gap: 20px;

      .n-icon-button {
        font-size: 13px;
      }
    }
  }
}

.n-session-mode {
  min-width: 176px;
  padding: 6px;
  border: 1px solid var(--n-hover-bg-color);
  border-radius: 12px;
  background-color: var(--n-select-bg-color);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.22);

  &__item {
    display: flex;
    justify-content: flex-start;
    align-items: center;
    column-gap: 10px;
    padding: 8px 10px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    color: var(--n-text-color-light);
    transition: background-color 0.18s ease, color 0.18s ease;

    ::v-deep .n-icon {
      width: 16px;
      font-size: 16px;
      color: var(--n-text-color-base);
    }

    &:hover {
      cursor: pointer;
      color: var(--n-text-color-base);
      background-color: var(--n-select-hover-bg-color);
    }
  }
}

::v-deep .nx-session-popover.el-popover {
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
}
</style>
