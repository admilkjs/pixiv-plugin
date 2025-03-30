import { JM } from '#model'
import { Express } from '#model'
import { Path } from '#components'
import { Logger } from '#utils'
import path from 'path'
import { randomUUID } from 'crypto'
import { Config } from '#components'

const TASK_STATUS = new Map()
const ACCESS_KEYS = {}
const EMOJI = {
    DOWNLOAD: '📥',
    SUCCESS: '✅',
    ERROR: '❌',
    CLEAN: '🧹',
    LOCK: '🔒',
    PDF: '📄',
    LINK: '🔗',
    PASSWORD: '🔑',
}

Express.router.use('/jm/:key', async (req, res) => {
    const { key } = req.params
    const credential = ACCESS_KEYS[key]

    if (!credential) {
        return res.status(403).send(`${EMOJI.ERROR} 访问凭证已失效`)
    }

    try {
        const pdfDir = path.join(Path.PluginPath, 'resources', 'JM', 'pdf')
        const filePath = await JM.find(pdfDir, credential.name, credential.encrypted)
        filePath ? res.download(filePath) : res.status(404).send(`${EMOJI.ERROR} 资源不存在`)
    } catch (error) {
        Logger.error(`[JM] 文件服务异常: ${error}`)
        res.status(500).send(`${EMOJI.ERROR} 服务端错误`)
    }
})

export class JMComicPlugin extends plugin {
    constructor() {
        super({
            name: 'JMComic',
            dsc: 'JM 漫画下载与加密管理',
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
        const id = this.extractId(e.msg)
        await this.sendFormattedReply(e, [`${EMOJI.DOWNLOAD} 任务已接收`, `🆔 ${id}`, '📶 接入下载节点...'])

        try {
            const result = await JM.download(id)
            await e.reply(result ? `${EMOJI.SUCCESS} 下载完成\n🆔 ${id}` : `${EMOJI.ERROR} 下载失败，查看日志`,`${EMOJI.PDF} 发送#jm id以获取PDF`)
        } catch (error) {
            Logger.error(`[JM] 下载异常: ${error}`)
            await e.reply(`${EMOJI.ERROR} 下载服务不可用`)
        }
    }

    async pdf(e) {
        const id = this.extractId(e.msg)
        const taskKey = Number(id)

        if (await this.checkExistingTask(e, taskKey)) {
            if (TASK_STATUS.get(taskKey).groupId === e.group_id) {
                return
            }
            while (TASK_STATUS.has(taskKey)) {
                await new Promise((r) => setTimeout(r, 1500))
            }
            await e.reply(`${EMOJI.SUCCESS} 云端就绪,开始发送PDF...`)
            return this.processPDF(e, id)
        }

        TASK_STATUS.set(taskKey, {
            groupId: e.group_id,
            timestamp: Date.now(),
        })

        try {
            await this.processPDF(e, id)
        } finally {
            TASK_STATUS.delete(taskKey)
            const { deletedCount, sizeMB } = await JM.clean(['img'])
            await this.sendFormattedReply(e, [
                `${EMOJI.SUCCESS} 无用Img清理完成`,
                `🗑️ ${deletedCount}个文件`,
                `💾 ${sizeMB}MB空间释放`,
                `${EMOJI.PDF} PDF并未删除`,
            ])
        }
    }

    async clean(e) {
        await this.sendFormattedReply(e, [`${EMOJI.CLEAN} 存储优化启动`, '🔍 扫描缓存文件...'])

        try {
            const { deletedCount, sizeMB } = await JM.clean()
            await this.sendFormattedReply(e, [
                `${EMOJI.SUCCESS} 清理完成`,
                `🗑️ ${deletedCount}个文件`,
                `💾 ${sizeMB}MB空间释放`,
            ])
        } catch (error) {
            Logger.error(`[JM] 清理失败: ${error}`)
            await e.reply(`${EMOJI.ERROR} 清理进程异常`)
        }
    }

    async checkExistingTask(e, taskKey) {
        if (!TASK_STATUS.has(taskKey)) return false

        const task = TASK_STATUS.get(taskKey)
        const messages = [
            `${EMOJI.LOCK} 任务冲突`,
            `🆔 ${taskKey}`,
            task.groupId === e.group_id ? '⏳ 请等待本群相同任务处理完成' : '🚦 加入全局处理队列...请等待',
        ]

        await e.reply(messages.join('\n'))
        return true
    }

    async processPDF(e, id) {
        const config = Config.getConfig('jm')
        const baseMessages = [`${EMOJI.PDF} PDF生成中`, `🆔 ${id}`,`${EMOJI.PASSWORD} 密码: ${id}`]

        if (!(await JM.find(id))) {
            await this.sendFormattedReply(e, baseMessages)
            await JM.getPdf(id)
        }

        try {
            const pdfPath = (await JM.encrypt(id))
            await this.deliverPDF(e, pdfPath, id, config)
        } catch (error) {
            Logger.error(`[JM] 生成失败: ${error}`)
            await e.reply([`${EMOJI.ERROR} 生成中断`, '🔧 请重试或检查存储'].join('\n'))
        }
    }

    async deliverPDF(e, pdfPath, id, config) {
        try {
            await e.reply(`${EMOJI.PDF} PDF生成完成\n${EMOJI.LOCK} 正在发送PDF...`)
            const reply = await e.reply(segment.file(pdfPath))
            if (reply?.message_id) return
        } catch (error) {
            Logger.warn(`[JM] 直接发送PDF失败: ${id}`)
        }

        if (config.sendAsLink) {
            await this.sendFallbackLink(e, id, config)
        } else {
            await e.reply(`${EMOJI.ERROR} 发送PDF失败`)
        }
    }

    async sendFallbackLink(e, id, config) {
        const passcode = randomUUID().split('-')[0]
        const baseUrl = this.generateBaseUrl(e, config.host)

        ACCESS_KEYS[passcode] = {
            name: id,
            encrypted: true,
            expires: Date.now() + config.time * 60 * 1000,
        }

        await this.sendFormattedReply(e, [
            `${EMOJI.PDF} PDF直接发送失败`,
            `${EMOJI.LINK} 备用通道建立`,
            `🆔 ${id}`,
            `⏳ ${config.time}分钟有效期`,
            `🌐 ${baseUrl}${passcode}`,
        ])

        this.scheduleCleanup(passcode, config.time)
    }

    generateBaseUrl(e, host) {
        const ip = host || '127.0.0.1'
        const port = Bot.server.address().port
        return e.bot.adapter?.name === 'QQBot'
            ? `http://${ip}:${port}/pixiv/jm/`.toUpperCase()
            : `http://${ip}:${port}/pixiv/jm/`
    }

    scheduleCleanup(passcode, time) {
        const timer = setTimeout(() => {
            if (ACCESS_KEYS[passcode]) {
                Logger.debug(`[JM] 清理凭证: ${passcode}`)
                delete ACCESS_KEYS[passcode]
            }
        }, time * 60 * 1000)
        timer.unref()
    }

    async sendFormattedReply(e, messages) {
        await e.reply(messages.join('\n'))
    }

    extractId(message) {
        return message.match(/\d+/)[0]
    }
}
