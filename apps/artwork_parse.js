import { Pixiv } from "#model";
const { ArtWorks, ArtWorksInfo, Related } = Pixiv;
import { Config } from "#components";
import { Logger } from "#utils";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import sharp from "sharp";

// 常量定义
const CONSTANTS = {
  MAX_IMAGE_SIZE: 20 * 1024 * 1024, // 20MB
  MAX_RETRY_DELAY: 2000,
  DEFAULT_RETRY_COUNT: 2,
  DEFAULT_DELAY: 0,
  MAX_TITLE_LENGTH: 50,
  MAX_TAGS_COUNT: 15,
  MAX_RELATED_WORKS: 10,
  MAX_MESSAGE_LENGTH: 3000,
  MAX_LINE_LENGTH: 1000,
  USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
};

// 工具函数类
class Utils {
  // 检查文件是否存在
  static async fileExists(filePath) {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  // 创建目录
  static async createDirectory(dirPath) {
    if (!await this.fileExists(dirPath)) {
      await fs.promises.mkdir(dirPath, { recursive: true });
    }
  }

  // 清理目录
  static async cleanDirectory(dirPath) {
    if (!await this.fileExists(dirPath)) return;
    
    const files = await fs.promises.readdir(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = await fs.promises.stat(filePath);
      
      if (stats.isFile()) {
        await fs.promises.unlink(filePath);
      } else if (stats.isDirectory()) {
        await this.cleanDirectory(filePath);
        try {
          await fs.promises.rmdir(filePath);
        } catch (e) {
          Logger.debug(`无法删除子目录: ${filePath}`);
        }
      }
    }
  }

  // 安全删除目录
  static async safeRemoveDirectory(dirPath) {
    if (!await this.fileExists(dirPath)) return;
    
    try {
      await this.cleanDirectory(dirPath);
      await fs.promises.rmdir(dirPath);
    } catch (err) {
      if (err.code === 'ENOTEMPTY') {
        Logger.warn(`目录不为空，无法删除: ${dirPath}`);
      } else if (err.code !== 'ENOENT') {
        Logger.error(`删除目录时出错: ${dirPath}`, err);
      }
    }
  }

  // 检查图片格式
  static isPNGImage(buffer) {
    return buffer.length >= 8 && 
           buffer[0] === 0x89 && buffer[1] === 0x50 &&
           buffer[2] === 0x4E && buffer[3] === 0x47 &&
           buffer[4] === 0x0D && buffer[5] === 0x0A &&
           buffer[6] === 0x1A && buffer[7] === 0x0A;
  }

  static isJPEGImage(buffer) {
    return buffer.length >= 2 && 
           buffer[0] === 0xFF && buffer[1] === 0xD8;
  }

  // 格式化文件大小
  static formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }
}

// 错误处理类
class ErrorHandler {
  static getErrorAdvice(status, context) {
    const errorMap = {
      404: `访问资源不存在(404错误)，可能原因：
1. 请检查您的Pixiv Cookie是否已正确配置和更新
2. 该作品可能已被删除或设为私有
3. 网络连接可能存在问题，请检查您是否能正常访问Pixiv网站
4. ${context}可能需要特定权限`,
      403: `访问被拒绝(403错误)，可能原因：
1. 您的Pixiv Cookie可能已过期，请更新
2. 该作品可能有年龄限制，需要登录账号查看
3. ${context}可能需要特定权限`,
      401: `未授权访问(401错误)，请检查您的Pixiv Cookie是否有效，可能需要重新登录Pixiv`,
      500: `Pixiv服务器错误(${status})，请稍后再试`,
      0: `网络连接问题，请检查：
1. 您的网络是否能正常访问Pixiv
2. 是否需要使用代理访问
3. 您的Pixiv Cookie是否已正确配置`
    };

    return errorMap[status] || `请求错误(${status})，请检查网络连接和Pixiv Cookie配置`;
  }

  static handleJSError(error, context) {
    const errorMsg = error.message || "未知错误";
    
    if (errorMsg.includes("Cannot read properties of undefined") || 
        errorMsg.includes("Cannot read property") ||
        errorMsg.includes("is undefined")) {
      return `${context}出错: ${errorMsg}\n\n此错误通常是由于接口返回的数据异常导致的，最常见的原因是Cookie无效或过期。`;
    }
    
    if (errorMsg.includes("fetch") || 
        errorMsg.includes("network") || 
        errorMsg.includes("请求") ||
        errorMsg.includes("axios")) {
      return `${context}出错: 网络请求失败\n\n可能原因：
1. 网络连接不稳定
2. Pixiv服务器暂时无法访问
3. 您的Cookie配置可能已过期或无效
4. 可能需要使用代理才能正常访问Pixiv`;
    }
    
    return `${context}出错: ${errorMsg}，请稍后再试。`;
  }
};

// PDF生成类
class PDFGenerator {
  constructor() {
    this.hasFontSupport = false;
    this.config = Config.getConfig("parse");
  }

  async generatePDF(filePath, title, info, images, relatedText) {
    try {
      const pdfDoc = await PDFDocument.create();
      pdfDoc.registerFontkit(fontkit);
      
      const font = await this.loadFont(pdfDoc);
      await this.setupMetadata(pdfDoc, title);
      
      const coverPage = await this.createCoverPage(pdfDoc, title, font);
      await this.addBasicInfo(pdfDoc, info, font);
      await this.addImages(pdfDoc, images, font);
      await this.addRelatedWorks(pdfDoc, relatedText, font);
      
      const pdfBytes = await pdfDoc.save();
      await fs.promises.writeFile(filePath, pdfBytes);
      
      return filePath;
    } catch (error) {
      Logger.error("生成PDF文件失败", error);
      throw error;
    }
  }

  async generateImageOnlyPDF(filePath, images) {
    try {
      const pdfDoc = await PDFDocument.create();
      
      for (const img of images) {
        try {
          const imgPage = pdfDoc.addPage();
          const imgData = await this.processImage(img.path);
          
          // 获取图片尺寸
          const image = await pdfDoc.embedPng(imgData);
          const { width, height } = image.size();
          
          // 计算图片在页面中的位置和大小
          const pageWidth = imgPage.getWidth();
          const pageHeight = imgPage.getHeight();
          
          // 计算缩放比例，使图片适应页面
          const scale = Math.min(
            (pageWidth - 40) / width,  // 左右各留20像素边距
            (pageHeight - 40) / height // 上下各留20像素边距
          );
          
          // 计算居中位置
          const x = (pageWidth - width * scale) / 2;
          const y = (pageHeight - height * scale) / 2;
          
          // 绘制图片
          imgPage.drawImage(image, {
            x,
            y,
            width: width * scale,
            height: height * scale,
          });
        } catch (error) {
          Logger.error(`处理图片 ${img.index} 时出错`, error);
          // 出错时跳过这张图片
          continue;
        }
      }
      
      const pdfBytes = await pdfDoc.save();
      await fs.promises.writeFile(filePath, pdfBytes);
      
      return filePath;
    } catch (error) {
      Logger.error("生成图片PDF文件失败", error);
      throw error;
    }
  }

  async loadFont(pdfDoc) {
    try {
      const fontPath = this.config?.file?.font_path || './plugins/pixiv-plugin/resources/fonts/SourceHanSansCN-Normal.otf';
      const fullFontPath = path.resolve(process.cwd(), fontPath);
      
      if (await Utils.fileExists(fullFontPath)) {
        const fontBytes = await fs.promises.readFile(fullFontPath);
        const font = await pdfDoc.embedFont(fontBytes);
        this.hasFontSupport = true;
        return font;
      }
      
      const standardFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
      this.hasFontSupport = false;
      return standardFont;
    } catch (error) {
      Logger.error("字体处理失败", error);
      throw new Error(`字体处理失败：${error.message}`);
    }
  }

  async setupMetadata(pdfDoc, title) {
    pdfDoc.setTitle(`Pixiv Artwork: ${title}`);
    pdfDoc.setAuthor('Pixiv-Plugin');
    pdfDoc.setSubject('Pixiv Artwork Information');
  }

  async createCoverPage(pdfDoc, title, font) {
    const page = pdfDoc.addPage();
    const { width, height } = page.getSize();
    
    const safeTitle = this.convertToSafeText(`Pixiv Artwork: ${title}`);
    page.drawText(safeTitle, {
      x: 50,
      y: height - 100,
      size: 24,
      font,
      color: rgb(0, 0, 0),
    });

    if (!this.hasFontSupport) {
      page.drawText("Note: Chinese font not available, some characters may display as '_'", {
        x: 50,
        y: height - 130,
        size: 10,
        font,
        color: rgb(1, 0, 0),
      });
    }

    return page;
  }

  async addBasicInfo(pdfDoc, info, font) {
    const page = pdfDoc.getPages()[0];
    const { width, height } = page.getSize();
    const margin = 50;
    const lineHeight = 20;
    const maxLineWidth = width - margin * 2;
    let y = height - 150;
    if (!this.hasFontSupport) y -= 20;

    const infoLines = info.split('\n');
    let currentPage = page;

    for (const line of infoLines) {
      // 自动换行
      let text = this.convertToSafeText(line);
      while (text.length > 0) {
        let fitLength = this.getFitLength(text, font, 12, maxLineWidth);
        let drawText = text.slice(0, fitLength);
        currentPage.drawText(drawText, {
          x: margin,
          y,
          size: 12,
          font,
          color: rgb(0, 0, 0),
        });
        text = text.slice(fitLength);
        y -= lineHeight;
        if (y < margin) {
          currentPage = pdfDoc.addPage();
          y = currentPage.getHeight() - margin;
        }
      }
    }
  }

  async addImages(pdfDoc, images, font) {
    for (const img of images) {
      try {
        const imgPage = pdfDoc.addPage();
        const imgData = await this.processImage(img.path);
        
        await this.drawImage(imgPage, imgData, img.index, font);
      } catch (error) {
        Logger.error(`处理图片 ${img.index} 时出错`, error);
        await this.addErrorPage(pdfDoc, img.index, error.message, font);
      }
    }
  }

  async processImage(imgPath) {
    const imgBuffer = await fs.promises.readFile(imgPath);
    
    try {
      return await sharp(imgBuffer)
        .resize({ width: 1000, height: 1400, fit: 'inside' })
        .toFormat('png')
        .toBuffer();
    } catch (error) {
      Logger.warn("使用sharp处理图片失败，使用原始数据", error);
      return imgBuffer;
    }
  }

  async drawImage(page, imgData, index, font) {
    const imgWidth = page.getWidth() - 100;
    const imgHeight = page.getHeight() - 100;
    
    const safeTitle = this.convertToSafeText(`Image ${index}`);
    page.drawText(safeTitle, {
      x: 50,
      y: page.getHeight() - 50,
      size: 16,
      font,
      color: rgb(0, 0, 0),
    });
    
    const isPNG = Utils.isPNGImage(imgData);
    const isJPEG = Utils.isJPEGImage(imgData);
    
    if (!isPNG && !isJPEG) {
      throw new Error('不支持的图片格式，只能嵌入PNG或JPEG格式');
    }
    
    const image = isPNG ? 
      await page.doc.embedPng(imgData) : 
      await page.doc.embedJpg(imgData);
    
    const { width: pngWidth, height: pngHeight } = image.size();
    const { scaledWidth, scaledHeight } = this.calculateImageSize(pngWidth, pngHeight, imgWidth, imgHeight);
    
    page.drawImage(image, {
      x: (page.getWidth() - scaledWidth) / 2,
      y: (page.getHeight() - scaledHeight) / 2,
      width: scaledWidth,
      height: scaledHeight,
    });
  }

  calculateImageSize(pngWidth, pngHeight, maxWidth, maxHeight) {
    let scaledWidth = pngWidth;
    let scaledHeight = pngHeight;
    
    if (pngWidth > maxWidth) {
      scaledWidth = maxWidth;
      scaledHeight = (pngHeight * maxWidth) / pngWidth;
    }
    
    if (scaledHeight > maxHeight) {
      scaledHeight = maxHeight;
      scaledWidth = (pngWidth * maxHeight) / pngHeight;
    }
    
    return { scaledWidth, scaledHeight };
  }

  async addErrorPage(pdfDoc, index, errorMsg, font) {
    const page = pdfDoc.addPage();
    const safeErrorMsg = this.convertToSafeText(`处理图片 ${index} 时出错: ${errorMsg}`);
    page.drawText(safeErrorMsg, {
      x: 50,
      y: page.getHeight() - 50,
      size: 12,
      font,
      color: rgb(1, 0, 0),
    });
  }

  async addRelatedWorks(pdfDoc, relatedText, font) {
    if (!relatedText) return;
    const margin = 50;
    const lineHeight = 15;
    const titleHeight = 30;
    const page = pdfDoc.addPage();
    const { width, height } = page.getSize();
    const maxLineWidth = width - margin * 2;
    let yPos = height - margin;
    let currentPage = page;
    // 标题
    const safeTitle = this.convertToSafeText("相关作品信息");
    currentPage.drawText(safeTitle, {
      x: margin,
      y: yPos,
      size: 16,
      font,
      color: rgb(0, 0, 0),
    });
    yPos -= titleHeight;

    const lines = relatedText.split('\n');
    for (const line of lines) {
      let text = this.convertToSafeText(line);
      while (text.length > 0) {
        let fitLength = this.getFitLength(text, font, 10, maxLineWidth);
        let drawText = text.slice(0, fitLength);
        currentPage.drawText(drawText, {
          x: margin,
          y: yPos,
          size: 10,
          font,
          color: rgb(0, 0, 0),
        });
        text = text.slice(fitLength);
        yPos -= lineHeight;
        if (yPos < margin) {
          currentPage = pdfDoc.addPage();
          yPos = currentPage.getHeight() - margin;
        }
      }
    }
  }

  // 工具：根据最大宽度和字体，计算可容纳的字符数
  getFitLength(text, font, fontSize, maxWidth) {
    let fit = 0;
    let width = 0;
    for (let i = 0; i < text.length; i++) {
      const charWidth = font.widthOfTextAtSize(text[i], fontSize);
      if (width + charWidth > maxWidth) break;
      width += charWidth;
      fit++;
    }
    return fit === 0 ? 1 : fit;
  }

  convertToSafeText(text) {
    if (this.hasFontSupport) return text;
    
    const commonChineseMap = {
      '标题': 'Title',
      '作者': 'Author',
      '创建日期': 'Creation Date',
      '标签': 'Tags',
      '链接': 'Link',
      '总张数': 'Total Images',
      '图片': 'Image',
      '相关作品': 'Related Works',
      '相关': 'Related',
      '找到': 'Found',
      '个': ' ',
      '未显示': 'Not Shown',
      '张': ' ',
      '无法嵌入': 'Failed to Embed',
      '处理图片时出错': 'Error Processing Image',
      '信息': 'Info'
    };
    
    let result = text;
    for (const [chinese, english] of Object.entries(commonChineseMap)) {
      result = result.replace(new RegExp(chinese, 'g'), english);
    }
    
    result = result.replace(/[\u4e00-\u9fa5]/g, '_');
    result = result.replace(/_{3,}/g, '___');
    
    return result;
  }
}

// 图片下载类
class ImageDownloader {
  constructor() {
    this.headers = {
      'User-Agent': CONSTANTS.USER_AGENT,
      'Referer': 'https://www.pixiv.net/',
    };
    this.config = Config.getConfig("parse");
  }

  async downloadImages(artworks, pid, cacheDir, options = {}) {
    if (!artworks || artworks.length === 0) return [];
    
    const retryCount = options.retryCount || this.config.download.retry_count || CONSTANTS.DEFAULT_RETRY_COUNT;
    const delayBetweenImages = options.delay || this.config.download.retry_delay || CONSTANTS.DEFAULT_DELAY;
    const maxRetryDelay = options.maxRetryDelay || this.config.download.max_retry_delay || CONSTANTS.MAX_RETRY_DELAY;
    const concurrent = options.concurrent || this.config.download.concurrent || 10;
    
    Logger.info(`开始下载图片，共${artworks.length}张，重试次数: ${retryCount}, 延迟: ${delayBetweenImages}ms, 并发数: ${concurrent}`);
    
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
      } else {
        //options.progressCallback(`全部${downloadedImages.length}张图片下载成功`);
      }
    }
    
    return downloadedImages.sort((a, b) => a.index - b.index);
  }

  async downloadSingleImage(artwork, pid, cacheDir, index, retryCount, maxRetryDelay) {
    const originalUrl = artwork.original;
    const fileName = path.basename(originalUrl);
    const localPath = path.join(cacheDir, `${pid}_${fileName}`);
    
    if (await Utils.fileExists(localPath)) {
      Logger.info(`使用本地缓存: ${localPath}`);
      return { path: localPath, index };
    }
    
    let lastError = null;
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
        lastError = error;
        Logger.error(`下载图片失败 (尝试 ${attempt+1}/${retryCount+1}): ${originalUrl}`, error);
        
        if (attempt === retryCount) return null;
        
        const retryDelay = Math.min(500 * Math.pow(1.5, attempt), maxRetryDelay);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
    
    return null;
  }
}

// 消息发送类
class MessageSender {
  constructor() {
    this.config = Config.getConfig("parse");
  }

  async sendPDFFile(e, filePath, fileName) {
    if (!await Utils.fileExists(filePath)) {
      Logger.error(`发送PDF文件失败: 文件不存在 ${filePath}`);
      await e.reply(`发送PDF文件失败: 文件不存在`);
      return false;
    }
    
    const fullFileName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
    
    try {
      // 方法1: 群文件上传
      if (e.group?.fs?.upload) {
        try {
          const result = await e.group.fs.upload(filePath, fullFileName);
          if (result) {
            await e.reply(`文件已上传到群文件，请查看: ${fullFileName}`);
            return true;
          }
        } catch (err) {
          Logger.error(`群文件上传失败: ${err.message}`);
        }
      }
      
      // 方法2: 直接发送文件
      if (segment?.file) {
        try {
          await e.reply(segment.file(filePath, fullFileName));
          return true;
        } catch (err) {
          Logger.error(`直接发送文件失败: ${err.message}`);
        }
      }
      
      // 方法3: 作为buffer发送
      const stats = await fs.promises.stat(filePath);
      if (stats.size > CONSTANTS.MAX_IMAGE_SIZE) {
        await e.reply(`PDF文件太大(${Utils.formatFileSize(stats.size)})，请考虑减少图片数量或降低图片质量。`);
        return false;
      }
      
      const fileBuffer = await fs.promises.readFile(filePath);
      await e.reply(['PDF文件已就绪', { type: 'file', file: fileBuffer, name: fullFileName }]);
      return true;
      
    } catch (err) {
      Logger.error(`发送PDF文件时出错: ${err.message}`);
      await e.reply(`发送PDF文件失败: ${err.message}`);
      return false;
    }
  }

  async sendChatRecord(e, title, content, useMultipleMessages = false) {
    const maxLength = this.config.message.max_length || CONSTANTS.MAX_MESSAGE_LENGTH;
    const delay = this.config.message.delay || 300;
    
    if (useMultipleMessages && content.length > maxLength) {
      const paragraphs = content.split('\n\n');
      const messages = [];
      let currentMessage = '';
      
      for (const paragraph of paragraphs) {
        if (currentMessage.length + paragraph.length + 2 > maxLength) {
          messages.push(currentMessage);
          currentMessage = paragraph;
        } else {
          if (currentMessage) currentMessage += '\n\n';
          currentMessage += paragraph;
        }
      }
      
      if (currentMessage) messages.push(currentMessage);
      
      for (let i = 0; i < messages.length; i++) {
        const messageTitle = messages.length > 1 ? `${title} (${i+1}/${messages.length})` : title;
        await this.sendSingleChatRecord(e, messageTitle, messages[i]);
        if (i < messages.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      
      return;
    }
    
    await this.sendSingleChatRecord(e, title, content);
  }

  async sendSingleChatRecord(e, title, content) {
    const maxLineLength = this.config.message.max_line_length || CONSTANTS.MAX_LINE_LENGTH;
    
    const messages = [];
    if (content.length > maxLineLength) {
      const lines = content.split('\n');
      let currentMsg = '';
      
      for (const line of lines) {
        if (currentMsg.length + line.length + 1 > maxLineLength) {
          if (currentMsg) messages.push(currentMsg);
          currentMsg = line;
        } else {
          if (currentMsg) currentMsg += '\n';
          currentMsg += line;
        }
      }
      
      if (currentMsg) messages.push(currentMsg);
    } else {
      messages.push(content);
    }
    
    const forwardMsg = [
      { message: title, nickname: Bot.nickname || "Pixiv-Plugin", user_id: Bot.uin },
      ...messages.map(msg => ({ message: msg, nickname: Bot.nickname || "Pixiv-Plugin", user_id: Bot.uin }))
    ];
    
    let success = false;
    
    // 尝试多种发送方法
    const sendMethods = [
      async () => {
        if (typeof Bot.makeForwardMsg === 'function') {
          const opts = e.isGroup ? {} : { target: e.user_id };
          await e.reply(await Bot.makeForwardMsg(forwardMsg, opts));
          return true;
        }
        return false;
      },
      async () => {
        if (e.friend?.makeForwardMsg) {
          await e.reply(await e.friend.makeForwardMsg(forwardMsg));
          return true;
        }
        return false;
      },
      async () => {
        if (e.group?.makeForwardMsg) {
          await e.reply(await e.group.makeForwardMsg(forwardMsg));
          return true;
        }
        return false;
      },
      async () => {
        if (segment?.forward) {
          await e.reply(segment.forward(forwardMsg));
          return true;
        }
        return false;
      },
      async () => {
        if (global.common?.makeForwardMsg) {
          await e.reply(await global.common.makeForwardMsg(e, forwardMsg));
          return true;
        }
        return false;
      }
    ];
    
    for (const method of sendMethods) {
      try {
        success = await method();
        if (success) break;
      } catch (err) {
        Logger.error(`发送消息失败: ${err.message}`);
      }
    }
    
    if (!success) {
      Logger.warn('所有转发消息方法都失败，回退到普通文本发送');
      await e.reply(`${title}:\n${content}`);
    }
  }
}

// 主类
export default class extends plugin {
  constructor() {
    super({
      name: "pixiv-plugin",
      dsc: "pixiv-plugin",
      event: "message",
      priority: -2000,
      rule: [
        {
          reg: /https:\/\/www\.pixiv\.net\/artworks\/(\d+).*/i,
          fnc: "parse",
        },
      ],
    });
    
    this.config = Config.getConfig("parse");
    this.pdfGenerator = new PDFGenerator();
    this.imageDownloader = new ImageDownloader();
    this.messageSender = new MessageSender();
    this.cacheDir = path.join(process.cwd(), this.config.file.cache_dir || 'data/pixiv-cache');
  }

  async parse(e) {
    const match = e.msg.match(/https:\/\/www\.pixiv\.net\/artworks\/(\d+).*/i);
    if (!match) return false;
    
      const pid = match[1];
    return this.processArtwork(e, pid);
  }

  async processArtwork(e, pid) {
    if (!this.config.artworks_parse) return false;
    
    const baseDir = this.cacheDir;
    await Utils.createDirectory(baseDir);
    
    const cacheDir = path.join(baseDir, `pid_${pid}`);
    await Utils.createDirectory(cacheDir);
    await Utils.cleanDirectory(cacheDir);
    
    try {
      await e.reply(`正在获取作品(ID: ${pid})的信息，请稍候...`);
      
      const [artworks, info] = await Promise.all([
        ArtWorks(pid),
        ArtWorksInfo(pid)
      ]);
      
      const [authorInfo, artworkStats] = await Promise.all([
        this.getUserInfo(info.authorid),
        this.getArtworkStats(pid)
      ]);
      
      const title = this.formatTitle(info.title);
      const tags = this.formatTags(info.tags);
      
      const basicInfo = this.generateBasicInfo(title, pid, info, artworks);
      const authorDetails = this.generateAuthorDetails(authorInfo, info);
      const statsInfo = this.generateStatsInfo(artworkStats);
      const tagInfo = [`标签: ${tags}`];
      const linkInfo = [`链接: https://www.pixiv.net/artworks/${pid}`];
      
      const infoText = [
        ...basicInfo, 
        "", 
        ...authorDetails, 
        "",
        ...(statsInfo.length > 0 ? [...statsInfo, ""] : []),
        ...tagInfo, 
        "", 
        ...linkInfo
      ].join("\n");
      
      let downloadedImages = [];
      if (artworks.length > 0) {
        
        downloadedImages = await this.imageDownloader.downloadImages(artworks, pid, cacheDir, {
          progressCallback: async (message) => {
            if (artworks.length > 5) {
              await e.reply(message);
            }
          }
        });
      }
      
      let relatedText = "";
      if (this.config.search_related) {
        try {
          const related = await Related(pid);
          if (related?.illusts?.length > 0) {
            relatedText = this.generateRelatedText(related.illusts);
          }
        } catch (error) {
          Logger.error("获取相关作品信息失败", error);
          relatedText = "获取相关作品信息失败\n";
        }
      }
      
      const pdfPath = path.join(cacheDir, `pixiv_${pid}.pdf`);
      
      if (this.config.pdf_mode === 'images_only') {
        await this.handleImagesOnlyMode(e, pid, title, infoText, relatedText, downloadedImages, pdfPath);
      } else {
        await this.handleFullMode(e, title, infoText, downloadedImages, relatedText, pdfPath, pid);
      }
      
      return false;
    } catch (error) {
      Logger.error("处理作品失败", error);
      await this.handleError(e, error, pid);
        return false;
    } finally {
      setTimeout(() => {
        Utils.safeRemoveDirectory(cacheDir)
          .then(() => Logger.info(`缓存目录处理完成: ${cacheDir}`))
          .catch(err => Logger.error(`处理缓存目录时出错: ${cacheDir}`, err));
      }, 10000);
    }
  }

  formatTitle(title) {
    return title.length > CONSTANTS.MAX_TITLE_LENGTH ? 
      title.substring(0, CONSTANTS.MAX_TITLE_LENGTH - 3) + "..." : 
      title;
  }

  formatTags(tags) {
    if (tags.length > CONSTANTS.MAX_TAGS_COUNT) {
      return tags.slice(0, CONSTANTS.MAX_TAGS_COUNT)
        .map(tag => `${tag.tag}${tag.en ? `(${tag.en})` : ""}`)
        .join(", ") + "...";
    }
    return tags.map(tag => `${tag.tag}${tag.en ? `(${tag.en})` : ""}`).join(", ");
  }

  generateBasicInfo(title, pid, info, artworks) {
    return [
      `标题: ${title}`,
      `作品ID: ${pid}`,
      `创建日期: ${info.createDate}`,
      `类型: ${this.getArtworkType(artworks)}`,
      `图片尺寸: ${this.getImageDimensions(artworks)}`,
      `总张数: ${artworks.length}张`
    ];
  }

  generateAuthorDetails(authorInfo, info) {
    if (!authorInfo) return [`作者ID: ${info.authorid}`];
    
    const details = [
      `作者: ${authorInfo.name || "未知"}`,
      `作者ID: ${info.authorid}`
    ];
    
    if (authorInfo.account) details.push(`作者账号: ${authorInfo.account}`);
    if (authorInfo.bio) {
      const bioText = authorInfo.bio.length > 100 ? 
        authorInfo.bio.substring(0, 97) + "..." : 
        authorInfo.bio;
      details.push(`作者简介: ${bioText}`);
    }
    if (authorInfo.webpage) details.push(`作者主页: ${authorInfo.webpage}`);
    
    return details;
  }

  generateStatsInfo(stats) {
    if (!stats) return [];
    
    const info = [];
    if (stats.viewCount) info.push(`浏览数: ${stats.viewCount}`);
    if (stats.likeCount) info.push(`点赞数: ${stats.likeCount}`);
    if (stats.bookmarkCount) info.push(`收藏数: ${stats.bookmarkCount}`);
    if (stats.commentCount) info.push(`评论数: ${stats.commentCount}`);
    
    return info;
  }

  generateRelatedText(illusts) {
    const maxRelated = Math.min(illusts.length, this.config.limits?.max_related_works || 10);
    let text = `找到${illusts.length}个相关作品:\n\n`;

    for (let i = 0; i < maxRelated; i++) {
      const relatedInfo = illusts[i];
      const relatedTitle = this.formatTitle(relatedInfo.title);
      // 兼容 tags 可能为 undefined、字符串数组、对象数组等情况
      let relatedTags = '';
      if (Array.isArray(relatedInfo.tags)) {
        if (relatedInfo.tags.length > 0 && typeof relatedInfo.tags[0] === 'object') {
          // [{tag: 'xxx', en: 'yyy'}]
          relatedTags = relatedInfo.tags
            .map(tag => tag.tag || tag)
            .filter(Boolean)
            .join(', ');
        } else {
          // ['xxx', 'yyy']
          relatedTags = relatedInfo.tags.filter(Boolean).join(', ');
        }
      } else {
        relatedTags = '';
      }

      text += [
        `相关作品 ${i+1}/${maxRelated}:`,
        `标题: ${relatedTitle}`,
        `作者: ${relatedInfo.userName || relatedInfo.authorName || '未知'}(${relatedInfo.userId || relatedInfo.authorId || '未知'})`,
        `标签: ${relatedTags || '无'}`,
        `链接: https://www.pixiv.net/artworks/${relatedInfo.id}`,
        ""
      ].join("\n");
    }

    if (illusts.length > maxRelated) {
      text += `还有${illusts.length - maxRelated}个相关作品未显示\n`;
    }

    return text;
  }

  async handleImagesOnlyMode(e, pid, title, infoText, relatedText, downloadedImages, pdfPath) {
    const forwardMessages = [
      {
        message: `Pixiv作品 ${pid} - ${title || "无标题"}`,
        nickname: Bot.nickname || "Pixiv-Plugin",
        user_id: Bot.uin
      },
      {
        message: `基本信息：\n${infoText}`,
        nickname: Bot.nickname || "Pixiv-Plugin",
        user_id: Bot.uin
      }
    ];
    
    if (relatedText?.trim()) {
      forwardMessages.push({
        message: `相关作品信息：\n${relatedText}`,
        nickname: Bot.nickname || "Pixiv-Plugin",
        user_id: Bot.uin
      });
    }
    
    let forwardSuccess = false;
    try {
      if (typeof Bot.makeForwardMsg === 'function') {
        const opts = e.isGroup ? {} : { target: e.user_id };
        await e.reply(await Bot.makeForwardMsg(forwardMessages, opts));
        forwardSuccess = true;
      }
      
      if (!forwardSuccess && segment?.forward) {
        await e.reply(segment.forward(forwardMessages));
        forwardSuccess = true;
      }
      
      if (!forwardSuccess) {
        const makeForwardMsgFunc = e.isGroup ? 
          e.group?.makeForwardMsg : 
          e.friend?.makeForwardMsg;
        
        if (makeForwardMsgFunc) {
          await e.reply(await makeForwardMsgFunc(forwardMessages));
          forwardSuccess = true;
        }
      }
    } catch (err) {
      Logger.error(`发送合并转发消息失败: ${err.message}`);
    }
    
    if (!forwardSuccess) {
      const textContent = [`作品ID: ${pid} 的基本信息：\n${infoText}`];
      if (relatedText?.trim()) {
        textContent.push(`相关作品信息：\n${relatedText}`);
      }
      
      for (const text of textContent) {
        await this.messageSender.sendChatRecord(e, "Pixiv作品详细信息", text, true);
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    
    await this.pdfGenerator.generateImageOnlyPDF(pdfPath, downloadedImages);
    await e.reply(`已生成作品图片PDF文件，正在发送...`);
    await this.messageSender.sendPDFFile(e, pdfPath, `pixiv_${pid}`);
  }

  async handleFullMode(e, title, infoText, downloadedImages, relatedText, pdfPath, pid) {
    await this.pdfGenerator.generatePDF(pdfPath, title, infoText, downloadedImages, relatedText);
    await e.reply(`已生成作品"${title}"的PDF文件，正在发送...`);
    await this.messageSender.sendPDFFile(e, pdfPath, `pixiv_${pid}`);
  }

  async handleError(e, error, pid) {
    let errorMessage = error.message || "未知错误";
    const statusMatch = errorMessage.match(/(\d{3})/);
    
    if (statusMatch) {
      const status = parseInt(statusMatch[1]);
      const advice = ErrorHandler.getErrorAdvice(status, "作品信息");
      await e.reply(`获取作品(ID: ${pid})信息时出错: ${errorMessage}\n\n${advice}`);
    } else if (errorMessage.includes('fetch') || errorMessage.includes('网络')) {
      await e.reply(`获取作品(ID: ${pid})信息时出现网络错误。\n\n请检查：
1. 您的网络连接是否正常
2. 是否需要使用代理访问Pixiv
3. Pixiv服务器是否可访问
4. Cookie配置是否正确`);
    } else if (errorMessage.includes('Cannot read properties of undefined') || 
              errorMessage.includes('Cannot read property') ||
              errorMessage.includes('is undefined')) {
      const friendlyError = ErrorHandler.handleJSError(error, `获取作品(ID: ${pid})信息`);
      await e.reply(friendlyError);
    } else {
      await e.reply(`获取作品(ID: ${pid})信息时出错: ${errorMessage}，请稍后再试。`);
    }
  }

  getArtworkType(artworks) {
    if (!artworks || artworks.length === 0) return "未知";
    return artworks.length === 1 ? "单图作品" : `多图作品(${artworks.length}张)`;
  }

  getImageDimensions(artworks) {
    if (!artworks || artworks.length === 0) return "未知";
    
    const firstArtwork = artworks[0];
    if (firstArtwork?.original) {
      try {
        if (firstArtwork.width && firstArtwork.height) {
          return `${firstArtwork.width}×${firstArtwork.height}`;
        } else if (firstArtwork.illust_width && firstArtwork.illust_height) {
          return `${firstArtwork.illust_width}×${firstArtwork.illust_height}`;
        }
      } catch (error) {
        Logger.warn("无法获取图片尺寸", error);
      }
    }
    
    return "未知尺寸";
  }

  async getUserInfo(userId) {
    if (!userId) return null;
    
    try {
      if (typeof Pixiv.User === 'function') {
        const userInfo = await Pixiv.User(userId);
        return {
          name: userInfo.name,
          account: userInfo.account,
          bio: userInfo.comment,
          webpage: userInfo.webpage
        };
      }
      
      const url = `https://www.pixiv.net/ajax/user/${userId}?full=1`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': CONSTANTS.USER_AGENT,
          'Referer': 'https://www.pixiv.net/',
        }
      });
      
      if (!response.ok) {
        throw new Error(`获取用户信息失败: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      if (data.error) {
        throw new Error(`API错误: ${data.message}`);
      }
      
      return {
        name: data.body?.name,
        account: data.body?.account,
        bio: data.body?.comment,
        webpage: data.body?.webpage
      };
    } catch (error) {
      Logger.error(`获取用户信息出错: ${error.message}`, error);
      return null;
    }
  }

  async getArtworkStats(pid) {
    try {
      const url = `https://www.pixiv.net/ajax/illust/${pid}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': CONSTANTS.USER_AGENT,
          'Referer': 'https://www.pixiv.net/',
        }
      });
      
      if (!response.ok) {
        throw new Error(`获取作品统计失败: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      if (data.error) {
        throw new Error(`API错误: ${data.message}`);
      }
      
      return {
        bookmarkCount: data.body?.bookmarkCount || 0,
        likeCount: data.body?.likeCount || 0,
        viewCount: data.body?.viewCount || 0,
        commentCount: data.body?.commentCount || 0
      };
    } catch (error) {
      Logger.error(`获取作品统计出错: ${error.message}`, error);
      return {
        bookmarkCount: 0,
        likeCount: 0,
        viewCount: 0,
        commentCount: 0
      };
    }
  }
}
