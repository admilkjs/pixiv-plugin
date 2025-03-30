import { spawn, execFile } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import Path from '../../components/Path.js'
import YamlReader from '../../components/YamlReader.js'
import Config from '../../components/Config.js'
import Logger from '../utils/Logger.js'
import { promisify } from 'util'

const cfg = Config.getConfig('jm')
const BASE_DIR = path.join(Path.PluginPath, 'resources', 'JM')
const DIRS = {
    IMG: path.join(BASE_DIR, 'img'),
    PDF: {
        UNENCRYPTED: path.join(BASE_DIR, 'pdf', 'unencrypted'),
        ENCRYPTED: path.join(BASE_DIR, 'pdf', 'encrypted'),
    },
}

const Configs = {
    COMIC_BASE_DIR: BASE_DIR,
    IMAGE_SETTINGS: {
        maxPerMessage: 60,
        supportedFormats: ['.jpg', '.jpeg', '.png', '.webp'],
    },
    PDF_SETTINGS: {
        maxSizeWarning: cfg.maxSize * 1024 * 1024,
    },
}

let Cfg_yaml = new YamlReader(`${Configs.COMIC_BASE_DIR}/option.yml`, true)

// 初始化目录结构
async function initDirs() {
    await fs.mkdir(DIRS.IMG, { recursive: true })
    await fs.mkdir(DIRS.PDF.UNENCRYPTED, { recursive: true })
    await fs.mkdir(DIRS.PDF.ENCRYPTED, { recursive: true })
}

class Comic {
    async downloadComic(comicId) {
        await initDirs()
        const comicDir = path.join(DIRS.IMG, comicId.toString())

        let dir_rule = Cfg_yaml.get('dir_rule')
        let plugins = Cfg_yaml.get('plugins')
        plugins.after_photo[0].kwargs.pdf_dir = DIRS.PDF.UNENCRYPTED
        dir_rule.base_dir = comicDir
        Cfg_yaml.set('dir_rule', dir_rule)
        Cfg_yaml.set('plugins', plugins)
        Cfg_yaml.save()

        return new Promise((resolve, reject) => {
            const child = spawn('jmcomic', [comicId.toString(), `--option=${Configs.COMIC_BASE_DIR}/option.yml`])

            child.on('close', async (code) => {
                if (code === 0) {
                    const pdfPath = path.join(DIRS.PDF.UNENCRYPTED, `${comicId}.pdf`)
                    resolve(pdfPath)
                } else {
                    reject(new Error(`下载失败，退出码: ${code}`))
                }
            })

            child.on('error', reject)
        })
    }

    async findPdfFile(comicId, encrypted = false) {
        const targetDir = encrypted ? DIRS.PDF.ENCRYPTED : DIRS.PDF.UNENCRYPTED
        const filename = encrypted ? `${comicId}_encrypted.pdf` : `${comicId}.pdf`
        const pdfPath = path.join(targetDir, filename)

        try {
            await fs.stat(pdfPath)
            return pdfPath
        } catch {
            return null
        }
    }

    async cleanCache(
        options = {
            images: false,
            unencrypted: false,
            encrypted: false,
        }
    ) {
        let deletedCount = 0
        let totalSize = 0

        if (options.images) {
            try {
                const files = await fs.readdir(DIRS.IMG)
                for (const file of files) {
                    const filePath = path.join(DIRS.IMG, file)
                    const stat = await fs.stat(filePath)
                    totalSize += stat.size
                    await fs.rm(filePath, { recursive: true, force: true })
                    deletedCount++
                }
            } catch (err) {
                Logger.warn('清理图片缓存失败:', err)
            }
        }

        if (options.unencrypted) {
            deletedCount += await this.cleanPdfDir(DIRS.PDF.UNENCRYPTED)
        }

        if (options.encrypted) {
            deletedCount += await this.cleanPdfDir(DIRS.PDF.ENCRYPTED)
        }

        return {
            deletedCount,
            sizeMB: (totalSize / 1024 / 1024).toFixed(2),
        }
    }

    async cleanPdfDir(dir) {
        let count = 0
        try {
            const files = await fs.readdir(dir)
            for (const file of files) {
                await fs.rm(path.join(dir, file))
                count++
            }
        } catch (err) {
            Logger.warn(`清理PDF目录失败 [${dir}]:`, err)
        }
        return count
    }

    async encryptPDF(comicId) {
        await initDirs()
        const sourcePath = path.join(DIRS.PDF.UNENCRYPTED, `${comicId}.pdf`)
        const targetPath = path.join(DIRS.PDF.ENCRYPTED, `${comicId}_encrypted.pdf`)

        try {
            if (await this.findPdfFile(comicId, true)) {
                return targetPath
            }

            const pythonScript = path.join(Path.PluginPath, 'model', 'JM', 'encrypt.py')
            const { stdout, stderr } = await promisify(execFile)('python', [
                pythonScript,
                sourcePath,
                targetPath,
                comicId.toString(),
            ])

            return stderr ? null : targetPath
        } catch (err) {
            Logger.error('PDF加密失败:', err)
            return null
        }
    }
}
const ComicDownloader = new Comic()
// 对外接口
const JM = {
    getPdf: async (id) => {
        const pdfPath = await ComicDownloader.findPdfFile(id)
        return pdfPath || ComicDownloader.downloadComic(id)
    },

    find: async (id, encrypted) => await ComicDownloader.findPdfFile(id, encrypted),

    download: async (id) => await ComicDownloader.downloadComic(id),

    clean: async (options = {}) =>
        await ComicDownloader.cleanCache({
            images: options.includeImages,
            unencrypted: options.pdfType === 'unencrypted' || options.pdfType === 'all',
            encrypted: options.pdfType === 'encrypted' || options.pdfType === 'all',
        }),

    encrypt: async (id) => await ComicDownloader.encryptPDF(id),
}

export default JM
