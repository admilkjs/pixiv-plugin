import { JM } from '#model'
import { Express } from '#model'
import { Path } from '#components'
import path from 'path'
import { randomUUID } from 'crypto'
import { Config } from '#components'
let keys = {}
Express.router.use('/jm/:key', async (req, res) => {
    let key = keys[req.params.key]
    if (!key) {
        res.status(404).send('🚫 滚出去')
        return
    }
    const pdfDir = path.join(Path.PluginPath, 'resources', 'JM', 'pdf')
    let _path = await JM.find(pdfDir, key.name, key.encrypted)
    if (_path) {
        res.download(_path)
    } else {
        res.status(404).send('🚫 滚出去')
    }
})
export class JMComicPlugin extends plugin {
    constructor() {
        super({
            name: 'JM漫画下载器',
            dsc: 'JM漫画下载与管理',
            event: 'message',
            priority: 5000,
            rule: [
                { reg: /^[#/]?jmd\s*\d+$/i, fnc: 'download' },
                { reg: /^[#/]?jm\s*\d+$/i, fnc: 'pdf' },
                { reg: /^[#/]?清理jm$/i, fnc: 'clean' },
            ],
        })
    }
    async download(e) {
        const id = e.msg.match(/\d+/)[0]
        await e.reply(`⏳ 正在下载漫画 ${id}...`)
        let res = await JM.download(id)
        if (res) e.reply(`✅ ID: ${id} 下载完成！`)
        else e.reply(`❌ ID: ${id} 下载失败！详情请查看日志`)
    }
    async pdf(e) {
        let cfg = Config.getConfig('jm')
        const id = e.msg.match(/\d+/)[0]
        if (!JM.find(id)) await e.reply(`⏳ 正在下载PDF ${id}...`)
        let res = await JM.getPdf(id)
        if (!JM.find(id) && res) {
            await e.reply(`✅ ID: ${id} 下载完成！`)
        } else if (!res) {
            await e.reply(`❌ ID: ${id} 下载失败！详情请查看日志`)
        } else {
            await e.reply('🔒 开始加密PDF...')
            let pdf = await JM.encrypt(id)
            if (pdf) {
                await e.reply('📤 发送PDF中...')
                let reply = await e.reply(segment.file(pdf))
                if (!reply) {
                    if (cfg.sendAsLink) {
                        let ip = cfg.host !== ""? cfg.host : "127.0.0.1"
                        let pass = randomUUID().split('-')[0]
                        let time = cfg.time
                        await e.reply([
                            `📨 发送PDF失败,转为http链接...\n⏳ 有效期: ${cfg.time}分钟`,
                            `🔗 ${
                                e.bot.adapter?.name == 'QQBot'
                                    ? `http://${ip}:${Bot.server.address().port}/pixiv/jm/`.toUpperCase() + pass
                                    : `http://${ip}:${Bot.server.address().port}/pixiv/jm/${pass}`
                            }`,
                        ].join("\n"))
                        keys[pass] = {
                            name: id,
                            encrypted: true,
                        }
                        setTimeout(() => {
                            delete keys[pass]
                        }, 1000  * 60 * cfg.time)
                    } else {
                        await e.reply('❌ PDF发送失败')
                    }
                }
            } else {
                await e.reply('❌ PDF加密失败')
            }
        }
    }
    async clean(e) {
        await e.reply('🧹 正在清理JM缓存，请稍候...')
        try {
            const { deletedCount, sizeMB } = await JM.clean()
            await e.reply(`✅ 清理完成！\n🗑️ 删除文件数: ${deletedCount}\n💾 释放空间: ${sizeMB} MB`)
        } catch (err) {
            await e.reply('❌ 清理失败，请查看日志！')
            logger.error('清理 JM 缓存失败:', err)
        }
    }
}
