import fs from "fs";
import path from "path";
import { Logger } from "#utils";

/**
 * 文件操作工具类
 */
class FileUtils {
  /**
   * 检查文件是否存在
   * @param {string} filePath - 文件路径
   * @returns {Promise<boolean>}
   */
  static async fileExists(filePath) {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 创建目录
   * @param {string} dirPath - 目录路径
   */
  static async createDirectory(dirPath) {
    if (!await this.fileExists(dirPath)) {
      await fs.promises.mkdir(dirPath, { recursive: true });
    }
  }

  /**
   * 清理目录中的所有文件（使用 fs.rm 简化实现）
   * @param {string} dirPath - 目录路径
   */
  static async cleanDirectory(dirPath) {
    if (!await this.fileExists(dirPath)) return;
    
    try {
      // 删除目录及其内容
      await fs.promises.rm(dirPath, { recursive: true, force: true });
      // 重新创建空目录
      await fs.promises.mkdir(dirPath, { recursive: true });
    } catch (err) {
      Logger.warn(`清理目录失败: ${dirPath}`, err);
    }
  }

  /**
   * 安全删除目录
   * @param {string} dirPath - 目录路径
   */
  static async safeRemoveDirectory(dirPath) {
    if (!await this.fileExists(dirPath)) return;
    
    try {
      await fs.promises.rm(dirPath, { recursive: true, force: true });
    } catch (err) {
      if (err.code !== 'ENOENT') {
        Logger.error(`删除目录时出错: ${dirPath}`, err);
      }
    }
  }

  /**
   * 检查是否为PNG图片
   * @param {Buffer} buffer - 图片buffer
   * @returns {boolean}
   */
  static isPNGImage(buffer) {
    return buffer.length >= 8 && 
           buffer[0] === 0x89 && buffer[1] === 0x50 &&
           buffer[2] === 0x4E && buffer[3] === 0x47 &&
           buffer[4] === 0x0D && buffer[5] === 0x0A &&
           buffer[6] === 0x1A && buffer[7] === 0x0A;
  }

  /**
   * 检查是否为JPEG图片
   * @param {Buffer} buffer - 图片buffer
   * @returns {boolean}
   */
  static isJPEGImage(buffer) {
    return buffer.length >= 2 && 
           buffer[0] === 0xFF && buffer[1] === 0xD8;
  }

  /**
   * 格式化文件大小
   * @param {number} bytes - 字节数
   * @returns {string}
   */
  static formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }

  /**
   * 安全删除文件
   * @param {string} filePath - 文件路径
   * @param {string} [description] - 文件描述（用于日志）
   */
  static async safeUnlink(filePath, description = '文件') {
    try {
      await fs.promises.unlink(filePath);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        Logger.error(`删除${description}失败:`, err);
      }
    }
  }

  /**
   * 批量安全删除文件
   * @param {Array<{path: string, description?: string}>} files - 文件列表
   */
  static async safeUnlinkMany(files) {
    await Promise.all(
      files.map(file => this.safeUnlink(file.path, file.description))
    );
  }
}

export { FileUtils };
export default FileUtils;
