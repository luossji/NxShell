const { NxNode } = require("../../../common/nxsys/nodes");
import { NxTerminalClient } from "./terminal";
import { SFTPFileSystem } from "../filesystem/sftp";
import { FTPFileSystem } from "../filesystem/ftp";

class NxNodeClient extends NxNode {
    constructor(handler, sessionUUID, connProtocol, sessionConfig) {
        super(sessionUUID, connProtocol, sessionConfig);
        this.service = powertools.getService();
        this.handler = handler;
    }

    async init() {
        await this.service.callObject(this.handler, "init");
    }

    async updateConfig(newConfig) {
        // 本地这份 config 也一并更新，避免客户端与服务端节点配置不一致
        this.config = newConfig;
        await this.service.callObject(this.handler, "updateConfig", newConfig);
    }

    async getTerminalInstance(reuseConnId=-1, control_ch) {
        const termHandler = await this.service.callObject(this.handler, "getTerminalInstance", reuseConnId, control_ch);
        return new NxTerminalClient(termHandler);
    }

    async getFSInstance(reuseConnId=-1, control_ch) {
        const fsHandler = await this.service.callObject(this.handler, "getFSInstance", reuseConnId, control_ch);
        let fsIns = null;
        switch(this.protocol) {
            case 'FTP':
                fsIns =  new FTPFileSystem(fsHandler);
                break;
            case 'SFTP':
            default:
                fsIns = new SFTPFileSystem(fsHandler);
                break;
        }
        return fsIns;
    }

    async cancelPendingConnection(openToken) {
        return await this.service.callObject(this.handler, "cancelPendingConnection", openToken);
    }

    async getNetInstance(reuseConnId=-1) {}
    async getGUIInstance(reuseConnId=-1) {}
    async getUserInstance(reuseConnId=-1) {}

    dispose() {
        this.service.callObject(this.handler, "dispose");
    }
}

const nodeClients = Object.create(null);
const nodeClientsSessions = Object.create(null);

function createNodeClient(handler, sessionUUID, protocal, sessionConfig) {
    if (handler in nodeClients) {
        return nodeClients[handler];
    }

    const node = new NxNodeClient(handler, sessionUUID, protocal, sessionConfig);

    nodeClients[handler] = node;
    nodeClientsSessions[sessionUUID] = node;

    return node;
}

/**
 * 把当前会话配置同步给节点（含被服务端复用的节点）
 *
 * 服务端 createNodeSessionInstance 是按 sessionUUID 缓存的：命中缓存时直接
 * 返回已有实例，本次传入的 sessionConfig 会被丢弃；而实际建连读取的是节点实例
 * 内部那份 config（懒建连，打开终端/文件系统时才读）。
 * 因此「会话属性改完主机/端口后重新连接」若不同步，就会继续按旧配置建连
 * （典型表现：改了主机 IP，双击连接仍连旧 IP）。
 *
 * @param {NxNodeClient} client 节点客户端
 * @param {Object} sessionConfig 本次会话配置
 */
async function syncConfigToNode(client, sessionConfig) {
    if (!client || typeof client.updateConfig !== "function") {
        return;
    }
    try {
        await client.updateConfig(sessionConfig);
    } catch (e) {
        console.warn("sync session config to node failed", e);
    }
}

/**
 * 创建一个节点会话实例代理，指向服务的会话实例
 *
 * @param {String} sessionUUID 会话配置的UUID
 * @param {Object} sessionConfig 会话的配置
 * @returns {Promise.<Object.<Proxy>>}
 */
export async function createNodeSessionInstance(sessionUUID, sessionConfig) {
    const service = powertools.getService();
    const handler = await service.createNodeSessionInstance(sessionUUID, sessionConfig);

    const client = createNodeClient(handler, sessionUUID, sessionConfig.protocal, sessionConfig);

    // 节点可能被服务端复用，这里统一把本次配置推给它，保证建连目标与当前配置一致。
    // 放在这一层（所有会话类型的唯一入口）可以一次覆盖 SSH/Telnet/SFTP/FTP/串口/本地终端。
    await syncConfigToNode(client, sessionConfig);

    return client;
}

export async function getNodeSessionInstanceByUUID(sessionUUID) {
    const client = nodeClientsSessions[sessionUUID];

    if (!client) {
        throw new Error("no instance");
    }

    return client;
}