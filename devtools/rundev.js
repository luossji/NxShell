/**
 * 执行开发环境
 *
 * 设置NODE_ENV为development
 * 设置其他环境变量：
 *     启动页地址：POWERTOOLS_DEV_START_URL
 *     设置服务路径：POWERTOOLS_DEV_SERVICE_PATH
 */
const { spawn } = require("child_process")
const fs = require("fs")
const path = require("path")

const shellRoot = path.resolve(__dirname, "..")
const coreRoot = path.join(shellRoot, "core")
const electronCmd = path.join(shellRoot, "node_modules", ".bin", process.platform === "win32" ? "electron.cmd" : "electron")

let injectAppPackage = {
    name: "powertools-shell",
    version: require("../package.json").version,
    main: path.join(shellRoot, "ptservices", "index.js"),
    resources: {
        icon: "",
        path: path.join(shellRoot, "ptservices"),
        index: process.env.POWERTOOLS_DEV_START_URL || "http://localhost:8080"
    },
    start: {
        "view": "mainWindow",
        "viewFlags": ["frameless", "hidden"]
    }
}

if (!fs.existsSync(electronCmd)) {
    throw new Error(`Can not find root electron executable at ${electronCmd}`)
}

// 开发模式下同样需要生成 version 信息，与打包流程保持一致
const versionDir = path.join(coreRoot, "src", "version")
fs.mkdirSync(versionDir, { recursive: true })
fs.writeFileSync(path.join(versionDir, "version.json"), JSON.stringify({
    version: require("../package.json").version,
    portable: false,
    weblink: "https://gitee.com/luossji"
}))

process.chdir(coreRoot)
console.log("current dir:", process.cwd())

let electronProcess = spawn(electronCmd, [path.join(coreRoot, "src", "index.js")], {
    cwd: coreRoot,
    env: {
        ...process.env,
        NODE_ENV: "development",
        POWERTOOLS_DEV_PACKAGE: JSON.stringify(injectAppPackage)
    },
    stdio: ["inherit", "pipe", "pipe"]
})

electronProcess.stdout.on("data", (data) => {
    process.stdout.write(data)
})

electronProcess.stderr.on("data", (data) => {
    process.stderr.write(data)
})

electronProcess.on("error", (err) => {
    console.error(err.message)
})
