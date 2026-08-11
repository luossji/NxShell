const fs = require("fs")
const path = require("path")
const shelljs = require("shelljs")

const shellRoot = path.resolve(__dirname, "..")
const packConfigDir = path.resolve(__dirname, "pack")
const coreDir = path.join(shellRoot, "core")
const packDir = path.join(shellRoot, ".pack")
const nativeDir = path.join(packDir, "native")
const distDir = path.join(shellRoot, "dist")
const webpackCmd = path.join(shellRoot, "node_modules", ".bin", process.platform === "win32" ? "webpack.cmd" : "webpack")
const coreWebpackConfig = path.join(shellRoot, "devtools", "webpack", "core.webpack.config.js")
const appPackageTemplatePath = path.join(packConfigDir, "app-package.json")
const nativePackageTemplatePath = path.join(packConfigDir, "native-package.json")
const builderConfigPath = path.join(packConfigDir, "build.yml")
const appPackageTemplate = require(appPackageTemplatePath)
const electronVersion = require(path.join(shellRoot, "package.json")).devDependencies.electron
const nativePackages = ["@serialport/bindings", "node-pty"]

function quoteArg(value) {
    return `"${String(value).replace(/"/g, '\\"')}"`
}

function run(command, options = {}) {
    const result = shelljs.exec(command, { silent: false, ...options })
    if (result.code !== 0) {
        throw new Error(`Command failed (${result.code}): ${command}`)
    }
    return result
}

function runElectronRebuild(packages) {
    const rebuildEnv = {
        ...process.env,
        npm_config_runtime: "electron",
        npm_config_target: electronVersion,
        npm_config_build_from_source: "true",
        npm_config_disturl: process.env.npm_config_disturl || "https://electronjs.org/headers"
    }

    if (process.env.npm_config_registry) {
        rebuildEnv.npm_config_registry = process.env.npm_config_registry
    }

    if (process.env.npm_config_msvs_version) {
        rebuildEnv.npm_config_msvs_version = process.env.npm_config_msvs_version
    }

    if (process.env.PYTHON) {
        rebuildEnv.PYTHON = process.env.PYTHON
    }

    packages.forEach((pkg) => {
        run(`npm rebuild ${pkg} --foreground-scripts`, { env: rebuildEnv })
    })
}

function toFix(value, size) {
    return `${value}`.padStart(size, "0")
}

function getBuildTimes() {
    const currentDate = new Date()
    return [
        toFix(currentDate.getUTCFullYear(), 4),
        toFix(currentDate.getUTCMonth() + 1, 2),
        toFix(currentDate.getUTCDate(), 2),
        toFix(currentDate.getUTCHours(), 2),
        toFix(currentDate.getUTCMinutes(), 2)
    ].join("")
}

function writeAppPackageJson() {
    fs.mkdirSync(packDir, { recursive: true })
    fs.writeFileSync(path.join(packDir, "package.json"), JSON.stringify(appPackageTemplate, null, 2))
}

function writeVersionJson() {
    const versionDir = path.join(coreDir, "src", "version")
    const portable = process.argv[2] === "portable"
    fs.mkdirSync(versionDir, { recursive: true })
    fs.writeFileSync(path.join(versionDir, "version.json"), JSON.stringify({
        version: appPackageTemplate.version,
        portable,
        weblink: "https://gitee.com/luossji"
    }))
}

function prepareWorkspace() {
    ;[packDir, distDir, path.join(coreDir, "dist"), path.join(shellRoot, "devtools", "webpack", "dist")].forEach((target) => shelljs.rm("-rf", target))
    shelljs.mkdir("-p", packDir)
}

function buildCore() {
    if (!shelljs.test("-f", path.join(coreDir, "src", "index.js")) || !shelljs.test("-f", coreWebpackConfig)) {
        throw new Error(`Can not find merged core sources in ${coreDir}`)
    }

    shelljs.cd(shellRoot)
    if (!shelljs.test("-d", "./node_modules")) {
        run("npm install --production=false")
    }

    run(`${quoteArg(webpackCmd)} --config ${quoteArg(coreWebpackConfig)}`, { cwd: shellRoot })
    shelljs.cp(path.join(coreDir, "dist", "*.js"), packDir)
    shelljs.cd(shellRoot)
}

function buildShellApp() {
    shelljs.cd(shellRoot)
    if (!shelljs.test("-d", "./node_modules")) {
        run("npm install --production=false")
    }

    runElectronRebuild(nativePackages)
    run("npm run build")
    run("node devtools/buildservice.js")
}

function buildNativeModules() {
    shelljs.mkdir("-p", nativeDir)
    shelljs.cp(nativePackageTemplatePath, path.join(nativeDir, "package.json"))
    shelljs.cd(nativeDir)
    run("npm install --production=false")
    runElectronRebuild(nativePackages)
    shelljs.cd(shellRoot)
}

function packageApp() {
    const buildEnv = {
        ...process.env,
        buildTimes: getBuildTimes()
    }

    shelljs.cd(shellRoot)
    run(`npx electron-builder --config ${quoteArg(builderConfigPath)}`, { env: buildEnv })
}

prepareWorkspace()
writeAppPackageJson()
writeVersionJson()
buildCore()
buildShellApp()
buildNativeModules()
packageApp()