import { SESSION_TYPES, SessionInterface, registerSessionFactory } from "./session";
import {createNodeSessionInstance} from "./nxsys/nodes";

class FTPSession extends SessionInterface {
    fsInstance = null;
    cfg = null;
    constructor(params) {
        super(params.name, SESSION_TYPES.FTP);
        this.cfg = params;
    }

    async init() {
        const cfg = this.cfg;
        let nodeInstance;
        try {
            // 必须传原始会话配置（hostAddress/hostFtpPort 形态），与其他会话类型一致：
            // createNodeSessionInstance 统一把它推给节点 updateConfig()，
            // 而 ftpnode.updateConfig 期望的是会话格式。之前这里拼的是 ftp 客户端格式
            // （host/port），updateConfig 映射出 host=undefined，连接时报
            // "Cannot read properties of undefined (reading 'trim')"。
            nodeInstance = await createNodeSessionInstance(cfg.uuid, cfg);
            await nodeInstance.init();
        } catch (err) {
            console.error(err);
            this.emit("data", 'Connect to server failed! \r\n');
            this.emit("error", "Connect fail");
            return;
        }
        this.nodeInstance = nodeInstance;
    }

    async getFs() {
        if (this.fsInstance) {
            return this.fsInstance;
        }
        this.fsInstance = await this.nodeInstance.getFSInstance();
        await this.fsInstance.init()
        return this.fsInstance;
    }
}

async function createFTPSession(params) {
    const sessionInst = new FTPSession(params);
    await sessionInst.init();
    return sessionInst;
}

registerSessionFactory(SESSION_TYPES.FTP, createFTPSession);
