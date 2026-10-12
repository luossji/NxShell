import Vue from "vue";
import App from "./App.vue";
import router from "./router";
import pinia from "./store";

import { mark as startupMark, header as startupHeader, summary as startupSummary } from "@/tools/startupTimeline";

import "@fontsource/dejavu-mono";
import "./assets/scss/default.scss";

import PtComponents from "@/components";
import PtSessionManger from "@/services";

import Element from './element'
import '@/icons'
import { ensureFileIcons } from '@/icons'
import i18n from '@/locals'

startupHeader();
// 注意：ESM 的 import 会被提升，所以这里已经是「全部依赖模块加载并求值完成」的时刻
startupMark("main.js 模块体开始执行（依赖已求值）");

Vue.use(PtComponents);
Vue.use(PtSessionManger);
Vue.use(Element)

Vue.config.productionTip = false;

startupMark("Vue.use(组件/服务/element) 完成");

!async function () {
    startupMark("initService() 开始（等待 fork 出的 shell 服务响应）");
    await PtSessionManger.initService();
    startupMark("initService() 完成");

    new Vue({
        router,
        pinia,
        i18n,
        render: h => h(App)
    }).$mount("#app");
    startupMark("$mount() 返回");

    // 双 rAF 近似「首屏真正绘制到屏幕」的时刻
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            startupMark("首屏绘制完成（双 rAF）");
            startupSummary();
        });
    });

    /**
     * 首屏渲染完成后再预取文件类型图标（SFTP / 编辑器 / 文件页签用），
     * 不占用首屏关键路径；真正用到时会由 getFileIcon/getFolderIcon 兜底触发
     */
    const warmupFileIcons = () => ensureFileIcons().then(() => {
        startupMark("文件类型图标预热完成");
    });
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