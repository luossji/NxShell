const os = require("os");
const {ipcRenderer, clipboard, shell, desktopCapturer} = require("electron");
const remote = require("@electron/remote");
const {RPCClient, ChannelClient, dispatch} = require("./AppRPC");
const { version, portable, weblink}= require('../version')
const { createConnect } = require('./HSpeedIPC');
const WebSocket = require('./vnctcpproxy');

const PID = process.pid;
let allServices = {};

function createIPCSend(serviceName) {
    let ipcChannel = `ptIPC:${serviceName}`;
    return function(data) {
        ipcRenderer.send(ipcChannel, data);
    }
}

function createRPC(serviceName) {
    const rpc = new RPCClient(createIPCSend(serviceName));

    return rpc;
}

function createChannel(serviceName) {
    const channelClient = new ChannelClient(createIPCSend(serviceName), PID);

    return channelClient;
}

function createIPCHandler(serviceName, serviceInstance) {
    let channelName = "ptIPC";
    if (serviceName) {
        channelName += ":" + serviceName;
    }

    ipcRenderer.on(channelName, (e, ...args) => {
        dispatch(args[0], 
            () => {},
            (rpcRetResponse) => {
                serviceInstance.rpcClient.dispatchResult(rpcRetResponse)
            },
            (channelData) => {
                serviceInstance.channelClient.dispatchChannelData(channelData);
            })
    });
}

class PowerToolsService {
    /** @type {RPCClient} */
    rpcClient = null;
    /** @type {ChannelClient} */
    channelClient = null;
    constructor(serviceName) {
        this.rpcClient = createRPC(serviceName);
        this.channelClient = createChannel(serviceName);

        createIPCHandler(serviceName, this);
    }
}

function createService(serviceName) {
    serviceName = serviceName || "";
    let serviceInstance = new PowerToolsService(serviceName);

    let instProxy = new Proxy(serviceInstance, {
        get(target, prop, recevier) {
            /** 
             * 保留一个createChannel调用
             * 意味着，在客户端，或者在服务端都不能再实现一个createChannel函数了
             */
            if (prop === "createChannel") {
                return function() {
                    return serviceInstance.channelClient.createChannel();
                };
            }

            return async function(...args) {
                return await serviceInstance.rpcClient.doCall(prop, ...args);
            }
        }
    });

    allServices[serviceName] = instProxy;

    return instProxy;
}

let mediaRecorder = null;
let recordedChunks = [];
let stream = null;
const DEVTOOLS_STATE_EVENT = "powertools-devtools-state-change";

function emitDevToolsStateChange(isOpened) {
    window.dispatchEvent(new CustomEvent(DEVTOOLS_STATE_EVENT, {
        detail: {
            isOpened
        }
    }));
}

function bindDevToolsStateEvents() {
    const webContents = remote.getCurrentWebContents();
    webContents.on('devtools-opened', () => {
        emitDevToolsStateChange(true);
    });
    webContents.on('devtools-closed', () => {
        emitDevToolsStateChange(false);
    });
}

async function start_capture() {
    let sources = await desktopCapturer.getSources({types: ['screen']});
    let source = sources.find(e => e.name === 'Screen');
    if(!source) {
        source = sources.find(e => e.name === 'Entire Screen');
    }
    if(!source && (sources.length !== 0)) {
        source = sources[0];
    }
    if(!source) {
        throw new Error('No screen found')
    }
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: source.id
                }
            }
        });
        const options = { mimeType: 'video/webm; codecs=vp9' };
        mediaRecorder = new MediaRecorder(stream, options);
        mediaRecorder.ondataavailable = (e)=> {
            recordedChunks.push(e.data);
        }
        mediaRecorder.start();
    } catch(err) {
        console.log('navigator get user media error ', err);
    }
}

async function stop_capture() {
    let buffer = null;
    return new Promise((resolve, reject)=> {
        if(mediaRecorder) {
            mediaRecorder.onstop = async ()=> {
                const blob = new Blob(recordedChunks, {
                    type: 'video/webm; codecs=vp9'
                });
                
                buffer = Buffer.from(await blob.arrayBuffer());
                mediaRecorder = null;
                recordedChunks = [];
                // release resource 
                stream.getTracks().forEach(function(track) {
                    track.stop();
                });
                resolve(buffer)
            };
            mediaRecorder.stop();
        } else {
            mediaRecorder = null;
            recordedChunks = [];
            resolve(buffer)
        }
    })
    
}

const powertools = {
    getService(serviceName) {
        let serviceInstance = allServices[serviceName || ""];
        if (!serviceInstance) {
            serviceInstance = createService(serviceName);
        }

        return serviceInstance;
    },

    getCurrentWindow() {
        return  remote.getCurrentWindow();
    },

    getCurrentWebContents() {
        return remote.getCurrentWebContents();
    },

    isDevToolsOpened() {
        return remote.getCurrentWebContents().isDevToolsOpened();
    },

    toggleDevTools() {
        const webContents = remote.getCurrentWebContents();
        if (webContents.isDevToolsOpened()) {
            webContents.closeDevTools();
            return webContents.isDevToolsOpened();
        }

        webContents.openDevTools({ mode: 'detach' });
        return webContents.isDevToolsOpened();
    },

    onDevToolsStateChange(listener) {
        if (typeof listener !== 'function') {
            return () => {};
        }

        const handler = (event) => {
            listener(Boolean(event?.detail?.isOpened));
        };

        window.addEventListener(DEVTOOLS_STATE_EVENT, handler);
        return () => {
            window.removeEventListener(DEVTOOLS_STATE_EVENT, handler);
        };
    },

    clipboardReadText() {
        return clipboard.readText();
    },

    clipboardWriteText(s) {
        return clipboard.writeText(s);
    },

    openExterUrl(url) {
        return shell.openExternal(url);
    },

    openDialog(url, options) {
        function optionsStringify() {
            if (!options) {
                return "";
            }
            
            return Object.keys(options).map(key => {
                return `${ key }=${ options[key] }`
            }).join(",")
        }
        return window.open(url, "modal", optionsStringify())
    },

    getAppDataDirty() {
        return remote.app.getPath('appData');
    },
    
    getAppHomeDirty() {
        return remote.app.getPath('home');
    },


    getLogDirty() {
        return remote.app.getPath('logs');
    },

    getAppPath() {
        return remote.app.getAppPath();
    },

    getProcessCwd() {
        return process.cwd();
    },

    openPath(url) {
        return shell.openPath(url);
    },

    pathExists(targetPath) {
        const fs = remote.require('fs');
        return fs.existsSync(targetPath);
    },

    commandExists(command, cwd) {
        if (!command) {
            return false;
        }

        const fs = remote.require('fs');
        const childProcess = remote.require('child_process');
        const path = remote.require('path');

        if (path.isAbsolute(command) || command.includes('\\') || command.includes('/')) {
            const resolvedPath = path.isAbsolute(command) ? command : path.resolve(cwd || process.cwd(), command);
            return fs.existsSync(resolvedPath);
        }

        const locator = process.platform === 'win32' ? 'where' : 'which';
        const result = childProcess.spawnSync(locator, [command], {
            cwd: cwd || undefined,
            windowsHide: true,
            stdio: 'ignore'
        });

        return result.status === 0;
    },

    spawnDetachedProcess(command, args = [], cwd) {
        const childProcess = remote.require('child_process');
        const child = childProcess.spawn(command, args, {
            cwd: cwd || undefined,
            detached: true,
            stdio: 'ignore',
            windowsHide: false
        });

        child.unref();
        return child.pid || 0;
    },

    runProcessWithTimeout(command, args = [], cwd, timeoutMs = 0, startupGraceMs = 300) {
        const childProcess = remote.require('child_process');

        return new Promise((resolve, reject) => {
            if (!powertools.commandExists(command, cwd)) {
                reject(new Error(`command not found: ${ command }`));
                return;
            }

            let settled = false;
            let child = null;

            try {
                child = childProcess.spawn(command, args, {
                    cwd: cwd || undefined,
                    stdio: 'ignore',
                    windowsHide: true,
                    shell: false
                });
            } catch (error) {
                reject(error);
                return;
            }

            let timer = null;
            let startupTimer = null;
            if (timeoutMs > 0) {
                timer = setTimeout(() => {
                    try {
                        child.kill('SIGTERM');
                    } catch (error) {
                    }
                }, timeoutMs);

                if (typeof timer.unref === 'function') {
                    timer.unref();
                }
            }

            const cleanup = () => {
                if (timer) {
                    clearTimeout(timer);
                }
                if (startupTimer) {
                    clearTimeout(startupTimer);
                }
            };

            child.once('error', (error) => {
                if (settled) {
                    return;
                }
                settled = true;
                cleanup();
                reject(error);
            });

            child.once('exit', (code) => {
                if (settled) {
                    return;
                }

                settled = true;
                cleanup();
                if (code === 0) {
                    resolve(child.pid || 0);
                    return;
                }

                reject(new Error(`process exited early with code ${ code }`));
            });

            startupTimer = setTimeout(() => {
                if (settled) {
                    return;
                }

                if (child.pid) {
                    settled = true;
                    cleanup();
                    resolve(child.pid);
                    return;
                }

                settled = true;
                cleanup();
                reject(new Error(`failed to start process: ${ command }`));
            }, startupGraceMs);

            if (typeof startupTimer.unref === 'function') {
                startupTimer.unref();
            }

            child.once('close', cleanup);
        });
    },

    runShellProcessWithTimeout(command, args = [], cwd, timeoutMs = 0, startupGraceMs = 300) {
        const childProcess = remote.require('child_process');
        const escapeShellArgument = (value) => {
            const stringValue = String(value ?? '');
            if (process.platform === 'win32') {
                if (stringValue.length === 0) {
                    return '""';
                }

                return `"${ stringValue
                    .replace(/(\\*)"/g, '$1$1\\"')
                    .replace(/(\\+)$/g, '$1$1') }"`;
            }

            return `'${ stringValue.replace(/'/g, `'"'"'`) }'`;
        };
        const commandLine = [command, ...args.map((item) => escapeShellArgument(item))].join(' ').trim();

        return new Promise((resolve, reject) => {
            if (!commandLine) {
                reject(new Error('command is empty'));
                return;
            }

            let settled = false;
            let child = null;

            try {
                child = childProcess.spawn(commandLine, [], {
                    cwd: cwd || undefined,
                    stdio: 'ignore',
                    windowsHide: true,
                    shell: true
                });
            } catch (error) {
                reject(error);
                return;
            }

            let timer = null;
            let startupTimer = null;
            if (timeoutMs > 0) {
                timer = setTimeout(() => {
                    try {
                        child.kill('SIGTERM');
                    } catch (error) {
                    }
                }, timeoutMs);

                if (typeof timer.unref === 'function') {
                    timer.unref();
                }
            }

            const cleanup = () => {
                if (timer) {
                    clearTimeout(timer);
                }
                if (startupTimer) {
                    clearTimeout(startupTimer);
                }
            };

            child.once('error', (error) => {
                if (settled) {
                    return;
                }
                settled = true;
                cleanup();
                reject(error);
            });

            child.once('exit', (code) => {
                if (settled) {
                    return;
                }

                settled = true;
                cleanup();
                if (code === 0) {
                    resolve(child.pid || 0);
                    return;
                }

                reject(new Error(`process exited early with code ${ code }`));
            });

            startupTimer = setTimeout(() => {
                if (settled) {
                    return;
                }

                if (child.pid) {
                    settled = true;
                    cleanup();
                    resolve(child.pid);
                    return;
                }

                settled = true;
                cleanup();
                reject(new Error(`failed to start process: ${ commandLine }`));
            }, startupGraceMs);

            if (typeof startupTimer.unref === 'function') {
                startupTimer.unref();
            }

            child.once('close', cleanup);
        });
    },

    showItemInFolder(url) {
        return shell.showItemInFolder(url);
    },

    getVersion() {
        return version;
    },

    getPortable() {
        return portable;
    },

    getWebLink() {
        return weblink;
    },

    createHsIPC(unix_file) {
        return createConnect(unix_file);
    },

    captureStart() {
        return start_capture();
    },

    captureStop() {
        return stop_capture();
    },

    getostype() {
        return os.type();
    }
};

async function initializeCoreService() {
    const coreService = powertools.getService("powershell-core");
    powertools.coreService = coreService;
    let viewManagerChannel = coreService.createChannel();
    await coreService.registerWindowProvider(viewManagerChannel.channelId);
    viewManagerChannel.on("data", ({reqId}) => {
        
    });
}

bindDevToolsStateEvents();

window.powertools = powertools;
window.WebSocket = WebSocket;
Object.freeze(powertools);
Object.defineProperty(window, "powertools", {
    writable: false
});
Object.freeze(WebSocket);
Object.defineProperty(window, "WebSocket", {
    writable: false
});
