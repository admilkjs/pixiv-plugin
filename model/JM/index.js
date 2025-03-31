import { spawn, execFile } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import Path from '../../components/Path.js'
import YamlReader from '../../components/YamlReader.js'
import Config from '../../components/Config.js'
import Logger from '../utils/Logger.js'
import { promisify } from 'util'
import Yaml from 'yaml'
const cfg = Config.getConfig('jm')
const BASE_DIR = path.join(Path.PluginPath, 'resources', 'JM')
const DIRS = {
    IMG: path.join(BASE_DIR, 'img'),
    PDF: {
        UNENCRYPTED: path.join(BASE_DIR, 'pdf', 'unencrypted'),
        ENCRYPTED: path.join(BASE_DIR, 'pdf', 'encrypted'),
    },
    OPTION: path.join(BASE_DIR, 'option.yml'),
}

const Configs = {
    COMIC_BASE_DIR: BASE_DIR,
    DEF_OPTION: {
        download: { cache: true, image: { decode: true }, threading: { image: 10, photo: 2 } },
        dir_rule: { base_dir: 666 },
        plugins: { after_album: [{ plugin: 'img2pdf', kwargs: { pdf_dir: 666, filename_rule: 'Aid' } }] },
    },
    IMAGE_SETTINGS: {
        maxPerMessage: 60,
        supportedFormats: ['.jpg', '.jpeg', '.png', '.webp'],
    },
    PDF_SETTINGS: {
        maxSizeWarning: cfg.maxSize * 1024 * 1024,
    },
}
let Cfg_yaml
async function init() {
    await fs.mkdir(DIRS.IMG, { recursive: true })
    await fs.mkdir(DIRS.PDF.UNENCRYPTED, { recursive: true })
    await fs.mkdir(DIRS.PDF.ENCRYPTED, { recursive: true })
    try {
        await fs.stat(DIRS.OPTION)
    } catch {
        await fs.writeFile(DIRS.OPTION, Yaml.stringify(Configs.DEF_OPTION))
    } finally {
        Cfg_yaml = new YamlReader(`${Configs.COMIC_BASE_DIR}/option.yml`, true)
    }
}
await init()
class Comic {
    async downloadComic(comicId) {
        const comicDir = path.join(DIRS.IMG, comicId.toString())
        let dir_rule = Cfg_yaml.get('dir_rule')
        let plugins = Cfg_yaml.get('plugins')
        let download = Cfg_yaml.get('download')
        download = cfg.download
        plugins.after_album[0].kwargs.pdf_dir = DIRS.PDF.UNENCRYPTED
        dir_rule.base_dir = comicDir
        Cfg_yaml.set('dir_rule', dir_rule)
        Cfg_yaml.set('plugins', plugins)
        Cfg_yaml.set('download', download)
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
        },
        comicId = null
    ) {
        let deletedCount = 0
        let totalSize = 0

        if (options.images) {
            const cleanPath = comicId ? path.join(DIRS.IMG, comicId.toString()) : DIRS.IMG

            try {
                const { count, size } = await this.deletePath(cleanPath)
                deletedCount += count
                totalSize += size
            } catch (err) {
                Logger.warn('清理图片缓存失败:', err)
            }
        }

        const pdfCleanTasks = []
        if (options.unencrypted) {
            pdfCleanTasks.push(this.cleanPdfFiles(DIRS.PDF.UNENCRYPTED, comicId))
        }
        if (options.encrypted) {
            pdfCleanTasks.push(this.cleanPdfFiles(DIRS.PDF.ENCRYPTED, comicId))
        }

        const pdfResults = await Promise.all(pdfCleanTasks)
        for (const { count, size } of pdfResults) {
            deletedCount += count
            totalSize += size
        }
await init()
        return {
            deletedCount,
            sizeMB: (totalSize / 1024 / 1024).toFixed(2),
        }
    }
    async deletePath(targetPath) {
        let count = 0
        let totalSize = 0

        try {
            const stat = await fs.stat(targetPath)
            if (stat.isDirectory()) {
                const files = await fs.readdir(targetPath)
                for (const file of files) {
                    const result = await this.deletePath(path.join(targetPath, file))
                    count += result.count
                    totalSize += result.size
                }
                await fs.rmdir(targetPath)
            } else {
                totalSize += stat.size
                await fs.unlink(targetPath)
                count++
            }
        } catch (err) {
            if (err.code !== 'ENOENT') throw err
        }

        return { count, size: totalSize }
    }
    async cleanPdfFiles(pdfDir, comicId) {
        let count = 0
        let totalSize = 0

        try {
            if (comicId) {
                const pdfPatterns = [`${comicId}.pdf`, `${comicId}_encrypted.pdf`]

                for (const pattern of pdfPatterns) {
                    const pdfPath = path.join(pdfDir, pattern)
                    const { count: c, size: s } = await this.deletePath(pdfPath)
                    count += c
                    totalSize += s
                }
            } else {
                const { count: c, size: s } = await this.deletePath(pdfDir)
                count += c
                totalSize += s
            }
        } catch (err) {
            Logger.warn(`清理PDF失败 [${pdfDir}]:`, err)
        }

        return { count, size: totalSize }
    }

    async encryptPDF(comicId) {
        await init()
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

    clean: async (options = {}, comicId = null) =>
        await ComicDownloader.cleanCache(
            {
                images: options.includeImages,
                unencrypted: options.pdfType === 'unencrypted' || options.pdfType === 'all',
                encrypted: options.pdfType === 'encrypted' || options.pdfType === 'all',
            },
            comicId
        ),

    encrypt: async (id) => await ComicDownloader.encryptPDF(id),
}

export default JM
