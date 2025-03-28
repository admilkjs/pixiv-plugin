import { spawn } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import Path from '../../components/Path.js'
import YamlReader from '../../components/YamlReader.js'
import { Config } from '#components'
import { Logger } from '#utils'
let cfg = Config.getConfig('jm')
const PDF_PATH = path.join(Path.PluginPath, 'resources', 'JM')
const Configs = {
    COMIC_BASE_DIR: PDF_PATH,
    IMAGE_SETTINGS: {
        maxPerMessage: 60,
        supportedFormats: ['.jpg', '.jpeg', '.png', '.webp'],
    },
    PDF_SETTINGS: {
        maxSizeWarning: cfg.maxSize * 1024 * 1024,
    },
}

let Cfg_yaml = new YamlReader(`${Configs.COMIC_BASE_DIR}/option.yml`, true)

class ComicDownloader {
    static async downloadComic(comicId) {
        const comicDir = path.join(Configs.COMIC_BASE_DIR, comicId.toString())
        await fs.mkdir(comicDir, { recursive: true })

        let dir_rule = Cfg_yaml.get('dir_rule')
        let plugins = Cfg_yaml.get('plugins')
        plugins.after_photo[0].kwargs.pdf_dir = comicDir
        dir_rule.base_dir = comicDir
        Cfg_yaml.set('dir_rule', dir_rule)
        Cfg_yaml.set('plugins', plugins)
        Cfg_yaml.save()

        return new Promise((resolve, reject) => {
            const child = spawn('jmcomic', [comicId.toString(), `--option=${Configs.COMIC_BASE_DIR}/option.yml`])
            child.on('close', async (code) => {
                if (code === 0) {
                    try {
                        const pdfFilePath = await ComicDownloader.findPdfFile(comicDir, comicId)
                        resolve(pdfFilePath)
                    } catch (err) {
                        reject(new Error('找不到PDF文件: ' + err.message))
                    }
                } else {
                    reject(new Error(`下载失败，退出码: ${code}`))
                }
            })
            child.on('error', (err) => reject(err))
        })
    }

    static async findPdfFile(comicDir, comicId) {
        const pdfPath = path.join(comicDir, `${comicId}.pdf`)
        try {
            await fs.stat(pdfPath)
            return pdfPath
        } catch {
            throw new Error('未找到PDF文件')
        }
    }

    static async getSortedImageFiles(dir) {
        try {
            const files = await fs.readdir(dir)
            return files
                .filter((file) => Configs.IMAGE_SETTINGS.supportedFormats.includes(path.extname(file).toLowerCase()))
                .sort((a, b) => {
                    const numA = parseInt(a.match(/\d+/)?.[0] || 0)
                    const numB = parseInt(b.match(/\d+/)?.[0] || 0)
                    return numA - numB
                })
                .map((file) => path.join(dir, file))
        } catch {
            return []
        }
    }

    static async cleanComicCache() {
        const items = await fs.readdir(Configs.COMIC_BASE_DIR)
        let deletedCount = 0,
            totalSize = 0

        for (const item of items) {
            const itemPath = path.join(Configs.COMIC_BASE_DIR, item)
            try {
                const stat = await fs.stat(itemPath)
                totalSize += stat.size
                await fs.rm(itemPath, { recursive: true, force: true })
                deletedCount++
            } catch {}
        }

        return {
            deletedCount,
            sizeMB: (totalSize / 1024 / 1024).toFixed(2),
        }
    }
}

export default new ComicDownloader()

export const getPdf = async (id) => {
    try {
        const pdfFilePath = await ComicDownloader.downloadComic(id)
        return pdfFilePath
    } catch (error) {
        console.error('生成 PDF 出错:', error)
        return false
    }
}