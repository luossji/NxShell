import { SESSION_TYPES, SessionInterface, registerSessionFactory } from "./session";

/**
 * 是否为「系统屏幕共享」连接方式（native 模式调起 macOS 原生 App，不创建会话实例/不开 tab）
 */
export function isNativeScreenSharing(sessionConfig) {
    const cfg = sessionConfig?.config ?? sessionConfig;
    return cfg?.sessType === SESSION_TYPES.VNC && cfg?.client === "native";
}

/**
 * 当前平台是否支持系统「屏幕共享」App（渲染层 process.platform 不可用，用 userAgent 判断）
 */
export function isNativeScreenSharingSupported() {
    return /macintosh/i.test(navigator.userAgent);
}

/**
 * 调起 macOS 系统「屏幕共享」App。成功返回 vnc:// 地址，失败抛错。
 * 注意：连接类型（标准/高性能）由系统 App 自己记忆，URL 无法指定。
 */
export function launchNativeScreenSharing(sessionConfig) {
    const cfg = sessionConfig?.config ?? sessionConfig ?? {};
    const auth = cfg.username ? `${encodeURIComponent(cfg.username)}@` : "";
    const target = `vnc://${auth}${cfg.hostAddress || "localhost"}:${cfg.hostVncPort || 5900}`;
    const pid = window.powertools.spawnDetachedProcess("open", [target]);
    if (!pid) {
        throw new Error("failed to launch macOS Screen Sharing");
    }
    return target;
}

class VNCSession extends SessionInterface {
    fsInstance = null;
    cfg = null;
    constructor(params) {
        super(params.name, SESSION_TYPES.VNC);
        this.cfg = params;
    }

    async init() {
    }
}

async function createVNCSession(params) {
    return new VNCSession(params);
}

registerSessionFactory(SESSION_TYPES.VNC, createVNCSession);
