const path = require('path')

function resolve(dir = '') {
    return path.join(__dirname, './src', dir)
}

module.exports = {
    publicPath: process.env.NODE_ENV === 'production' ? './' : '/',
    configureWebpack: {
        resolve: {
            extensions: ['.ts', '.tsx', '.js', '.json'],
            alias: {
                // trzsz 的 module 入口(trzsz.mjs)含 webpack4 无法解析的新语法，强制走 ES5 的 CJS 产物
                trzsz: path.resolve(__dirname, 'node_modules/trzsz/lib/trzsz.js')
            }
        },
        module: {
            rules: [
                {
                    test: /\.tsx?$/,
                    exclude: /node_modules/,
                    use: {
                        loader: 'ts-loader',
                        options: {
                            appendTsSuffixTo: [/\.vue$/],
                            projectReferences: true,
                            compilerOptions: {
                                noEmit: false
                            }
                        }
                    }
                },
                {
                    test: /\.mjs$/,
                    include: /node_modules/,
                    type: "javascript/auto"
                }
            ]
        }
    },
    chainWebpack: (config) => {
        // set svg-sprite-loader
        config.module.rule('svg').exclude.add(resolve('icons')).end()
        config.module
            .rule('icons')
            .test(/\.svg$/)
            .include.add(resolve('icons'))
            .end()
            .use('svg-sprite-loader')
            .loader('svg-sprite-loader')
            .options({
                symbolId: 'icon-[name]'
            })
            .end()
    },
    transpileDependencies: [
        /@xterm[\\/]/,       // 告诉 babel-loader 转译 @xterm 开头的包
        /trzsz[\\/]/         // trzsz 产物含 class static fields 等 webpack4(acorn6) 解析不了的语法
    ]
}
