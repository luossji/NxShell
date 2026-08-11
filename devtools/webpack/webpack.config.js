const path = require("path");

module.exports = {
    mode: "production",
    target: "electron-main",
    entry: {
        index: "./ptservices/index.js"
    },
    node: {
        __dirname: false,
        __filename: false
    },
    output: {
        filename: "[name].js",
        path: path.resolve(__dirname, "dist"),
        libraryTarget: 'commonjs'
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                use: {
                    loader: "babel-loader"
                }
            },
	    {
        	test: /\.node$/,
        	loader: "node-loader",
      	    }
        ]
    },
    optimization: {
        minimize: true
    },
    externals: {
    "cpu-features": 'commonjs cpu-features',
	"serialport": 'serialport',
	"node-pty": 'node-pty'
    }
}
