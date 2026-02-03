import { Pixiv } from "#model";
const { ArtWorks, ArtWorksInfo, Related } = Pixiv;
import { Config } from "#components";
import { Logger } from "#utils";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { JM } from '#model';
import { CONSTANTS } from "../model/constants.js";
import FileUtils from "../model/utils/FileUtils.js";
import ErrorHandler from "../model/utils/ErrorHandler.js";
import ImageDownloader from "../model/utils/ImageDownloader.js";
import MessageSender from "../model/utils/MessageSender.js";
import PDFGenerator from "../model/pdf/PDFGenerator.js";

/**
 * 拷贝PDF到JM的unencrypted目录
 * @param {string} pdfPath - PDF文件路径
 * @param {string} pid - 作品ID
 * @returns {Promise<string>} JM目录中的PDF路径
 */
async function copyFileToJM(pdfPath, pid) {
  const jmUnencryptedDir = path.resolve(process.cwd(), 'plugins/pixiv-plugin/resources/JM/pdf/unencrypted');
  const jmEncryptedDir = path.resolve(process.cwd(), 'plugins/pixiv-plugin/resources/JM/pdf/encrypted');
  if (!fs.existsSync(jmUnencryptedDir)) fs.mkdirSync(jmUnencryptedDir, { recursive: true });
  if (!fs.existsSync(jmEncryptedDir)) fs.mkdirSync(jmEncryptedDir, { recursive: true });
  const jmPdfPath = path.join(jmUnencryptedDir, `${pid}.pdf`);
  await fs.promises.copyFile(pdfPath, jmPdfPath);
  return jmPdfPath;
}

/**
 * Pixiv作品解析插件
 */
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
    this.cacheDir = path.join(process.cwd(), this.config.file?.cache_dir || 'data/pixiv-cache');
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
    await FileUtils.createDirectory(baseDir);
    
    const cacheDir = path.join(baseDir, `pid_${pid}`);
    await FileUtils.createDirectory(cacheDir);
    await FileUtils.cleanDirectory(cacheDir);
    
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
      
      const infoText = this.buildInfoText(title, pid, info, artworks, authorInfo, artworkStats, tags);
      
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
      const isImagesOnlyMode = this.config.pdf_mode === 'images_only';
      
      Logger.info(`使用PDF模式: ${this.config.pdf_mode}`);
      
      // 统一的 PDF 处理逻辑
      await this.handlePDFGeneration(e, {
        pid,
        title,
        infoText,
        relatedText,
        downloadedImages,
        pdfPath,
        isImagesOnlyMode
      });
      
      return false;
    } catch (error) {
      Logger.error("处理作品失败", error);
      await this.handleError(e, error, pid);
      return false;
    } finally {
      setTimeout(() => {
        FileUtils.safeRemoveDirectory(cacheDir)
          .then(() => Logger.info(`缓存目录处理完成: ${cacheDir}`))
          .catch(err => Logger.error(`处理缓存目录时出错: ${cacheDir}`, err));
      }, 10000);
    }
  }

  /**
   * 构建作品信息文本
   */
  buildInfoText(title, pid, info, artworks, authorInfo, artworkStats, tags) {
    const basicInfo = this.generateBasicInfo(title, pid, info, artworks);
    const authorDetails = this.generateAuthorDetails(authorInfo, info);
    const statsInfo = this.generateStatsInfo(artworkStats);
    const tagInfo = [`标签: ${tags}`];
    const linkInfo = [`链接: https://www.pixiv.net/artworks/${pid}`];
    
    return [
      ...basicInfo, 
      "", 
      ...authorDetails, 
      "",
      ...(statsInfo.length > 0 ? [...statsInfo, ""] : []),
      ...tagInfo, 
      "", 
      ...linkInfo
    ].join("\n");
  }

  /**
   * 统一的 PDF 生成和发送处理
   * @param {Object} e - 事件对象
   * @param {Object} options - 选项
   */
  async handlePDFGeneration(e, options) {
    const { pid, title, infoText, relatedText, downloadedImages, pdfPath, isImagesOnlyMode } = options;

    try {
      // 根据模式生成 PDF
      if (isImagesOnlyMode) {
        await this.pdfGenerator.generateImageOnlyPDF(pdfPath, downloadedImages);
        // 纯图片模式下，单独发送文本信息
        if (infoText) await e.reply(infoText);
        if (relatedText) await e.reply(relatedText);
      } else {
        await this.pdfGenerator.generatePDF(pdfPath, title, infoText, downloadedImages, relatedText);
      }

      // 检查 PDF 是否生成成功
      if (!await FileUtils.fileExists(pdfPath)) {
        await e.reply("PDF生成失败，请查看日志");
        return false;
      }

      // 统一的加密和发送逻辑
      await this.encryptAndSendPDF(e, pdfPath, pid);
      return true;
    } catch (error) {
      Logger.error(`PDF处理出错: ${error.message}`, error);
      await e.reply(`处理作品时出错: ${error.message}`);
      return false;
    }
  }

  /**
   * 加密并发送 PDF（统一逻辑）
   * @param {Object} e - 事件对象
   * @param {string} pdfPath - 原始 PDF 路径
   * @param {string} pid - 作品 ID
   */
  async encryptAndSendPDF(e, pdfPath, pid) {
    let jmPdfPath = null;
    let encryptedPath = null;

    try {
      jmPdfPath = await copyFileToJM(pdfPath, pid);
      encryptedPath = await JM.encrypt(pid, jmPdfPath);
      
      await e.reply(`已生成加密PDF文件，正在发送...\n密码为作品ID: ${pid}`);
      await this.messageSender.sendPDFFile(e, encryptedPath, `pixiv_${pid}`);
      
      // 清理所有临时文件
      await FileUtils.safeUnlinkMany([
        { path: pdfPath, description: '未加密PDF' },
        { path: encryptedPath, description: '加密PDF' },
        { path: jmPdfPath, description: 'JM PDF' }
      ]);
    } catch (err) {
      Logger.error('PDF加密失败', err);
      await e.reply('PDF加密失败，发送未加密版本。');
      await this.messageSender.sendPDFFile(e, pdfPath, `pixiv_${pid}`);
      await FileUtils.safeUnlink(pdfPath, 'PDF');
    }
  }

  formatTitle(title) {
    const maxLength = this.config.limits?.max_title_length || CONSTANTS.MAX_TITLE_LENGTH;
    return title.length > maxLength ? 
      title.substring(0, maxLength - 3) + "..." : 
      title;
  }

  formatTags(tags) {
    const maxCount = this.config.limits?.max_tags_count || CONSTANTS.MAX_TAGS_COUNT;
    if (tags.length > maxCount) {
      return tags.slice(0, maxCount)
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

  generateStatsInfo(artworkStats) {
    if (!artworkStats) return [];
    
    const info = [];
    if (artworkStats.viewCount) info.push(`浏览数: ${artworkStats.viewCount}`);
    if (artworkStats.likeCount) info.push(`点赞数: ${artworkStats.likeCount}`);
    if (artworkStats.bookmarkCount) info.push(`收藏数: ${artworkStats.bookmarkCount}`);
    if (artworkStats.commentCount) info.push(`评论数: ${artworkStats.commentCount}`);
    
    return info;
  }

  generateRelatedText(illusts) {
    const maxRelated = Math.min(illusts.length, this.config.limits?.max_related_works || CONSTANTS.MAX_RELATED_WORKS);
    let text = `找到${illusts.length}个相关作品:\n\n`;

    for (let i = 0; i < maxRelated; i++) {
      const relatedInfo = illusts[i];
      const relatedTitle = this.formatTitle(relatedInfo.title);
      let relatedTags = '';
      if (Array.isArray(relatedInfo.tags)) {
        if (relatedInfo.tags.length > 0 && typeof relatedInfo.tags[0] === 'object') {
          relatedTags = relatedInfo.tags
            .map(tag => tag.tag || tag)
            .filter(Boolean)
            .join(', ');
        } else {
          relatedTags = relatedInfo.tags.filter(Boolean).join(', ');
        }
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
}
