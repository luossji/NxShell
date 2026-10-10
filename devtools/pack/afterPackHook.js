const path = require("path")
const shelljs = require("shelljs")

const shellRoot = path.resolve(__dirname, "..", "..")
const shellDistDir = path.join(shellRoot, "dist")
const serviceDistDir = path.join(shellRoot, "devtools", "webpack", "dist")
const socksv5PackageDir = path.join(shellRoot, "node_modules", "socksv5")

function copyFrontendAssets(destDir) {
    if (!shelljs.test("-d", shellDistDir)) {
        return
    }

    shelljs.ls("-A", shellDistDir).forEach((entry) => {
        if (entry === "apppackage") {
            return
        }

        shelljs.cp("-rf", path.join(shellDistDir, entry), destDir)
    })
}

function copyPowertoolsShell(destDir) {
    shelljs.mkdir("-p", destDir)
    copyFrontendAssets(destDir)
    if (!shelljs.test("-d", serviceDistDir)) {
        throw new Error(`Missing packaged service bundle at ${serviceDistDir}`)
    }

    shelljs.ls("-A", serviceDistDir).forEach((entry) => {
        shelljs.cp("-rf", path.join(serviceDistDir, entry), destDir)
    })

    if (!shelljs.test("-d", socksv5PackageDir)) {
        throw new Error(`Missing socksv5 runtime files at ${socksv5PackageDir}`)
    }

    const socksv5RuntimeDir = path.join(destDir, "socksv5")
    shelljs.rm("-rf", socksv5RuntimeDir)
    shelljs.cp("-rf", socksv5PackageDir, socksv5RuntimeDir)

    shelljs.cp(path.join(shellRoot, "ptservices", "package.json"), destDir)
}

// macOS 27 起系统启用 NECP 校验：若进程的「代码签名 Identifier」与「Bundle Identifier」不一致，
// 内核会直接拦截发往局域网 IP 的 socket，并伪装成 EHOSTUNREACH（No route to host）。
// 表现：NxShell 连局域网 SSH/SFTP 必现失败，而系统终端 ssh 同一台机器正常。
// electron-builder 在本机找不到可用签名证书时会静默跳过签名，产出的 app 停留在 linker-signed
// 状态（Identifier=Electron、Info.plist 未绑定），因此必然触发上述拦截。
// 这里强制补一次 ad-hoc 签名，把 Identifier 对齐到 org.nxshell.shell 并密封整个 bundle；
// 若之后 electron-builder 用正式证书签名，会覆盖这次结果。
function adhocSignApp(appPath) {
    if (!shelljs.test("-d", appPath)) {
        return
    }

    const result = shelljs.exec(`codesign --force --deep --sign - --identifier org.nxshell.shell "${appPath}"`)
    if (result.code !== 0) {
        throw new Error(`Ad-hoc codesign failed for ${appPath}`)
    }
}

module.exports = async (context) => {
    console.log("context.outDir", context.outDir, context.appOutDir)
    if (process.platform === "darwin") {
        const appPath = path.join(context.appOutDir, "NxShell.app")
        const destDir = path.join(appPath, "Contents", "Resources", "apps", "powertools-shell")
        copyPowertoolsShell(destDir)
        adhocSignApp(appPath)
        return
    }

    const destDir = path.join(context.appOutDir, "resources", "apps", "powertools-shell")
    copyPowertoolsShell(destDir)
}