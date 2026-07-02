import { spawn, execFile } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import { promisify } from 'util'
import Path from '../../components/Path.js'
import YamlReader from '../../components/YamlReader.js'
import Config from '../../components/Config.js'
import Logger from '../utils/Logger.js'
import jmcomic from '@jmcomic/jmcomic'
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
/**
 * 初始化 JM 资源目录和配置文件。
 * - 确保图片和 PDF 的目录存在
 * - 如果缺少 option.yml 则写入默认配置
 * - 初始化 YamlReader 配置读取器
 */
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

let muhammaraModule = null
let muhammaraAvailable = false

try {
    const imported = await import('muhammara')
    muhammaraModule = imported.default ?? imported
    muhammaraAvailable = true
    // Logger.info('muhammara PDF 加密模块已加载，后续将直接使用该实现')
} catch (err) {
    Logger.warn(`muhammara PDF 加密模块不可用，将使用旧版 PDF 加密方法，可尝试运行 ${logger.green('pnpm approve-builds muhammara')} 修复 ，错误信息: `, err)
}

let externalJmcomicAvailable = null
/**
 * 检查系统是否已安装 jmcomic 命令行工具。
 * @returns {Promise<boolean>} 如果 jmcomic 可用则返回 true，否则返回 false
 */
async function hasExternalJmcomic() {
    if (externalJmcomicAvailable !== null) {
        return externalJmcomicAvailable
    }

    externalJmcomicAvailable = await new Promise((resolve) => {
        const child = spawn('jmcomic', ['--help'])

        child.on('error', () => resolve(false))
        child.on('close', (code) => resolve(code === 0))
    })

    return externalJmcomicAvailable
}

/**
 * 使用 muhammara 对 PDF 进行加密。
 * @param {string} sourcePath 未加密源 PDF 文件路径
 * @param {string} targetPath 加密后输出 PDF 文件路径
 * @param {string|number} comicId 漫画 ID，用于生成密码
 * @returns {Promise<string|null>} 成功返回目标路径，否则返回 null
 */
async function encryptWithMuhammara(sourcePath, targetPath, comicId) {
    if (!muhammaraAvailable || !muhammaraModule) {
        return null
    }

    try {
        Logger.debug(`使用 muhammara 加密漫画 ${logger.yellow(comicId)}`)
        const pdfDoc = new muhammaraModule.Recipe(sourcePath, targetPath)
        pdfDoc
            .encrypt({
                userPassword: comicId.toString(),
                ownerPassword: comicId.toString(),
                userProtectionFlag: 4,
            })
            .endPDF()

        return targetPath
    } catch (err) {
        Logger.warn('muhammara 加密失败，回退到旧的 PDF 加密方法:', err)
        return null
    }
}

/**
 * 使用旧版 pymupdf 命令对 PDF 进行加密。
 * @param {string} sourcePath 未加密源 PDF 文件路径
 * @param {string} targetPath 加密后输出 PDF 文件路径
 * @param {string|number} comicId 漫画 ID，用于生成密码
 * @returns {Promise<string|null>} 成功返回目标路径，否则返回 null
 */
async function encryptWithLegacyMethod(sourcePath, targetPath, comicId) {
    try {
        Logger.debug(`使用旧版 pymupdf 加密漫画 ${logger.yellow(comicId)}`)
        const { stderr } = await promisify(execFile)('pymupdf', [
            'clean',
            '-compress',
            '-encryption',
            'aes-256',
            '-password',
            comicId.toString(),
            '-user',
            comicId.toString(),
            '-owner',
            comicId.toString(),
            sourcePath,
            targetPath,
        ])

        return stderr ? null : targetPath
    } catch (err) {
        Logger.warn('旧版 PDF 加密方法失败:', err)
        return null
    }
}

/**
 * JM 漫画下载与 PDF 生成类。
 */
class Comic {
    /**
     * 下载指定漫画并生成未加密 PDF 文件。
     * @param {string|number} comicId 漫画 ID
     * @returns {Promise<string>} 生成的未加密 PDF 文件路径
     */
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

        const useSystemJmcomic = await hasExternalJmcomic()
        const args = [comicId.toString(), `--option=${Configs.COMIC_BASE_DIR}/option.yml`]
        const child = useSystemJmcomic
            ? spawn('jmcomic', args)
            : jmcomic.spawn(args)

        Logger.debug(`使用 ${logger.green(useSystemJmcomic ? '系统安装的jmcomic' : '内置jmcomic')} 下载漫画 ${logger.yellow(comicId)}，命令: ${logger.blue(child.spawnargs.join(' '))}`)

        return new Promise((resolve, reject) => {
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

    /**
     * 查找指定漫画的 PDF 文件路径。
     * @param {string|number} comicId 漫画 ID
     * @param {boolean} [encrypted=false] 是否查找加密 PDF
     * @returns {Promise<string|null>} 存在则返回文件路径，否则返回 null
     */
    async findPdfFile(comicId, encrypted = false) {
        const targetDir = encrypted ? DIRS.PDF.ENCRYPTED : DIRS.PDF.UNENCRYPTED
        const filename = `${comicId}.pdf`
        const pdfPath = path.join(targetDir, filename)

        try {
            await fs.stat(pdfPath)
            return pdfPath
        } catch {
            return null
        }
    }

    /**
     * 清理 JM 缓存目录。
     * @param {Object} options 清理选项
     * @param {boolean} options.images 是否清理图片缓存
     * @param {boolean} options.unencrypted 是否清理未加密 PDF
     * @param {boolean} options.encrypted 是否清理加密 PDF
     * @param {string|number|null} [comicId=null] 指定漫画 ID，则仅清理该漫画相关内容
     * @returns {Promise<{deletedCount:number,sizeMB:string}>} 删除数量和总大小（MB）
     */
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
    /**
     * 递归删除目标路径下的文件或目录。
     * @param {string} targetPath 要删除的文件或目录路径
     * @returns {Promise<{count:number,size:number}>} 删除的文件数量和总字节数
     */
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
    /**
     * 清理 PDF 目录中的文件。
     * @param {string} pdfDir PDF 目录路径
     * @param {string|number|null} comicId 指定漫画 ID，若为空则清理整个目录
     * @returns {Promise<{count:number,size:number}>} 删除结果
     */
    async cleanPdfFiles(pdfDir, comicId) {
        let count = 0
        let totalSize = 0

        try {
            if (comicId) {
                const pdfPatterns = [`${comicId}.pdf`]
                if (pdfDir === DIRS.PDF.ENCRYPTED) {
                    pdfPatterns.push(`${comicId}_encrypted.pdf`)
                }

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

    /**
     * 加密指定漫画的 PDF 文件。
     * - 优先使用 muhammara 加密
     * - 如果不可用则回退到旧版 pymupdf 加密方法
     * @param {string|number} comicId 漫画 ID
     * @returns {Promise<string>} 加密后的 PDF 路径或源文件路径
     */
    async encryptPDF(comicId) {
        await init()
        const sourcePath = path.join(DIRS.PDF.UNENCRYPTED, `${comicId}.pdf`)
        const targetPath = path.join(DIRS.PDF.ENCRYPTED, `${comicId}.pdf`)

        try {
            if (await this.findPdfFile(comicId, true)) {
                return targetPath
            }

            const muhammaraResult = await encryptWithMuhammara(sourcePath, targetPath, comicId)
            if (muhammaraResult) {
                return muhammaraResult
            }

            const legacyResult = await encryptWithLegacyMethod(sourcePath, targetPath, comicId)
            if (legacyResult) {
                return legacyResult
            }

            return sourcePath
        } catch (err) {
            Logger.error('PDF加密失败:', err)
            return sourcePath
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
