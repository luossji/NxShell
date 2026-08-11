const path = require("path")
const { spawn } = require("child_process")

const shellRoot = path.resolve(__dirname, "..")
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm"
const nodeCmd = process.execPath

let electronProcess = null
let shuttingDown = false
let devServerUrl = null
let resolveDevServer = null
let rejectDevServer = null

const devServerReady = new Promise((resolve, reject) => {
    resolveDevServer = resolve
    rejectDevServer = reject
})

function killProcess(child) {
    if (!child || child.killed) {
        return
    }

    child.kill("SIGTERM")
}

function shutdown(code = 0) {
    if (shuttingDown) {
        return
    }

    shuttingDown = true
    killProcess(electronProcess)
    killProcess(serveProcess)
    process.exit(code)
}

function captureDevServerUrl(text) {
    if (devServerUrl != null) {
        return
    }

    const match = text.match(/Local:\s+(http:\/\/[^\s]+)/)
    if (!match) {
        return
    }

    devServerUrl = match[1]
    resolveDevServer(devServerUrl)
}

function pipeStream(stream, prefix, writer) {
    let pending = ""

    stream.on("data", (data) => {
        const text = data.toString()
        pending += text
        captureDevServerUrl(pending)
        writer.write(`[${prefix}] ${text}`)

        const lines = pending.split(/\r?\n/)
        pending = lines.pop()
    })
}

function pipeOutput(child, prefix) {
    pipeStream(child.stdout, prefix, process.stdout)
    pipeStream(child.stderr, prefix, process.stderr)
}

const serveProcess = spawn(npmCmd, ["run", "serve"], {
    cwd: shellRoot,
    env: process.env,
    stdio: ["inherit", "pipe", "pipe"]
})

pipeOutput(serveProcess, "serve")

serveProcess.on("exit", (code) => {
    if (shuttingDown) {
        return
    }

    console.error(`serve exited with code ${code}`)
    shutdown(code || 1)
})

serveProcess.on("error", (error) => {
    console.error(error.message)
    shutdown(1)
})

const serveTimeout = setTimeout(() => {
    if (devServerUrl == null) {
        rejectDevServer(new Error("Dev server did not report a local URL in time"))
    }
}, 120000)

devServerReady.then((url) => {
    if (shuttingDown) {
        return
    }

    clearTimeout(serveTimeout)

    electronProcess = spawn(nodeCmd, [path.join(shellRoot, "devtools", "rundev.js")], {
        cwd: shellRoot,
        env: {
            ...process.env,
            POWERTOOLS_DEV_START_URL: url
        },
        stdio: ["inherit", "pipe", "pipe"]
    })

    pipeOutput(electronProcess, "app")

    electronProcess.on("exit", (code) => {
        if (shuttingDown) {
            return
        }

        shutdown(code || 0)
    })

    electronProcess.on("error", (error) => {
        console.error(error.message)
        shutdown(1)
    })
}).catch((error) => {
    clearTimeout(serveTimeout)
    console.error(error.message)
    shutdown(1)
})

process.on("SIGINT", () => shutdown(0))
process.on("SIGTERM", () => shutdown(0))