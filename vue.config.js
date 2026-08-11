const path = require('path')

function resolve(dir = '') {
    return path.join(__dirname, './src', dir)
}

module.exports = {
    publicPath: process.env.NODE_ENV === 'production' ? './' : '/',
    configureWebpack: {
        resolve: {
            extensions: ['.ts', '.tsx', '.js', '.json']
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
        /@xterm[\\/]/        // 告诉 babel-loader 转译 @xterm 开头的包
    ]
}
