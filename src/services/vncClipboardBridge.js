/**
 * VNC 剪贴板桥
 *
 * 背景：macOS 内置「屏幕共享」的 RFB 服务端不发送也不接收标准剪贴板消息
 * （ServerCutText / ClientCutText —— Apple 只对自家 Screen Sharing.app 客户端
 * 开放私有剪贴板协议），第三方 RFB 客户端（noVNC）因此永远收不到远端剪贴板，
 * 发过去的 ClientCutText 也会被对端丢弃。
 *
 * 方案：复用同一台 Mac 上已连接的 SSH 会话，通过 pbpaste/pbcopy + SFTP 文件
 * 通道打通双向剪贴板：
 *   - 拉取（Mac -> Windows）：SSH 执行 pbpaste，输出用随机标记分隔解析后返回
 *   - 推送（Windows -> Mac）：文本写入本地临时文件，SFTP 上传，再由 pbcopy 导入
 *
 * 前提：远端 Mac 已开启 SSH（远程登录），且 SSH 登录用户与 Mac 当前 GUI 登录
 * 用户一致，否则 pbpaste/pbcopy 访问不到 GUI pasteboard；
 * SSH 会话需停留在 shell 提示符状态（不要在 vim/htop 等全屏程序中使用）。
 */
import sessionManager from "./sessionMgr";
import { SESSION_TYPES } from "./session";

const SSH_CMD_TIMEOUT = 15000;
const PBTOOLS_PROBE_TIMEOUT = 8000;
const REMOTE_CLIP_PATH = "/tmp/.nxshell-clipboard.txt";

/** 剪贴板桥错误码，视图层据此展示对应文案 */
export const CLIP_ERR = {
    NO_SSH_SESSION: "no-ssh-session",
    SSH_TIMEOUT: "ssh-timeout",
    PBTOOLS_MISSING: "pbtools-missing"
};

function clipError(code, message) {
    const err = new Error(message);
    err.code = code;
    return err;
}

/**
 * 按主机地址查找已连接的 SSH/Shell 会话实例
 * @param {String} host 主机地址（与 VNC 会话的 hostAddress 相同）
 * @return {Object|null} ShellSession 实例
 */
export function findSshSessionByHost(host) {
    if (!host) {
        return null;
    }
    const target = String(host).toLowerCase();
    const instances = sessionManager.getSessionIntances() || [];
    return instances.find((inst) => {
        if (!inst) {
            return false;
        }
        if (inst.type !== SESSION_TYPES.SHELL && inst.type !== SESSION_TYPES.SSH) {
            return false;
        }
        // 必须处于已连接状态（未清理的数据通道与终端实例）
        if (typeof inst.send_data !== "function" || !inst.terminal) {
            return false;
        }
        const cfg = inst.cfg || {};
        return String(cfg.hostAddress || "").toLowerCase() === target;
    }) || null;
}

function makeToken() {
    return "NXCLIP_" + Math.random().toString(36).slice(2, 10).toUpperCase();
}

function normalizeNewlines(text) {
    return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * 在 SSH 会话上执行一条命令，返回其标准输出（字符串）。
 *
 * 用随机标记包裹命令输出，从数据流中截取标记之间的内容。
 * 注意 pty 会回显命令本身，而命令文本里同样包含标记字符串，因此标记
 * 必须由真实换行（\r\n / \r / \n）包裹才有效——回显里 token 前后是
 * 字面 \n（反斜杠+n），不会误匹配；printf 真实打印的换行才会命中。
 *
 * @param {Object} sshSession ShellSession 实例
 * @param {String} command 要在远端 shell 执行的命令
 * @param {Number} [timeout] 超时时间（毫秒）
 * @return {Promise.<String>}
 */
function runCommandOverSsh(sshSession, command, timeout = SSH_CMD_TIMEOUT) {
    return new Promise((resolve, reject) => {
        const tokenBegin = makeToken();
        const tokenEnd = makeToken();
        const beginRe = new RegExp(`[\r\n]${tokenBegin}[\r\n]`);
        const endRe = new RegExp(`[\r\n]${tokenEnd}[\r\n]`);
        let raw = "";
        let settled = false;

        const finish = (fn, value) => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timer);
            sshSession.off("data", onData);
            fn(value);
        };

        const onData = (data) => {
            raw += Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
            // 先找到由真实换行包裹的开始标记（命令回显中的 token 不匹配）
            const beginMatch = beginRe.exec(raw);
            if (!beginMatch) {
                return;
            }
            const contentStart = beginMatch.index + beginMatch[0].length;
            const endMatch = endRe.exec(raw.slice(contentStart));
            if (!endMatch) {
                return;
            }
            let output = normalizeNewlines(raw.slice(contentStart, contentStart + endMatch.index));
            // 去掉包裹用的 printf 产生的首尾换行
            if (output.startsWith("\n")) {
                output = output.slice(1);
            }
            if (output.endsWith("\n")) {
                output = output.slice(0, -1);
            }
            finish(resolve, output);
        };

        const timer = setTimeout(() => {
            finish(reject, clipError(CLIP_ERR.SSH_TIMEOUT, "ssh command timed out"));
        }, timeout);

        sshSession.on("data", onData);
        sshSession.emit("send_data", `printf '\\n${tokenBegin}\\n'; ${command}; printf '\\n${tokenEnd}\\n'\n`);
    });
}

/**
 * 基于已有 SSH 连接创建 SFTP 文件通道（复用底层连接，不新开会话）
 * @param {Object} sshSession ShellSession 实例
 * @return {Promise.<SFTPFileSystem>}
 */
async function createSftpChannel(sshSession) {
    const service = powertools.getService();
    const control = service.createChannel();
    const connId = await sshSession.getTermConnId();
    const fs = await sshSession.nodeInstance.getFSInstance(connId, control.channelId);
    await fs.init();
    return fs;
}

/**
 * 探测远端 pbpaste/pbcopy 是否可用（依赖 Mac GUI 会话的 pasteboard 服务）
 */
async function ensureRemotePasteTools(sshSession) {
    const ret = await runCommandOverSsh(
        sshSession,
        "command -v pbpaste >/dev/null 2>&1 && command -v pbcopy >/dev/null 2>&1 && printf 'OK' || printf 'MISSING'",
        PBTOOLS_PROBE_TIMEOUT
    );
    if (ret.trim() !== "OK") {
        throw clipError(CLIP_ERR.PBTOOLS_MISSING, "pbpaste/pbcopy unavailable on remote");
    }
}

/**
 * 拉取远端（Mac）剪贴板内容
 * @param {String} host VNC 会话的主机地址
 * @return {Promise.<String>} 远端剪贴板文本（可能为空字符串）
 */
export async function pullRemoteClipboard(host) {
    const ssh = findSshSessionByHost(host);
    if (!ssh) {
        throw clipError(CLIP_ERR.NO_SSH_SESSION, `no connected ssh session for host: ${host}`);
    }
    await ensureRemotePasteTools(ssh);
    return await runCommandOverSsh(ssh, "pbpaste 2>/dev/null");
}

/**
 * 推送本地剪贴板内容到远端（Mac）
 * @param {String} host VNC 会话的主机地址
 * @param {String} text 要推送的文本
 * @return {Promise.<void>}
 */
export async function pushLocalClipboard(host, text) {
    const ssh = findSshSessionByHost(host);
    if (!ssh) {
        throw clipError(CLIP_ERR.NO_SSH_SESSION, `no connected ssh session for host: ${host}`);
    }
    await ensureRemotePasteTools(ssh);

    // 本地临时文件名跟随 editorSession 的命名模式，由服务端在其临时目录管理
    const localFile = `vncclip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fs = await createSftpChannel(ssh);
    try {
        await fs.writeFileContent(localFile, text);
        await fs.syncLocalToRemote(REMOTE_CLIP_PATH, localFile);
        await runCommandOverSsh(ssh, `pbcopy < ${REMOTE_CLIP_PATH} 2>/dev/null; rm -f ${REMOTE_CLIP_PATH}`);
    } finally {
        try {
            await fs.dispose();
        } catch (e) {
            // 忽略关闭错误
        }
    }
}
