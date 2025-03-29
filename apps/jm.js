import { JM } from '#model'
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
            ],
        })
    }
    async download(e) {
        const id = e.msg.match(/\d+/)[0]
        await e.reply(`正在下载漫画 ${id}...`)
        let res = await JM.download(id)
        if (res) e.reply(`ID: ${id}下载完成！`)
        else e.reply(`ID: ${id}下载失败！,详情请查看日志`)
    }
    async pdf(e) {
        const id = e.msg.match(/\d+/)[0]
        if (!JM.find(id)) await e.reply(`正在下载PDF ${id}...`)
        else await e.reply(`正在发送PDF...`)
        let res = await JM.getPdf(id)
        if (!JM.find(id) && res) {
            await e.reply(`ID: ${id}下载完成！`)
        } else if (!res) {
            await e.reply(`ID: ${id}下载失败！,详情请查看日志`)
        } else {
            await e.reply('开始发送PDF')
            let pdf = await JM.encryptPDF(id)
            if (pdf) {
                await e.reply('发送PDF中')
                await e.reply(segment.file(pdf))
            } else {
                await e.reply('发送PDF失败,尝试转为http链接')
            }
        }
    }
}
