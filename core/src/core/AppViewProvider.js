const {webContents, BrowserWindow} = require("electron");
const {EventEmitter} = require("events");

const AppRPC = require("./AppRPC");
const timeline = require("../utils/startupTimeline");

const WINDOW_TYPE = {
    MAIN_WINDOW: "mainWindow",
    SUB_WINDOW: "subWindow"
};

/**
 * @type {AppRPC.Channel}
 */
let windowProviderChannel = null;

let lastWindowProviderRequestId = 0;
let requestWaiters = {};

/** FIXME: 这段代码与AppRPC中有一段代码一样，以后可以考虑合并 */
class RequestWaiter {
    resolve = () => {};
    reject = () => {};
    promise = null;
    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this.resolve = (value) => {
                resolve(value);
            }
            this.reject = (e) => {
                reject(e);
            }
        });
    }

    wait() {
        return this.promise;
    }
}

function getLastWindowProviderRequestId() {
    let id = lastWindowProviderRequestId++;
    if (lastWindowProviderRequestId === Number.MAX_SAFE_INTEGER) {
        lastWindowProviderRequestId = 0;
    }
    return id;
}

/**
 * 处理Window提供者的响应
 *
 * @param {Object} viewInfo 视图信息
 * @param {Number} viewInfo.reqId 请求ID
 * @param {Number} viewInfo.webContentId webContentId
 */
function onWindowProviderResponse(viewInfo) {
    let waiter = requestWaiters[viewInfo.reqId];
    if (!waiter) {
        console.error(new Error("invalid view info"));
        return;
    }
    waiter.resolve(viewInfo);

    delete requestWaiters[viewInfo.reqId];
}


class ShellAppView extends EventEmitter{
    /** @type {webContents} */
    webContents = null;
    constructor(wc) {
        super();
        this.webContents = wc;
    }

    loadURL(url) {
        return this.webContents.loadURL(url);
    }
}

const subViewManager = {
    lastViewId: 0,
    views: {},
    getLastViewId() {
        // 不同于RPC类似的Request，理论上lastViewId用到最大的时候会变为0然后继续，但是这个为0的view很有可能依然存在
        // 不过Number.MAX_SAFE_INTEGER，应该在有生之年是用不完的了
        let id = this.lastViewId++;
        if (this.lastViewId >= Number.MAX_SAFE_INTEGER) {
            this.lastViewId = 0;
        }
        return id;
    },

    async callViewProvider(webContentId=null, method="", args=[]) {
        let reqId = getLastWindowProviderRequestId();
        windowProviderChannel.send({
            reqId,
            webContentId,
            method,
            args
        });
        let waiter = new RequestWaiter();
        requestWaiters[reqId] = waiter;
        let response = await waiter.wait();
        return response
    },

    async createView() {
        let {webContentId} = this.callViewProvider();
        const _this = this;
        let viewProxy = new Proxy({}, {
            get(target, p, receiver) {
                return async function(...args) {
                    return await _this.callViewProvider(webContentId, p, args)
                }
            },
            set(target, p, value, receiver) {
                // TODO:
            }
        })

        return viewProxy
    }
}

function get_nxshell_logo() {

}


const windowProviders = {
    async mainWindow (flags) {
        /** @type {import("electron/main").BrowserWindowConstructorOptions} */
        let options = {
            width: 1250,
            minWidth: 1250,
            height: 720,
            minHeight: 720,
            show: process.env.NODE_ENV === "production",
            webPreferences: {
                preload: `${__dirname}/AppClient.js`,
                webviewTag: true,
                contextIsolation: false,
                enableRemoteModule: true
            },
            icon: get_nxshell_logo()
        };
        let transparent = false;
        for (let winFlag of (flags || [])) {
            if (winFlag === "frameless") {
                options.frame = false;
            } else if (winFlag === "hidden") {
                options.titleBarStyle = process.platform === "darwin" ? "hiddenInset" : "hidden";
            } else if (winFlag === "transparent") {
                options.transparent = true;
                transparent = true;
            }
        }

        let window = new BrowserWindow(options);
        timeline.mark("new BrowserWindow() returned", {show: options.show, transparent});
        if (transparent) {
            // window.setIgnoreMouseEvents(true);
        }

        const showWindow = (label) => {
            if (!window.isDestroyed() && !window.isVisible()) {
                window.show();
                timeline.mark("window.show() called", label);
            }
        };

        // 启动追踪时，把渲染进程以 [startup] 开头的日志转发到主进程标准输出，
        // 这样一条终端上就能看到主/渲染两个进程交错的完整时间线
        if (timeline.ENABLED) {
            let rendererAlreadyPrinted = false;
            window.webContents.on("console-message", (event, level, message, line, sourceId) => {
                if (typeof message === "string" && message.indexOf("[startup]") === 0) {
                    rendererAlreadyPrinted = true;
                    console.log(message);
                }
            });

            // 打包产物里渲染进程默认不打印（NODE_ENV 不是 development），
            // 这里主动让它导出一份时间线；mark 在任何模式下都会采集，所以数据是全的。
            // 渲染进程已经自己打过日志（开发模式）就不再重复拉取
            window.webContents.once("did-finish-load", () => {
                setTimeout(() => {
                    if (rendererAlreadyPrinted || window.isDestroyed()) {
                        return;
                    }
                    window.webContents.executeJavaScript(
                        "window.__NXSHELL_STARTUP__ && window.__NXSHELL_STARTUP__.dump()"
                    ).catch(() => {
                        // 渲染进程未挂载打点工具时忽略
                    });
                }, 5000);
            });
        }

        window.once("ready-to-show", () => {
            timeline.mark("event ready-to-show");
            showWindow("ready-to-show");
        });

        window.webContents.once("dom-ready", () => {
            timeline.mark("event webContents dom-ready");
            showWindow("dom-ready");
        });

        // In packaged builds, ready-to-show can be unreliable with custom protocols.
        // Fall back to showing the window once the main frame finishes loading.
        window.webContents.once("did-finish-load", () => {
            timeline.mark("event did-finish-load");
            showWindow("did-finish-load");
        });

        window.webContents.once("did-stop-loading", () => {
            timeline.mark("event did-stop-loading");
            showWindow("did-stop-loading");
        });

        window.webContents.on("did-fail-load", (event, errorCode, errorDescription, validatedURL) => {
            console.error("main window load failed", {
                errorCode,
                errorDescription,
                validatedURL
            });
            showWindow();
        });

        return window;
    },

    async subWindow (flags) {
        // 总是创建新窗口
        return await windowProviders.mainWindow(flags);
    }
}


async function createWindow(windowType, flags) {
    let windowCtor = windowProviders[windowType] || windowProviders.mainWindow;

    return await windowCtor(flags);
}

/**
 * 注册一个窗口提供者
 *
 * @param {Channel} winProviderChannel window管理提供者提供的channel
 */
function registerWindowProvider(winProviderChannel) {
    if (windowProviderChannel) {
        return;
    }
    windowProviderChannel = winProviderChannel;

    winProviderChannel.on("data", (data) => {
        onWindowProviderResponse(data);
    });
}

module.exports = {
    WINDOW_TYPE,

    registerWindowProvider,

    createWindow
};
