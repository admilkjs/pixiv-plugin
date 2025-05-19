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
        const filePath = await JM.find(credential.name, credential.encrypted)
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
                { reg: /^[#/]?清理jm\s*(\S*)/i, fnc: 'clean' },
                { reg: /^[#/]?jm随机(本子)?/i, fnc: 'random' },
                { reg: /^[#/]?jm(帮助|help|说明|功能)$/i, fnc: 'help' },
            ],
        })
    }

    async download(e) {
        const id = this.extractId(e.msg)
        await this.sendFormattedReply(e, [`${EMOJI.DOWNLOAD} 任务已接收`, `🆔 ${id}`, '📶 接入下载节点...'])

        try {
            const result = await JM.download(id)
            await e.reply(
                result ? `${EMOJI.SUCCESS} 下载完成\n🆔 ${id}` : `${EMOJI.ERROR} 下载失败，查看日志`,
                `${EMOJI.PDF} 发送#jm id以获取PDF`
            )
        } catch (error) {
            Logger.error(`[JM] 下载异常: ${error}`)
            await e.reply(`${EMOJI.ERROR} 下载服务不可用`)
        }
    }
    async help(e) {
        const message = [
            `------------JM帮助------------`,
            `${EMOJI.DOWNLOAD} #jmd id 下载JM本子到本地`,
            `${EMOJI.PDF} #jm id 发送对应PDF`,
            `${EMOJI.PDF} #jm随机 随机发送一个本子`,
            `${EMOJI.CLEAN} #清理jm全部 清理全部内容`,
            `${EMOJI.CLEAN} #清理jm未加密 清理未加密的PDF`,
            `${EMOJI.CLEAN} #清理jm 加密 清理加密的PDF`,
        ]
        await this.sendFormattedReply(e, message)
        return true
    }
    async random(e) {
        const at = e.user_id
        //随机范围1-474493
        let randomNum = Math.floor(Math.random() * (474493 - 1 + 1)) + 1
        const message = [{ type: 'text', text: `#jm ${randomNum}` }]
        const msg = `#jm ${randomNum}`
        const loader = (await import('../../../lib/plugins/loader.js')).default
        const new_e = {
            atall: e.atall,
            atme: e.atme,
            block: e.block,
            font: e.font,
            from_id: at,
            isGroup: e.isGroup,
            isMaster: false,
            message: message,
            message_id: e.message_id,
            message_type: e.message_type,
            msg_id: e.msg_id,
            nt: e.nt,
            original_msg: msg,
            post_type: e.post_type,
            rand: e.rand,
            raw_message: msg,
            recall: e.recall,
            reply: e.reply,
            self_id: e.self_id,
            sender: {},
            seq: e.seq,
            sub_type: e.sub_type,
            time: e.time,
            user_id: at,
            msg: msg,
        }
        new_e.sender = new_e.member?.info || {
            card: at,
            nickname: at,
            user_id: at,
        }
        if (loader.groupGlobalCD) delete loader.groupGlobalCD[e.group_id]
        if (loader.groupCD) delete loader.groupCD[e.group_id]
        if (e.bot?.adapter?.name) new_e.bot = { adapter: { name: e.bot.adapter.name } }
        else new_e.bot = { adapter: { name: 'ICQQ' } }
        if (e.isGroup) {
            new_e.group = e.group
            new_e.group_id = e.group_id
            new_e.group_name = e.group_name
        } else {
            new_e.friend = e.friend
        }
        Logger.info(`[JM] 随机本子触发: ${randomNum} in 群:${e.group_id || '私聊'}`);
        try {
            // 直接调用 pdf 方法处理
            await this.pdf(new_e)
        } catch (error) {
            Logger.error(`[JM] 随机本子处理失败: ${error}`)
            await e.reply(`${EMOJI.ERROR} 随机本子处理失败，请重试`)
        }
        return true
    }
    async pdf(e) {
        const id = this.extractId(e.msg)
        const taskKey = Number(id)

        if (await this.checkExistingTask(e, taskKey)) {
            if (TASK_STATUS.get(taskKey).id === (e.isGroup? e.group_id:e.user_id)) {
                return
            }
            while (TASK_STATUS.has(taskKey)) {
                await new Promise((r) => setTimeout(r, 1500))
            }
            await e.reply(`${EMOJI.SUCCESS} 云端就绪,开始发送PDF...`)
            return this.processPDF(e, id)
        }

        TASK_STATUS.set(taskKey, {
            id: (e.isGroup? e.group_id:e.user_id),
            timestamp: Date.now(),
        })

        try {
            await this.processPDF(e, id)
        } finally {
            let config = Config.getConfig('jm')
            TASK_STATUS.delete(taskKey)
            if (config.deleteAll) {
                // 删除所有相关文件（图片和PDF）
                const { deletedCount, sizeMB } = await JM.clean({ includeImages: true, pdfType: 'all' }, id)
                Logger.info(`[JM] deleteAll已启用，已删除${deletedCount}个文件，释放${sizeMB}MB`)
            } else if (config.delete) {
                // 只删除图片
                const { deletedCount, sizeMB } = await JM.clean({ includeImages: true }, id)
                if (deletedCount !== 0)
                    await this.sendFormattedReply(e, [
                        `${EMOJI.SUCCESS} 无用Img清理完成`,
                        `🗑️ ${deletedCount}个文件`,
                        `💾 ${sizeMB}MB空间释放`,
                        `${EMOJI.PDF} PDF并未删除`,
                    ])
            }
        }
    }

    async clean(e) {
        const arg = e.msg.replace(/^[#/]清理jm\s*/i, '').trim()
        let options = { includeImages: false, pdfType: 'none' }
        const typeMap = {
            未加密: { pdfType: 'unencrypted' },
            加密: { pdfType: 'encrypted' },
            img: { includeImages: true },
            全部: { includeImages: true, pdfType: 'all' },
            '': { includeImages: true, pdfType: 'all' }, // 默认行为
        }

        if (Object.keys(typeMap).includes(arg)) {
            options = { ...typeMap[arg] }
        } else if (arg) {
            await e.reply(`${EMOJI.ERROR} 无效清理类型，可用选项：未加密/加密/img/全部`)
            return
        }

        await this.sendFormattedReply(e, [
            `${EMOJI.CLEAN} 存储优化启动`,
            `🔍 正在扫描：${this.getCleanTypeText(arg)}...`,
        ])

        try {
            const { deletedCount, sizeMB } = await JM.clean(options)
            const report = [`${EMOJI.SUCCESS} 清理完成`, `🗑️ 删除文件: ${deletedCount}个`, `💾 释放空间: ${sizeMB}MB`]

            if (options.pdfType !== 'all') {
                report.push(`📦 保留内容: ${this.getPreservedText(options)}`)
            }

            await this.sendFormattedReply(e, report)
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
            task.id === (e.isGroup? e.group_id:e.user_id) ? '⏳ 请等待本群相同任务处理完成' : '🚦 加入全局处理队列...请等待',
        ]

        await e.reply(messages.join('\n'))
        return true
    }

    async processPDF(e, id) {
        const config = Config.getConfig('jm')
        const baseMessages = [`${EMOJI.PDF} PDF生成中`, `🆔 ${id}`, `${EMOJI.PASSWORD} 密码: ${id}`]
        
        // 检查是否已有加密PDF
        if (await JM.find(id, true)) {
            try {
                Logger.info(`[JM] 找到已加密PDF: ${id}`)
                return await this.deliverPDF(e, await JM.find(id, true), id, config)
            } catch (error) {
                Logger.error(`[JM] 处理已加密PDF失败: ${error}`)
                return
            }
        }

        // 检查是否有未加密PDF，如果没有则下载并生成
        if (!(await JM.find(id))) {
            await this.sendFormattedReply(e, baseMessages)
            try {
                // 先下载本子
                const downloadResult = await JM.download(id)
                if (!downloadResult) {
                    throw new Error('下载失败')
                }
                // 生成PDF
                await JM.getPdf(id)
            } catch (error) {
                Logger.error(`[JM] 下载或生成PDF失败: ${error}`)
                await e.reply(`${EMOJI.ERROR} 下载或生成PDF失败，请重试`)
                return
            }
        }

        // 确保未加密PDF存在
        const unencryptedPath = await JM.find(id)
        if (!unencryptedPath) {
            await e.reply(`${EMOJI.ERROR} 未找到PDF文件，请重试`)
            return
        }

        try {
            // 生成加密PDF
            const pdfPath = await JM.encrypt(id)
            if (!pdfPath) {
                throw new Error('PDF加密失败')
            }
            await this.deliverPDF(e, pdfPath, id, config)
        } catch (error) {
            Logger.error(`[JM] 生成PDF失败: ${error}`)
            await e.reply([`${EMOJI.ERROR} 生成中断`, '🔧 请重试或检查这本本子是否存在'].join('\n'))
        }
    }

    async deliverPDF(e, pdfPath, id, config) {
        try {
            await e.reply(`${EMOJI.PDF} PDF生成完成\n${EMOJI.LOCK} 正在发送PDF...`)
            let res
            if (!segment.file)
                if (e.isGroup) {
                    if (e.group.sendFile) res = await e.group.sendFile(pdfPath)
                    else res = await e.group.fs.upload(pdfPath)
                } else {
                    res = await e.friend.sendFile(pdfPath)
                }
            else res = await e.reply(segment.file(pdfPath))
            if (!res) throw res
            return
        } catch (error) {
            Logger.warn(`[JM] 直接发送PDF失败: ${id}`, error)
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
        if (!message) return null
        const match = message.match(/\d+/)
        return match ? match[0] : null
    }
    getCleanTypeText(arg) {
        const map = {
            未加密: '未加密PDF',
            加密: '加密PDF',
            img: '临时图片',
            全部: '所有缓存',
            '': '默认缓存',
        }
        return map[arg] || '指定内容'
    }

    getPreservedText(options) {
        const preserved = []
        if (!options.includeImages) preserved.push('图片')
        if (options.pdfType === 'unencrypted') preserved.push('加密PDF')
        if (options.pdfType === 'encrypted') preserved.push('未加密PDF')
        return preserved.join(' + ') || '无'
    }
}
