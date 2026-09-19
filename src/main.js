import Vue from "vue";
import App from "./App.vue";
import router from "./router";
import pinia from "./store";

import "@fontsource/dejavu-mono";
import "./assets/scss/default.scss";

import PtComponents from "@/components";
import PtSessionManger from "@/services";

import Element from './element'
import '@/icons'
import { ensureFileIcons } from '@/icons'
import i18n from '@/locals'

Vue.use(PtComponents);
Vue.use(PtSessionManger);
Vue.use(Element)

Vue.config.productionTip = false;

!async function () {
    await PtSessionManger.initService();

    new Vue({
        router,
        pinia,
        i18n,
        render: h => h(App)
    }).$mount("#app");

    /**
     * 首屏渲染完成后再预取文件类型图标（SFTP / 编辑器 / 文件页签用），
     * 不占用首屏关键路径；真正用到时会由 getFileIcon/getFolderIcon 兜底触发
     */
    const warmupFileIcons = () => ensureFileIcons();
    if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(warmupFileIcons, { timeout: 3000 });
    } else {
        setTimeout(warmupFileIcons, 800);
    }
}();

window.addEventListener("keydown", (evt) => {
	if (evt.key === "F12") {
		evt.preventDefault();
		window.powertools.toggleDevTools();
		return;
	}
    if (evt.ctrlKey && evt.key === "r") {
        evt.preventDefault();
    }
    if (evt.metaKey && evt.key === "r") {
        evt.preventDefault();
    }
})