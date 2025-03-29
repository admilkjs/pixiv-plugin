import { spawn, execFile } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import Path from '../../components/Path.js'
import YamlReader from '../../components/YamlReader.js'
import Config from '../../components/Config.js'
import Logger from '../utils/Logger.js'
import { promisify } from 'util'
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
export const check = async function check() {
    const execPromise = promisify(execFile)
    try {
        await execPromise('python', ['--version'])
        Logger.info('Python 已安装')
    } catch (err) {
        Logger.error('Python 未安装或未添加到环境变量中，请先安装 Python')
        throw new Error('Python 未安装')
    }
    try {
        await execPromise('python', ['-m', 'pip', 'show', 'jmcomic'])
        Logger.info('jmcomic 已安装')
    } catch {
        Logger.warn('jmcomic 未安装，正在安装...')
        try {
            await execPromise('python', ['-m', 'pip', 'install', 'jmcomic', '--U', '--break-system-packages'])
            Logger.info('jmcomic 安装成功')
        } catch (installErr) {
            Logger.error('安装 jmcomic 失败:', installErr)
            throw new Error('安装 jmcomic 失败')
        }
    }
    try {
        await execPromise('python', ['-m', 'pip', 'show', 'PyPDF2', '-U', '--break-system-packages'])
        Logger.info('PyPDF2 已安装')
    } catch {
        Logger.warn('PyPDF2 未安装，正在安装...')
        try {
            await execPromise('python', ['-m', 'pip', 'install', 'Py2PDF', '--upgrade'])
            Logger.info('Py2PDF 安装成功')
        } catch (installErr) {
            Logger.error('安装 Py2PDF 失败:', installErr)
            throw new Error('安装 Py2PDF 失败')
        }
    }
}

class ComicDownloader {
    static async downloadComic(comicId) {
        const comicDir = path.join(Configs.COMIC_BASE_DIR, 'img', comicId.toString())
        const pdfDir = path.join(Configs.COMIC_BASE_DIR, 'pdf')
        await fs.mkdir(path.join(Configs.COMIC_BASE_DIR, 'img'), { recursive: true })
        await fs.mkdir(path.join(Configs.COMIC_BASE_DIR, 'pdf'), { recursive: true })
        await fs.mkdir(pdfDir, { recursive: true })
        await fs.mkdir(comicDir, { recursive: true })

        let dir_rule = Cfg_yaml.get('dir_rule')
        let plugins = Cfg_yaml.get('plugins')
        // let postman = Cfg_yaml.get('postman')
        // cfg.proxy !== '' ? (postman.meta_data.proxies = cfg.proxy) : (postman.meta_data.proxies = 'system')
        plugins.after_photo[0].kwargs.pdf_dir = pdfDir
        dir_rule.base_dir = comicDir
        Cfg_yaml.set('dir_rule', dir_rule)
        Cfg_yaml.set('plugins', plugins)
        // Cfg_yaml.set('postman', postman)
        Cfg_yaml.save()

        return new Promise((resolve, reject) => {
            const child = spawn('jmcomic', [comicId.toString(), `--option=${Configs.COMIC_BASE_DIR}/option.yml`])
            child.on('close', async (code) => {
                if (code === 0) {
                    const pdfFilePath = await ComicDownloader.findPdfFile(pdfDir, comicId)
                    resolve(pdfFilePath)
                } else {
                    reject(new Error(`下载失败，退出码: ${code}`))
                }
            })
            child.on('error', (err) => reject(err))
        })
    }

    static async findPdfFile(pdfDir, comicId, encrypted = false) {
        const pdfPath = path.join(pdfDir, `${encrypted ? `${comicId}_encrypted` : `${comicId}`}.pdf`)
        try {
            await fs.stat(pdfPath)
            return pdfPath
        } catch {
            return null
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
        const imgDir = path.join(Configs.COMIC_BASE_DIR, 'img')
        const pdfDir = path.join(Configs.COMIC_BASE_DIR, 'pdf')
        let deletedCount = 0,
            totalSize = 0
        try {
            const imgItems = await fs.readdir(imgDir)
            for (const item of imgItems) {
                const itemPath = path.join(imgDir, item)
                const stat = await fs.stat(itemPath)
                totalSize += stat.size
                await fs.rm(itemPath, { recursive: true, force: true })
                deletedCount++
            }
        } catch (err) {
            Logger.warn('清理 img 文件夹时出错:', err)
        }
        try {
            const pdfItems = await fs.readdir(pdfDir)
            for (const item of pdfItems) {
                const itemPath = path.join(pdfDir, item)
                const stat = await fs.stat(itemPath)
                totalSize += stat.size
                await fs.rm(itemPath, { recursive: true, force: true })
                deletedCount++
            }
        } catch (err) {
            Logger.warn('清理 pdf 文件夹时出错:', err)
        }
        return {
            deletedCount,
            sizeMB: (totalSize / 1024 / 1024).toFixed(2),
        }
    }
    /**
     * 加密 PDF 文件，添加密码
     * @param {string|number} comicId - 漫画 ID，用作密码
     */
    static async encryptPDF(comicId) {
        const pdfDir = path.join(Configs.COMIC_BASE_DIR, 'pdf')
        const originalPdfPath = path.join(pdfDir, `${comicId}.pdf`)
        const encryptedPdfPath = path.join(pdfDir, `${comicId}_encrypted.pdf`)
        const password = comicId.toString()
        const pythonScriptPath = path.join(Path.PluginPath, 'model', 'JM', 'encrypt.py')
        try {
            await fs.stat(encryptedPdfPath)
            return encryptedPdfPath
        } catch {}

        try {
            await fs.access(originalPdfPath)
        } catch {
            return null
        }

        try {
            const execPromise = promisify(execFile)
            const { stdout, stderr } = await execPromise('python', [
                pythonScriptPath,
                originalPdfPath,
                encryptedPdfPath,
                password,
            ])
            if (stderr) {
                return null
            }
            Logger.info(`加密成功: ${encryptedPdfPath}`)
            return encryptedPdfPath
        } catch (err) {
            Logger.error(`执行 Python 脚本时出错: ${err.message}`)
            return null
        }
    }
    static async getencryptedPdf(id) {
        const encryptedPdfPath = await ComicDownloader.encryptPDF(id)
        if (encryptedPdfPath) {
            return encryptedPdfPath
        } else {
            return null
        }
    }
}

const getPdf = async (id) => {
    const pdfDir = path.join(Configs.COMIC_BASE_DIR, 'pdf')
    if (await ComicDownloader.findPdfFile(pdfDir, id)) return path.join(pdfDir, `${id}.pdf`)
    const pdfFilePath = await ComicDownloader.downloadComic(id)
    return pdfFilePath
}
const JM = {
    getPdf,
    find: ComicDownloader.findPdfFile,
    download: ComicDownloader.downloadComic,
    clean: ComicDownloader.cleanComicCache,
    encrypt: ComicDownloader.encryptPDF,
    getEncrypted: ComicDownloader.getencryptedPdf,
}
export default JM
