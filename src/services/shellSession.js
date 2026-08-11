import { SESSION_TYPES, SessionInterface, registerSessionFactory } from "./session";
import {createNodeSessionInstance} from "./nxsys/nodes";
import { NxTerminalClient } from "./nxsys/terminal";


const WaitObject = require("../../common/utils/waitObject");

/**
 * Shell会话
 * @extends {SessionInterface}
 */
class ShellSession extends SessionInterface {
    /**
     * Shell会话构造函数
     * @constructor
     * @param {Object} params Shell参数
     * @param {String} params.name 会话名称
     * @param {String} params.uuid 会话对应的UUID
     * @param {String} params.host 会话主机
     * @param {Number} params.port 会话端口
     * @param {String} [params.username] 用户名称，可选
     * @param {String} [params.password] 用户密码，可选
     * @param {String} [params.auth="password"] 认证方法
     */
    constructor(params) {
        super(params.name, SESSION_TYPES.SHELL);
        this.cfg = params;
        this.connId = params.connId;
        this.initSeq = 0;
        this.pendingOpenToken = null;
        this.closed = false;
    }

    async init() {
        const initSeq = ++this.initSeq;
        const pendingOpenToken = `${this.cfg.uuid || this.name}:${Date.now()}:${initSeq}`;
        this.pendingOpenToken = pendingOpenToken;
        this.closed = false;
        this.emit("data", "Connect to server ...\r\n\n");
        this.clientReady = new WaitObject();
        this.resize_window = async (cols, rows) => {
            this.current_cols_rows = {cols, rows};
            await this.clientReady.wait();
            if (!this.terminal) {
                return;
            }
            await this.terminal.setWindowSize(cols, rows);
        };
        this.on("resize", this.resize_window);

        let nodeInstance;
        try {
            nodeInstance = await createNodeSessionInstance(this.cfg.uuid, this.cfg);
            this.nodeInstance = nodeInstance;
            await nodeInstance.init();
        } catch (err) {
            if (this.closed || initSeq !== this.initSeq) {
                return;
            }
            this.emit("data", 'Connect to server failed! \r\n');
            this.emit("error", "Connect fail");
            return;
        }

        if (this.closed || initSeq !== this.initSeq) {
            await this._cancelPendingOpen(pendingOpenToken);
            return;
        }

        const service = powertools.getService();
        const control = service.createChannel();

        const unix_file = await service.getHsIPCHandle();
        const channel = await powertools.createHsIPC(unix_file);

        this.control_channel = control;
        this.data_channel = channel;
        
        this.control_channel_cb = (data) => {
            if(data.type === 'error') {
                this.emit('error', data.message);
            } else {
                this.emit("control", data);
            }
        }
        this.data_channel_cb = (data)=> {
            this.emit("data", data);
        }

        this.control_channel.on('data', this.control_channel_cb)
        this.data_channel.on('data', this.data_channel_cb)

        this.send_data = async (data) => {
            await this.data_channel.send(data);
        };
        this.on('send_data', this.send_data);

        let terminal;
        try {
            /**
             * @type {NxTerminalClient}
             */
            let connId = -1;
            if(this.connId >= 0) {
                connId = this.connId;
            }
            terminal = await nodeInstance.getTerminalInstance(connId, control.channelId, pendingOpenToken);
            if (this.closed || initSeq !== this.initSeq) {
                await terminal.dispose();
                this._cleanup_channels();
                return;
            }
            await terminal.init(this.cfg.xterm);
            if (this.closed || initSeq !== this.initSeq) {
                await terminal.dispose();
                this._cleanup_channels();
                return;
            }
            this.clientReady.resolve();
        } catch (err) {
            this._cleanup_channels();
            if (this.closed || initSeq !== this.initSeq || err?.level === 'client-cancelled') {
                return;
            }
            // notify to frontend
            let msg = err.toString();
            this.emit('data', new Buffer.from(msg));
            return;
        } finally {
            if (this.pendingOpenToken === pendingOpenToken) {
                this.pendingOpenToken = null;
            }
        }
        this.terminal = terminal;

        this.terminal.bindDataChannel(channel.channelId);        
    }

    async sendControlData(data) {
        this.control_channel.send(data);
    }

    async openTunnel() {
        return await this.terminal.openTunnel();
    }

    async getTermConnId() {
        return await this.terminal.getConnId();
    }

    async _cancelPendingOpen(openToken=this.pendingOpenToken) {
        if (!openToken || !this.nodeInstance || typeof this.nodeInstance.cancelPendingConnection !== 'function') {
            return;
        }
        try {
            await this.nodeInstance.cancelPendingConnection(openToken);
        } catch (e) {
            // ignore cancellation errors during teardown
        }
    }

    _cleanup_channels() {
        const sendDataListener = this.send_data;
        const resizeListener = this.resize_window;
        const controlChannelListener = this.control_channel_cb;
        const dataChannelListener = this.data_channel_cb;

        this.clientReady?.resolve?.(false);
        this.clientReady = null;
        if (typeof sendDataListener === 'function') {
            this.off("send_data", sendDataListener);
        }
        if (typeof resizeListener === 'function') {
            this.off("resize", resizeListener);
        }
        if (this.control_channel && typeof controlChannelListener === 'function') {
            this.control_channel.off("data", controlChannelListener);
        }
        if (this.data_channel && typeof dataChannelListener === 'function') {
            this.data_channel.off("data", dataChannelListener);
        }
        this.control_channel = null;
        this.data_channel = null;
        this.control_channel_cb = null;
        this.data_channel_cb = null;
        this.send_data = null;
        this.resize_window = null;
    }

    _close_terminal() {
        if(this.terminal) {
            this.terminal.dispose();
        }
        this.terminal = null;
        this._cleanup_channels();
    }

    close() {
        this.closed = true;
        this._cancelPendingOpen();
        if(this.terminal) {
            this._close_terminal();
        } else {
            this._cleanup_channels();
        }
        // this.emit("close");
        super.close();
    }

    async duplicate() {
        let session = new ShellSession(this.cfg);
        session.init();
        return session;
    }

    async refresh() {
        if(this.refreshing) {
            return;
        }
        this.refreshing = true;
        try {
            this._close_terminal();
            await this.init();
            if(this.current_cols_rows) {
                let { cols, rows } = this.current_cols_rows;
                this.resize_window(cols, rows)
            }
        }catch(e) {
            // do nothing
        }
        this.refreshing = false;
    }
}

async function createShellSession(params) {
    let session =  new ShellSession(params);
    session.init();
    return session;
}

registerSessionFactory(SESSION_TYPES.SHELL, createShellSession);
registerSessionFactory(SESSION_TYPES.SSH, createShellSession);
