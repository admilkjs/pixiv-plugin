import express from 'express'
let isTRSS = Array.isArray(Bot.uin)
import { Config } from '#components'
class Express {
    constructor() {
        this.init()
    }

    init() {
        let cfg = Config.getYaml('config', 'jm')
        if (!isTRSS) {
            Bot.express = express()
                .use(express.urlencoded({ extended: false }))
                .use(express.json())
                .use(express.raw())
                .use(express.text())
            Bot.server = Bot.express.listen(cfg.port)
        }
        this.router = this.initRouter()
        Bot.express.use('/pixiv', this.router)
        Object.getOwnPropertyNames(this.router.__proto__).forEach((key) => {
            this[key] = this.router[key]
        })
    }

    initRouter() {
        return new Proxy(express.Router(), {
            get(target, prop) {
                if (['get', 'post', 'put', 'delete', 'patch', 'use'].includes(prop)) {
                    return (...args) => {
                        const path = args[0]
                        if (typeof path === 'string') {
                            const existingPathIndex = target.stack.findIndex(
                                (layer) => layer.route?.path === path && layer.route?.methods[prop]
                            )
                            if (existingPathIndex !== -1) {
                                target.stack.splice(existingPathIndex, 1)
                            }
                        }
                        return target[prop](...args)
                    }
                }
                return target[prop]
            },
        })
    }
}

export default new Express()
