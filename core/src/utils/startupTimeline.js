/**
 * 启动耗时打点（Electron 主进程）
 *
 * 设计要点：
 * 1. 默认不输出，设置环境变量 NXSHELL_STARTUP_TRACE=1 才打印，零业务影响；
 * 2. 每个点打印的都是「相对本进程启动的毫秒数」，同时输出一次本进程启动的
 *    epoch 毫秒，便于和渲染进程（performance.timeOrigin + performance.now()）
 *    的时间线对齐在一张表里看；
 * 3. 逐点即时打印而不是最后汇总，这样主进程/渲染进程的日志按时间自然交错，
 *    能直接看出「窗口显示时渲染进程走到哪一步了」。
 */

const {performance} = require("perf_hooks");

const ENABLED = process.env.NXSHELL_STARTUP_TRACE === "1";

// Electron 主进程内 Node 的 timeOrigin 近似等于主进程启动时刻
const ORIGIN_EPOCH = Math.round(performance.timeOrigin || Date.now());

function elapsed() {
    return Math.round(performance.now() * 10) / 10;
}

/**
 * 打印一行启动打点
 *
 * @param {String} label 打点名称
 * @param {*} [extra] 附加信息，字符串直接拼接，其他类型按 JSON 输出
 */
function mark(label, extra) {
    if (!ENABLED) {
        return;
    }

    let suffix = "";
    if (extra !== undefined) {
        suffix = " " + (typeof extra === "string" ? extra : JSON.stringify(extra));
    }

    console.log(`[startup][main] +${elapsed().toFixed(1)}ms ${label}${suffix}`);
}

/**
 * 打印本进程的时间基准，便于和渲染进程日志对齐
 *
 * @param {String} tag 标记名，默认 main
 */
function header(tag = "main") {
    if (!ENABLED) {
        return;
    }

    console.log(
        `[startup][${tag}] origin epoch=${ORIGIN_EPOCH} ` +
        `(${new Date(ORIGIN_EPOCH).toISOString()}) ` +
        `electron=${process.versions.electron} node=${process.versions.node} ` +
        `pid=${process.pid}`
    );
}

module.exports = {
    ENABLED,
    ORIGIN_EPOCH,
    elapsed,
    mark,
    header
};
