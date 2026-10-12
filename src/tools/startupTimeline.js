/**
 * 启动耗时打点（渲染进程）
 *
 * 时间基准是 performance.timeOrigin（即本次页面导航开始时刻），
 * 所以第一个点的耗时 = 「HTML 开始加载 → main.js 模块体执行」，
 * 涵盖了 bundle 下载/解析/求值 + HTML 解析的开销。
 *
 * 打开方式（任选其一）：
 *   1. 开发模式（process.env.NODE_ENV === "development"）默认开启；
 *   2. 控制台执行 localStorage.setItem("NXSHELL_STARTUP_TRACE", "1") 后刷新；
 *   3. 打包产物若注入了 NXSHELL_STARTUP_TRACE=1 也会开启。
 */

export const ENABLED = (() => {
    try {
        if (typeof process !== "undefined" && process.env && process.env.NXSHELL_STARTUP_TRACE === "1") {
            return true;
        }
        if (typeof process !== "undefined" && process.env && process.env.NODE_ENV === "development") {
            return true;
        }
        if (typeof localStorage !== "undefined" && localStorage.getItem("NXSHELL_STARTUP_TRACE") === "1") {
            return true;
        }
    } catch (e) {
        // 忽略环境读取异常，按关闭处理
    }
    return false;
})();

export const ORIGIN_EPOCH = Math.round(
    (typeof performance !== "undefined" && performance.timeOrigin) || Date.now()
);

const marks = [];

function elapsed() {
    return Math.round(performance.now() * 10) / 10;
}

/**
 * 打印一行启动打点
 *
 * @param {String} label 打点名称
 * @param {*} [extra] 附加信息
 */
export function mark(label, extra) {
    const at = elapsed();
    marks.push({label, at});

    if (!ENABLED) {
        return at;
    }

    let suffix = "";
    if (extra !== undefined) {
        suffix = " " + (typeof extra === "string" ? extra : JSON.stringify(extra));
    }

    // 主进程会转发以 [startup] 开头的 console 输出，两边日志会汇到同一条时间线上
    console.log(`[startup][renderer] +${at.toFixed(1)}ms ${label}${suffix}`);
    return at;
}

/**
 * 打印渲染进程的时间基准
 */
export function header() {
    if (!ENABLED) {
        return;
    }

    console.log(
        `[startup][renderer] origin epoch=${ORIGIN_EPOCH} ` +
        `(${new Date(ORIGIN_EPOCH).toISOString()}) ` +
        `href=${location.href}`
    );
}

/**
 * 打印相邻打点之间的间隔，用于快速定位最慢的一段
 *
 * @param {Boolean} [force] 为 true 时忽略 ENABLED 强制输出，
 *                          便于在未开启追踪的打包产物里手动调用
 */
export function summary(force = false) {
    if ((!ENABLED && !force) || marks.length === 0) {
        return;
    }

    for (let i = 0; i < marks.length; i++) {
        const prev = i === 0 ? 0 : marks[i - 1].at;
        const gap = Math.round((marks[i].at - prev) * 10) / 10;
        console.log(
            `[startup][renderer]   +${String(marks[i].at.toFixed(1)).padStart(8)}ms ` +
            `(段 +${String(gap).padStart(7)}ms)  ${marks[i].label}`
        );
    }
}

if (typeof window !== "undefined") {
    // mark 始终采集（开销只是往数组里塞一个对象），
    // 因此在打包产物里可以直接在 devtools 执行 __NXSHELL_STARTUP__.dump() 看时间线
    window.__NXSHELL_STARTUP__ = {
        marks,
        mark,
        ENABLED,
        dump: () => summary(true)
    };
}
