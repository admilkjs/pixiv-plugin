import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import { Config } from "#components";
import { Logger } from "#utils";
import { CONSTANTS } from "../constants.js";
import FileUtils from "./FileUtils.js";

/**
 * 图片下载器类
 */
class ImageDownloader {
  constructor() {
    this.headers = {
      'User-Agent': CONSTANTS.USER_AGENT,
      'Referer': 'https://www.pixiv.net/',
    };
    this.config = Config.getConfig("parse");
  }

  /**
   * 批量下载图片
   * @param {Array} artworks - 作品列表
   * @param {string} pid - 作品ID
   * @param {string} cacheDir - 缓存目录
   * @param {Object} options - 下载选项
   * @returns {Promise<Array>}
   */
  async downloadImages(artworks, pid, cacheDir, options = {}) {
    if (!artworks || artworks.length === 0) return [];
    
    const retryCount = options.retryCount || this.config.download?.retry_count || CONSTANTS.DEFAULT_RETRY_COUNT;
    const maxRetryDelay = options.maxRetryDelay || this.config.download?.max_retry_delay || CONSTANTS.MAX_RETRY_DELAY;
    const concurrent = options.concurrent || this.config.download?.concurrent || 10;
    
    Logger.info(`开始下载图片，共${artworks.length}张，重试次数: ${retryCount}, 并发数: ${concurrent}`);
    
    if (options.progressCallback) {
      options.progressCallback(`开始下载${artworks.length}张图片，可能需要一些时间...`);
    }
    
    // 分批下载图片
    const batchSize = concurrent;
    const batches = [];
    for (let i = 0; i < artworks.length; i += batchSize) {
      batches.push(artworks.slice(i, i + batchSize));
    }
    
    const downloadedImages = [];
    for (const batch of batches) {
      const downloadPromises = batch.map((artwork, index) => 
        this.downloadSingleImage(artwork, pid, cacheDir, index + 1, retryCount, maxRetryDelay)
      );
      
      const results = await Promise.all(downloadPromises);
      downloadedImages.push(...results.filter(Boolean));
      
      if (options.progressCallback) {
        options.progressCallback(`已下载 ${downloadedImages.length}/${artworks.length} 张图片`);
      }
    }
    
    Logger.info(`图片下载完成，成功: ${downloadedImages.length}张，失败: ${artworks.length - downloadedImages.length}张`);
    
    if (options.progressCallback) {
      const failedCount = artworks.length - downloadedImages.length;
      if (failedCount > 0) {
        options.progressCallback(`图片下载完成，成功: ${downloadedImages.length}张，失败: ${failedCount}张`);
      }
    }
    
    return downloadedImages.sort((a, b) => a.index - b.index);
  }

  /**
   * 下载单张图片
   * @param {Object} artwork - 作品信息
   * @param {string} pid - 作品ID
   * @param {string} cacheDir - 缓存目录
   * @param {number} index - 图片索引
   * @param {number} retryCount - 重试次数
   * @param {number} maxRetryDelay - 最大重试延迟
   * @returns {Promise<Object|null>}
   */
  async downloadSingleImage(artwork, pid, cacheDir, index, retryCount, maxRetryDelay) {
    const originalUrl = artwork.original;
    const fileName = path.basename(originalUrl);
    const localPath = path.join(cacheDir, `${pid}_${fileName}`);
    
    if (await FileUtils.fileExists(localPath)) {
      Logger.info(`使用本地缓存: ${localPath}`);
      return { path: localPath, index };
    }
    
    for (let attempt = 0; attempt <= retryCount; attempt++) {
      try {
        if (attempt > 0) {
          Logger.info(`第${attempt}次重试下载图片: ${originalUrl}`);
        }
        
        const response = await fetch(originalUrl, { headers: this.headers });
        if (!response.ok) {
          throw new Error(`下载失败: ${response.status} ${response.statusText}`);
        }
        
        try {
          const fileStream = fs.createWriteStream(localPath);
          await pipeline(response.body, fileStream);
          Logger.info(`成功下载图片到: ${localPath}`);
          return { path: localPath, index };
        } catch (streamError) {
          Logger.error(`流下载失败，尝试替代方法`, streamError);
          const arrayBuffer = await response.arrayBuffer();
          await fs.promises.writeFile(localPath, Buffer.from(arrayBuffer));
          Logger.info(`使用替代方法成功下载图片到: ${localPath}`);
          return { path: localPath, index };
        }
      } catch (error) {
        Logger.error(`下载图片失败 (尝试 ${attempt+1}/${retryCount+1}): ${originalUrl}`, error);
        
        if (attempt === retryCount) return null;
        
        const retryDelay = Math.min(500 * Math.pow(1.5, attempt), maxRetryDelay);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
    
    return null;
  }
}

export { ImageDownloader };
export default ImageDownloader;
