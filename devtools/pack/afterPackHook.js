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

module.exports = async (context) => {
    console.log("context.outDir", context.outDir, context.appOutDir)
    if (process.platform === "darwin") {
        const destDir = path.join(context.appOutDir, "NxShell.app", "Contents", "Resources", "apps", "powertools-shell")
        copyPowertoolsShell(destDir)
        return
    }

    const destDir = path.join(context.appOutDir, "resources", "apps", "powertools-shell")
    copyPowertoolsShell(destDir)
}