const path = require("path")

const shellRoot = path.resolve(__dirname, "..", "..")
const coreRoot = path.join(shellRoot, "core")
const distRoot = path.join(coreRoot, "dist")

const babelModule = {
    rules: [
        {
            test: /\.js$/,
            use: {
                loader: "babel-loader"
            }
        }
    ]
}

const main = {
    mode: "production",
    target: "electron-main",
    context: coreRoot,
    node: {
        __dirname: false,
        __filename: false
    },
    entry: {
        index: "./src/index.js"
    },
    output: {
        filename: "[name].js",
        path: distRoot
    },
    module: babelModule,
    optimization: {
        minimize: true
    }
}

const loader = {
    mode: "production",
    target: "electron-main",
    context: coreRoot,
    node: {
        __dirname: false,
        __filename: false
    },
    entry: {
        AppLoader: "./src/core/AppLoader.js"
    },
    output: {
        filename: "[name].js",
        path: distRoot
    },
    module: babelModule,
    optimization: {
        minimize: true
    }
}

const preload = {
    mode: "production",
    target: "electron-preload",
    context: coreRoot,
    node: {
        __dirname: false,
        __filename: false
    },
    entry: {
        AppClient: "./src/core/AppClient.js"
    },
    output: {
        filename: "[name].js",
        path: distRoot
    },
    module: babelModule,
    optimization: {
        minimize: true
    }
}

module.exports = [main, loader, preload]