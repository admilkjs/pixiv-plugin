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
const artworksReg = /https:\/\/www\.pixiv\.net\/artworks\/(\d+).*/i;

// 任务队列和执行状态
const taskQueue = [];
let isProcessing = false;

export default class extends plugin {
  constructor() {
    super({
      name: "pixiv-plugin",
      dsc: "pixiv-plugin",
      event: "message",
      priority: -2000,
      rule: [
        {
          reg: artworksReg,
          fnc: "parse",
        },
      ],
    });
  }

  /**
   * 添加任务到队列并根据情况执行
   * @param {Function} task - 任务函数
   * @param {Array} args - 任务参数
   * @param {string} taskName - 任务名称，用于日志和显示
   * @returns {Promise} - 任务的结果Promise
   */
  async addToQueue(task, args, taskName = "pixiv处理任务") {
    return new Promise((resolve, reject) => {
      // 创建一个任务对象
      const taskObject = {
        task,
        args,
        resolve,
        reject,
        name: taskName,
        addTime: Date.now()
      };
      
      // 添加到队列
      taskQueue.push(taskObject);
      Logger.info(`任务 "${taskName}" 已添加到队列，当前队列长度: ${taskQueue.length}`);
      
      // 如果没有正在处理的任务，立即开始处理队列
      if (!isProcessing) {
        this.processQueue();
      }
    });
  }
  
  /**
   * 处理任务队列
   */
  async processQueue() {
    // 如果队列为空或已有任务在处理，则退出
    if (taskQueue.length === 0 || isProcessing) {
      return;
    }
    
    // 设置处理标志
    isProcessing = true;
    
    // 取出队首任务
    const currentTask = taskQueue.shift();
    const waitTime = ((Date.now() - currentTask.addTime) / 1000).toFixed(1);
    Logger.info(`开始处理任务 "${currentTask.name}"，等待时间: ${waitTime}秒，剩余任务数: ${taskQueue.length}`);
    
    try {
      // 执行任务
      const result = await currentTask.task.apply(this, currentTask.args);
      
      // 任务成功，解析Promise
      currentTask.resolve(result);
      Logger.info(`任务 "${currentTask.name}" 执行完成`);
    } catch (error) {
      // 任务失败，拒绝Promise
      Logger.error(`任务 "${currentTask.name}" 执行失败`, error);
      currentTask.reject(error);
    } finally {
      // 无论任务成功或失败，标记为处理完成
      isProcessing = false;
      
      // 检查队列中是否还有任务，如果有则继续处理
      if (taskQueue.length > 0) {
        const nextTask = taskQueue[0];
        Logger.info(`准备处理下一个任务: "${nextTask.name}"`);
        setTimeout(() => this.processQueue(), 500); // 延迟500ms再处理下一个任务
      } else {
        Logger.info(`任务队列已清空`);
      }
    }
  }

  async parse(e) {
    const match = e.msg.match(artworksReg);
    if (match) {
      const pid = match[1];
      // 将实际处理逻辑添加到队列，使用pid作为任务名称一部分
      return this.addToQueue(this._parse, [e], `Pixiv作品(ID: ${pid})处理`);
    }
    return false;
  }
  
  /**
   * 实际的解析处理逻辑
   * @param {object} e - 消息事件对象
   */
  async _parse(e) {
    let config = Config.getConfig("parse");
    if (!config.artworks_parse) return false;
    const match = e.msg.match(artworksReg);
    if (match) {
      const pid = match[1];
      
      // 为每个pid创建独立的缓存目录，避免多个请求互相干扰
      const baseDir = path.join(process.cwd(), 'data', 'pixiv-cache');
      if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
      }
      
      // 创建以pid为名的子目录
      const cacheDir = path.join(baseDir, `pid_${pid}`);
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      } else {
        // 清空该pid的缓存目录，确保开始时是干净的
        this.cleanDirectory(cacheDir);
      }
      
      try {
        // 显示正在处理的消息
        await e.reply(`正在获取作品(ID: ${pid})的信息，请稍候...`);
        
        const artworks = await ArtWorks(pid);
        const info = await ArtWorksInfo(pid);
        
        // 获取作者详细信息
        let authorInfo = null;
        try {
          if (info.authorid) {
            authorInfo = await this.getUserInfo(info.authorid);
          }
        } catch (authorError) {
          Logger.error(`获取作者信息失败: ${info.authorid}`, authorError);
        }
        
        // 获取作品统计信息
        let artworkStats = null;
        try {
          artworkStats = await this.getArtworkStats(pid);
        } catch (statsError) {
          Logger.error(`获取作品统计信息失败: ${pid}`, statsError);
        }
        
        // 限制标题长度
        const title = info.title.length > 50 ? info.title.substring(0, 47) + "..." : info.title;
        // 限制标签数量和长度
        const tags = info.tags.length > 15 
          ? info.tags.slice(0, 15).map((i) => `${i.tag}${i.en ? `(${i.en})` : ""}`).join(", ") + "..." 
          : info.tags.map((i) => `${i.tag}${i.en ? `(${i.en})` : ""}`).join(", ");
        
        // 收集基本信息和图片路径，用于生成PDF和聊天记录
        const basicInfo = [
          `标题: ${title}`,
          `作品ID: ${pid}`,
          `创建日期: ${info.createDate}`,
          `类型: ${this.getArtworkType(artworks)}`,
          `图片尺寸: ${this.getImageDimensions(artworks)}`,
          `总张数: ${artworks.length}张`
        ];
        
        // 添加作者信息
        const authorDetails = [];
        if (authorInfo) {
          authorDetails.push(`作者: ${authorInfo.name || "未知"}`);
          authorDetails.push(`作者ID: ${info.authorid}`);
          if (authorInfo.account) authorDetails.push(`作者账号: ${authorInfo.account}`);
          if (authorInfo.bio) {
            const bioText = authorInfo.bio.length > 100 ? authorInfo.bio.substring(0, 97) + "..." : authorInfo.bio;
            authorDetails.push(`作者简介: ${bioText}`);
          }
          if (authorInfo.webpage) authorDetails.push(`作者主页: ${authorInfo.webpage}`);
        } else {
          authorDetails.push(`作者ID: ${info.authorid}`);
        }
        
        // 添加标签信息
        const tagInfo = [`标签: ${tags}`];
        
        // 添加链接信息
        const linkInfo = [`链接: https://www.pixiv.net/artworks/${pid}`];
        
        // 添加统计信息
        const statsInfo = [];
        if (artworkStats) {
          if (artworkStats.viewCount) statsInfo.push(`浏览数: ${artworkStats.viewCount}`);
          if (artworkStats.likeCount) statsInfo.push(`点赞数: ${artworkStats.likeCount}`);
          if (artworkStats.bookmarkCount) statsInfo.push(`收藏数: ${artworkStats.bookmarkCount}`);
          if (artworkStats.commentCount) statsInfo.push(`评论数: ${artworkStats.commentCount}`);
        }
        
        // 合并所有信息
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
        
        // 下载所有图片
        if (artworks.length > 0) {
          // 显示开始下载的提示
          if (artworks.length > 3) {
            await e.reply(`开始下载${artworks.length}张图片，这可能需要一些时间...`);
          }
          
          // 使用并行下载提高速度
          downloadedImages = await this.downloadImagesParallel(artworks, pid, cacheDir, {
            progressCallback: async (message) => {
              // 图片较多时才显示进度
              if (artworks.length > 5) {
                await e.reply(message);
              }
            }
          });
        }
        
        // 获取相关作品信息
        let relatedText = "";
        if (config.search_related) {
          try {
          let related = await Related(pid);
            if (related && related.illusts && related.illusts.length > 0) {
              relatedText += `找到${related.illusts.length}个相关作品:\n\n`;
              
              // 添加相关作品信息，最多10个
              const maxRelated = Math.min(related.illusts.length, 10);
              for (let i = 0; i < maxRelated; i++) {
                const relatedInfo = related.illusts[i];
                const relatedTitle = relatedInfo.title.length > 30 ? relatedInfo.title.substring(0, 27) + "..." : relatedInfo.title;
                const relatedTags = relatedInfo.tags.length > 6 ? relatedInfo.tags.slice(0, 6).join(", ") + "..." : relatedInfo.tags.join(", ");
                
                relatedText += [
                  `相关作品 ${i+1}/${maxRelated}:`,
                  `标题: ${relatedTitle}`,
                  `作者: ${relatedInfo.userName}(${relatedInfo.userId})`,
                  `标签: ${relatedTags}`,
                  `链接: https://www.pixiv.net/artworks/${relatedInfo.id}`,
                  ""
                ].join("\n");
              }
              
              if (related.illusts.length > maxRelated) {
                relatedText += `还有${related.illusts.length - maxRelated}个相关作品未显示\n`;
              }
            }
          } catch (relatedError) {
            Logger.error("获取相关作品信息失败", relatedError);
            relatedText = "获取相关作品信息失败\n";
          }
        }
        
        // 生成PDF文件
        try {
          const pdfPath = path.join(cacheDir, `pixiv_${pid}.pdf`);
          
          // 从配置中读取PDF生成模式
          const pdfMode = config.pdf_mode || 'images_only'; // 默认为只包含图片
          // 判断是否生成纯图片PDF
          const imagesOnlyPDF = pdfMode === 'images_only';
          
          if (imagesOnlyPDF) {
            // 使用合并转发消息格式发送文本信息
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
            
            // 如果有相关作品信息，也添加到转发消息中
            if (relatedText && relatedText.trim()) {
              forwardMessages.push({
                message: `相关作品信息：\n${relatedText}`,
                nickname: Bot.nickname || "Pixiv-Plugin",
                user_id: Bot.uin
              });
            }
            
            // 尝试发送合并转发消息
            let forwardSuccess = false;
            try {
              // 尝试多种方法发送合并转发
              if (!forwardSuccess && typeof Bot.makeForwardMsg === 'function') {
                const opts = e.isGroup ? {} : { target: e.user_id };
                await e.reply(await Bot.makeForwardMsg(forwardMessages, opts));
                forwardSuccess = true;
                Logger.info(`使用Bot.makeForwardMsg成功发送作品信息的合并转发`);
              }
              
              if (!forwardSuccess) {
                let makeForwardMsgFunc = null;
                
                if (e.isGroup && e.group && typeof e.group.makeForwardMsg === 'function') {
                  makeForwardMsgFunc = e.group.makeForwardMsg.bind(e.group);
                } else if (!e.isGroup && e.friend && typeof e.friend.makeForwardMsg === 'function') {
                  makeForwardMsgFunc = e.friend.makeForwardMsg.bind(e.friend);
                } else if (global.common && typeof global.common.makeForwardMsg === 'function') {
                  makeForwardMsgFunc = (msgs) => global.common.makeForwardMsg(e, msgs);
                } else if (segment && typeof segment.forward === 'function') {
                  await e.reply(segment.forward(forwardMessages));
                  forwardSuccess = true;
                  Logger.info(`使用segment.forward成功发送作品信息的合并转发`);
                  makeForwardMsgFunc = null; // 已处理，不需要再次处理
                }
                
                if (makeForwardMsgFunc && !forwardSuccess) {
                  await e.reply(await makeForwardMsgFunc(forwardMessages));
                  forwardSuccess = true;
                  Logger.info(`使用makeForwardMsg成功发送作品信息的合并转发`);
                }
              }
            } catch (err) {
              Logger.error(`发送合并转发消息失败: ${err.message}`);
            }
            
            // 如果合并转发消息发送失败，退回到原有的分段发送方式
            if (!forwardSuccess) {
              Logger.warn('合并转发消息发送失败，退回到分段发送方式');
              // 使用旧方法发送文本信息
              const textContent = [`作品ID: ${pid} 的基本信息：\n${infoText}`];
              
              // 如果有相关作品信息，也添加到消息中
              if (relatedText && relatedText.trim()) {
                textContent.push(`相关作品信息：\n${relatedText}`);
              }
              
              // 直接发送每个部分作为单独的聊天记录
              for (const text of textContent) {
                await this.sendChatRecord(e, "Pixiv作品详细信息", text, true);
                // 发送消息间短暂等待
                await new Promise(resolve => setTimeout(resolve, 300));
              }
            }
            
            // 然后只生成包含图片的PDF
            await this.generateImageOnlyPDF(pdfPath, downloadedImages);
            
            // 任务正在执行中的通知
            if (taskQueue && taskQueue.length > 0) {
              // 格式化等待中的任务信息
              let waitingTasks = taskQueue.map((task, index) => 
                `${index + 1}. ${task.name} (等待时间: ${((Date.now() - task.addTime) / 1000).toFixed(1)}秒)`
              ).join('\n');
              
              await this.sendChatRecord(e, "处理队列状态", 
                `当前任务正在处理中，还有${taskQueue.length}个任务在队列中等待处理：\n${waitingTasks}\n\n请耐心等待，任务将按顺序处理，这样可以确保文件不会被过早删除。`
              );
            }
            
            // 发送PDF文件
            await e.reply(`已生成作品图片PDF文件，正在发送...`);
            await this.sendPDFFile(e, pdfPath, `pixiv_${pid}`);
            Logger.info(`成功发送纯图片PDF文件: ${pdfPath}`);
          } else {
            // 原始的完整PDF生成逻辑
            await this.generatePDF(pdfPath, title, infoText, downloadedImages, relatedText);
            
            // 发送PDF文件
            await e.reply(`已生成作品"${title}"的PDF文件，正在发送...`);
            await this.sendPDFFile(e, pdfPath, `pixiv_${pid}`);
            Logger.info(`成功发送PDF文件: ${pdfPath}`);
          }
        } catch (pdfError) {
          Logger.error("生成或发送PDF失败", pdfError);
          
          // 向用户发送失败消息，但更加具体
          if (pdfError.message && pdfError.message.includes('WinAnsi cannot encode')) {
            await e.reply("PDF生成失败：由于字体编码问题，无法在PDF中正确显示中文字符。将使用纯英文模式重试...");
            
            // 尝试使用纯英文模式生成PDF
            try {
              // 强制设置不使用中文字体
              this.hasFontSupport = false;
              const pdfPath = path.join(cacheDir, `pixiv_${pid}_en.pdf`);
              await this.generatePDF(pdfPath, title, infoText, downloadedImages, relatedText);
              
              // 发送纯英文PDF文件
              await e.reply(`由于中文编码问题，已生成英文版PDF文件，正在发送...`);
              await this.sendPDFFile(e, pdfPath, `pixiv_${pid}_en`);
              Logger.info(`成功发送英文版PDF文件: ${pdfPath}`);
              return false;
            } catch (retryError) {
              Logger.error("纯英文模式PDF生成失败", retryError);
              await e.reply("纯英文模式PDF生成仍然失败，将退回到直接发送文本和图片的方式...");
            }
          } else if (pdfError.message && pdfError.message.includes('字体处理失败')) {
            await e.reply("PDF生成失败：加载或处理字体失败。将退回到直接发送文本和图片的方式...");
          } else {
            await e.reply(`PDF生成失败：${pdfError.message || "未知错误"}。将退回到直接发送文本和图片的方式...`);
          }
          
          // 创建单个合并转发消息，包含所有内容
          // 标题作为第一条消息
          let allContent = `作品ID: ${pid} - ${title}`;
          
          // 将所有文本内容统一放到一个合并转发消息中发送
          let forwardMessages = [
            {
              message: allContent,
              nickname: Bot.nickname || "Pixiv-Plugin",
              user_id: Bot.uin
            },
            {
              message: `基本信息：\n${infoText}`,
              nickname: Bot.nickname || "Pixiv-Plugin", 
              user_id: Bot.uin
            }
          ];
          
          // 如果有相关作品信息，添加到转发消息中
          if (relatedText && relatedText.trim()) {
            forwardMessages.push({
              message: `相关作品信息：\n${relatedText}`,
              nickname: Bot.nickname || "Pixiv-Plugin",
              user_id: Bot.uin
            });
          }
          
          // 发送合并转发消息
          let forwardSuccess = false;
          
          // 尝试使用多种方法发送合并转发
          // 方法1: 使用Bot.makeForwardMsg
          if (!forwardSuccess && typeof Bot.makeForwardMsg === 'function') {
            try {
              const opts = e.isGroup ? {} : { target: e.user_id };
              await e.reply(await Bot.makeForwardMsg(forwardMessages, opts));
              forwardSuccess = true;
              Logger.info(`使用Bot.makeForwardMsg成功发送作品信息的合并转发`);
            } catch (err) {
              Logger.error(`使用Bot.makeForwardMsg发送失败: ${err.message}`);
            }
          }
          
          // 方法2: 使用适合的makeForwardMsg方法
          if (!forwardSuccess) {
            try {
              let makeForwardMsgFunc = null;
              
              if (e.isGroup && e.group && typeof e.group.makeForwardMsg === 'function') {
                makeForwardMsgFunc = e.group.makeForwardMsg.bind(e.group);
              } else if (!e.isGroup && e.friend && typeof e.friend.makeForwardMsg === 'function') {
                makeForwardMsgFunc = e.friend.makeForwardMsg.bind(e.friend);
              } else if (global.common && typeof global.common.makeForwardMsg === 'function') {
                makeForwardMsgFunc = (msgs) => global.common.makeForwardMsg(e, msgs);
              } else if (segment && typeof segment.forward === 'function') {
                await e.reply(segment.forward(forwardMessages));
                forwardSuccess = true;
                Logger.info(`使用segment.forward成功发送作品信息的合并转发`);
                makeForwardMsgFunc = null; // 已处理，不需要再次处理
              }
              
              if (makeForwardMsgFunc && !forwardSuccess) {
                await e.reply(await makeForwardMsgFunc(forwardMessages));
                forwardSuccess = true;
                Logger.info(`使用makeForwardMsg成功发送作品信息的合并转发`);
              }
            } catch (err) {
              Logger.error(`发送合并转发消息失败: ${err.message}`);
            }
          }
          
          // 如果合并转发消息发送失败，退回到原有的分段发送方式
          if (!forwardSuccess) {
            Logger.warn('合并转发消息发送失败，退回到分段发送方式');
            // 使用引用消息格式发送文本信息
            const textContent = [`作品ID: ${pid} 的基本信息：\n${infoText}`];
            
            // 如果有相关作品信息，也添加到消息中
            if (relatedText && relatedText.trim()) {
              textContent.push(`相关作品信息：\n${relatedText}`);
            }
            
            // 直接发送每个部分作为单独的聊天记录
            for (const text of textContent) {
              await this.sendChatRecord(e, "Pixiv作品详细信息", text, true);
              // 发送消息间短暂等待
              await new Promise(resolve => setTimeout(resolve, 300));
            }
          }
          
          // 尝试生成和发送预览图片
          await this.sendImagesDirectly(e, downloadedImages, 5);
        }
        
        return false;
      } catch (error) {
        Logger.error("获取作品信息失败", error);
        
        // 检查是否是HTTP错误
        let errorMessage = error.message || "未知错误";
        
        // 提取HTTP状态码
        const statusMatch = errorMessage.match(/(\d{3})/);
        if (statusMatch) {
          const status = parseInt(statusMatch[1]);
          const advice = this.getErrorAdvice(status, "作品信息");
          await e.reply(`获取作品(ID: ${pid})信息时出错: ${errorMessage}\n\n${advice}`);
        } else if (errorMessage.includes('fetch') || errorMessage.includes('网络')) {
          // 网络连接错误
          await e.reply(`获取作品(ID: ${pid})信息时出现网络错误。\n\n请检查：\n1. 您的网络连接是否正常\n2. 是否需要使用代理访问Pixiv\n3. Pixiv服务器是否可访问\n4. Cookie配置是否正确`);
        } else if (errorMessage.includes('Cannot read properties of undefined') || 
                  errorMessage.includes('Cannot read property') ||
                  errorMessage.includes('is undefined')) {
          // 使用专门的方法处理此类常见错误
          const friendlyError = this.handleJSError(error, `获取作品(ID: ${pid})信息`);
          await e.reply(friendlyError);
        } else {
          // 其他错误
          await e.reply(`获取作品(ID: ${pid})信息时出错: ${errorMessage}，请稍后再试。`);
        }
        
        return false;
      } finally {
        // 无论处理成功还是失败，都要清理临时文件
        // 任务完成后延迟10秒再清理，确保文件发送完成
        setTimeout(() => {
          // 使用安全的目录删除方法
          this.safeRemoveDirectory(cacheDir)
            .then(() => Logger.info(`缓存目录处理完成: ${cacheDir}`))
            .catch(err => Logger.error(`处理缓存目录时出错: ${cacheDir}`, err));
        }, 10000);
      }
    }
  }
  
  /**
   * 清理目录中的所有文件
   * @param {string} directory - 要清理的目录路径
   */
  cleanDirectory(directory) {
    try {
      Logger.info(`开始清理临时文件目录: ${directory}`);
      
      if (!fs.existsSync(directory)) {
        Logger.info(`目录不存在: ${directory}`);
        return;
      }
      
      const files = fs.readdirSync(directory);
      let cleanedCount = 0;
      
      for (const file of files) {
        try {
          const filePath = path.join(directory, file);
          const stats = fs.statSync(filePath);
          
          if (stats.isFile()) {
            fs.unlinkSync(filePath);
            cleanedCount++;
          } else if (stats.isDirectory()) {
            // 递归清理子目录
            this.cleanDirectory(filePath);
            // 尝试删除空目录
            try { 
              fs.rmdirSync(filePath); 
            } catch (e) { 
              Logger.debug(`无法删除子目录: ${filePath}, 错误: ${e.message}`);
            }
          }
        } catch (cleanError) {
          Logger.error(`删除临时文件失败: ${file}`, cleanError);
        }
      }
      
      Logger.info(`已成功删除${cleanedCount}个临时文件`);
    } catch (dirError) {
      Logger.error(`清理临时目录失败: ${directory}`, dirError);
    }
  }
  
  // 添加一个新的方法，用于安全地删除目录
  async safeRemoveDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
      Logger.info(`目录不存在，无需删除: ${dirPath}`);
      return;
    }
    
    try {
      // 先清理目录内容
      this.cleanDirectory(dirPath);
      
      // 再尝试删除目录本身
      try {
        fs.rmdirSync(dirPath);
        Logger.info(`成功删除目录: ${dirPath}`);
      } catch (err) {
        // 如果是目录不为空的错误，记录但不抛出异常
        if (err.code === 'ENOTEMPTY') {
          Logger.warn(`目录不为空，无法删除: ${dirPath}`);
        } 
        // 如果是目录不存在的错误，可能是已被其他进程删除
        else if (err.code === 'ENOENT') {
          Logger.info(`目录已不存在: ${dirPath}`);
        } 
        // 其他错误则记录
        else {
          Logger.error(`删除目录时出错: ${dirPath}`, err);
        }
      }
    } catch (err) {
      Logger.error(`安全删除目录失败: ${dirPath}`, err);
    }
  }

  /**
   * 生成PDF文件
   * @param {string} filePath - PDF文件保存路径
   * @param {string} title - 作品标题
   * @param {string} info - 作品信息文本
   * @param {Array} images - 图片路径数组，包含 {path, index} 对象
   * @param {string} relatedText - 相关作品信息文本
   */
  async generatePDF(filePath, title, info, images, relatedText) {
    try {
      // 创建新的PDF文档
      const pdfDoc = await PDFDocument.create();
      
      // 注册fontkit以支持自定义字体
      pdfDoc.registerFontkit(fontkit);
      
      // 尝试加载或创建中文字体
      let chineseFont;
      let fontLoaded = false;
      try {
        // 首先尝试加载本地中文字体文件
        const fontPath = path.resolve(process.cwd(), './plugins/pixiv-plugin/resources/fonts/SourceHanSansCN-Normal.otf');
        
        // 检查字体文件是否存在
        if (fs.existsSync(fontPath)) {
          Logger.info("发现本地中文字体，正在加载...");
          const fontBytes = fs.readFileSync(fontPath);
          chineseFont = await pdfDoc.embedFont(fontBytes);
          Logger.info("成功加载本地中文字体");
          fontLoaded = true;
          this.hasFontSupport = true;
        } else {
          // 尝试加载系统中已有的中文字体
          Logger.info("本地中文字体文件不存在，尝试使用标准字体...");
          
          // 尝试使用Times-Roman并回退到标准字体
          try {
            const standardFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
            chineseFont = standardFont;
            Logger.warn("使用标准Times-Roman字体。中文字符可能无法正常显示。");
            this.hasFontSupport = false;
            fontLoaded = true;
          } catch (standardFontError) {
            Logger.error("加载标准字体失败", standardFontError);
            throw new Error("无法加载任何可用字体");
          }
        }
      } catch (fontError) {
        Logger.error("字体处理失败", fontError);
        this.hasFontSupport = false;
        throw new Error(`字体处理失败：${fontError.message}`);
      }
      
      // 设置元数据
      pdfDoc.setTitle(`Pixiv Artwork: ${title}`);
      pdfDoc.setAuthor('Pixiv-Plugin');
      pdfDoc.setSubject('Pixiv Artwork Information');
      
      // 添加封面页
      let page = pdfDoc.addPage();
      const { width, height } = page.getSize();
      const fontSize = 24;
      
      // 转换中文为拉丁字符，确保在没有中文字体的情况下也能显示
      const safeTitle = this.convertToSafeText(`Pixiv Artwork: ${title}`);
      
      page.drawText(safeTitle, {
        x: 50,
        y: height - 100,
        size: fontSize,
        font: chineseFont,
        color: rgb(0, 0, 0),
      });
      
      // 添加字体状态提示
      if (!this.hasFontSupport) {
        page.drawText("Note: Chinese font not available, some characters may display as '_'", {
          x: 50,
          y: height - 130,
          size: 10,
          font: chineseFont,
          color: rgb(1, 0, 0),
        });
      }
      
      // 添加基本信息
      const infoLines = info.split('\n');
      let y = height - 150;
      
      // 如果没有中文字体支持，则y值需要额外下移
      if (!this.hasFontSupport) {
        y -= 20;
      }
      
      for (const line of infoLines) {
        // 转换为安全文本
        const safeLine = this.convertToSafeText(line);
        page.drawText(safeLine, {
          x: 50,
          y: y,
          size: 12,
          font: chineseFont,
          color: rgb(0, 0, 0),
        });
        y -= 20;
      }
      
      // 添加每张图片
      let sharp;
      try {
        sharp = require('sharp');
        Logger.info("成功加载sharp库用于图片处理");
      } catch (err) {
        Logger.warn("无法加载sharp库，将使用替代方法");
      }
      
      for (const img of images) {
        try {
          // 读取图片并转换为PNG格式
          let imgData;
          let imgBuffer;
          
          // 首先读取原始图片文件
          imgBuffer = fs.readFileSync(img.path);
          
          if (sharp) {
            // 使用sharp处理图片
            try {
              imgData = await sharp(imgBuffer)
                .resize({ width: 1000, height: 1400, fit: 'inside' })
                .toFormat('png')
                .toBuffer();
              Logger.info(`使用sharp成功处理图片 ${img.index}`);
            } catch (sharpError) {
              Logger.error(`使用sharp处理图片 ${img.index} 失败`, sharpError);
              // 如果sharp处理失败，尝试使用原始数据
              imgData = imgBuffer;
            }
          } else {
            // 没有sharp库，尝试检测图片类型并简单处理
            imgData = imgBuffer;
            
            // 使用简单的文件头检查图片格式
            const isPNG = this.isPNGImage(imgBuffer);
            const isJPEG = this.isJPEGImage(imgBuffer);
            
            if (!isPNG && !isJPEG) {
              Logger.warn(`图片 ${img.index} 不是PNG或JPEG格式，可能无法嵌入到PDF`);
            } else {
              Logger.info(`图片 ${img.index} 检测为 ${isPNG ? 'PNG' : 'JPEG'} 格式`);
            }
          }
          
          // 嵌入图片到PDF
          let imgPage = pdfDoc.addPage();
          const imgWidth = imgPage.getWidth() - 100;
          const imgHeight = imgPage.getHeight() - 100;
          
          // 添加图片标题
          const safeImgTitle = this.convertToSafeText(`Image ${img.index}`);
          imgPage.drawText(safeImgTitle, {
            x: 50,
            y: imgPage.getHeight() - 50,
            size: 16,
            font: chineseFont,
            color: rgb(0, 0, 0),
          });
          
          // 尝试嵌入图片
          try {
            // 尝试检测图片类型
            const isPNG = this.isPNGImage(imgData);
            const isJPEG = this.isJPEGImage(imgData);
            
            let pngImage;
            if (isPNG) {
              // 如果是PNG，直接嵌入
              pngImage = await pdfDoc.embedPng(imgData);
              Logger.info(`成功嵌入PNG图片 ${img.index}`);
            } else if (isJPEG) {
              // 如果是JPEG，使用embedJpg
              pngImage = await pdfDoc.embedJpg(imgData);
              Logger.info(`成功嵌入JPEG图片 ${img.index}`);
            } else {
              throw new Error('不支持的图片格式，只能嵌入PNG或JPEG格式');
            }
            
            const { width: pngWidth, height: pngHeight } = pngImage.size();
            
            // 计算适合页面的尺寸
            let scaledWidth = pngWidth;
            let scaledHeight = pngHeight;
            
            if (pngWidth > imgWidth) {
              scaledWidth = imgWidth;
              scaledHeight = (pngHeight * imgWidth) / pngWidth;
            }
            
            if (scaledHeight > imgHeight) {
              scaledHeight = imgHeight;
              scaledWidth = (pngWidth * imgHeight) / pngHeight;
            }
            
            // 在页面中央绘制图片
            imgPage.drawImage(pngImage, {
              x: (imgPage.getWidth() - scaledWidth) / 2,
              y: (imgPage.getHeight() - scaledHeight) / 2,
              width: scaledWidth,
              height: scaledHeight,
            });
            
          } catch (embedError) {
            // 如果无法嵌入图片，添加错误信息
            Logger.error(`无法嵌入图片 ${img.index} 到PDF`, embedError);
            const safeErrorMsg = this.convertToSafeText(`图片 ${img.index} 无法嵌入 (${embedError.message})`);
            imgPage.drawText(safeErrorMsg, {
              x: 50,
              y: imgPage.getHeight() / 2,
              size: 12,
              font: chineseFont,
              color: rgb(1, 0, 0),
            });
          }
        } catch (imgError) {
          // 添加新页面并显示错误信息
          let errorPage = pdfDoc.addPage();
          const safeErrorMsg = this.convertToSafeText(`处理图片 ${img.index} 时出错: ${imgError.message}`);
          errorPage.drawText(safeErrorMsg, {
            x: 50,
            y: errorPage.getHeight() - 50,
            size: 12,
            font: chineseFont,
            color: rgb(1, 0, 0),
          });
          Logger.error(`处理图片 ${img.index} 时出错`, imgError);
        }
      }
      
      // 添加相关作品信息
      if (relatedText) {
        const relatedPage = pdfDoc.addPage();
        const safeRelatedTitle = this.convertToSafeText("相关作品信息");
        relatedPage.drawText(safeRelatedTitle, {
          x: 50,
          y: relatedPage.getHeight() - 50,
          size: 16,
          font: chineseFont,
          color: rgb(0, 0, 0),
        });
        
        // 分行添加相关作品信息
        const lines = relatedText.split('\n');
        let yPos = relatedPage.getHeight() - 80;
        let currentPage = relatedPage;
        
        for (const line of lines) {
          // 检查是否需要新页面
          if (yPos < 50) {
            // 如果页面空间不足，添加新页面
            currentPage = pdfDoc.addPage();
            yPos = currentPage.getHeight() - 50;
          }
          
          // 空行跳过
          if (line.trim() === '') {
            yPos -= 10;
            continue;
          }
          
          // 转换为安全文本并绘制
          const safeLine = this.convertToSafeText(line);
          currentPage.drawText(safeLine, {
            x: 50,
            y: yPos,
            size: 10,
            font: chineseFont,
            color: rgb(0, 0, 0),
          });
          
          yPos -= 15;
        }
      }
      
      // 保存PDF文件
      const pdfBytes = await pdfDoc.save();
      fs.writeFileSync(filePath, pdfBytes);
      
      return filePath;
    } catch (error) {
      Logger.error("生成PDF文件失败", error);
      throw error;
    }
  }
  
  /**
   * 将文本转换为PDF安全的文本
   * @param {string} text - 原始文本
   * @returns {string} - 转换后的安全文本
   */
  convertToSafeText(text) {
    try {
      // 检查是否有中文字体可用
      const hasFontSupport = this.hasFontSupport;
      
      // 如果有中文字体支持，直接返回原始文本
      if (hasFontSupport) {
        return text;
      }
      
      // 创建一个中文到拼音或英文的映射
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
        '信息': 'Info',
        '原神': 'Genshin Impact',
        '漫画': 'Manga',
        '小说': 'Novel',
        '插画': 'Illustration',
        '星穹铁道': 'Honkai Star Rail',
        '纳西妲': 'Nahida',
        '草神': 'Dendro Archon',
        '可爱': 'Cute',
        '摄影': 'Photography',
        '旅行': 'Travel',
        '风景': 'Landscape',
        '二次元': 'Anime',
        '艺术': 'Art',
        '人物': 'Character',
        '游戏': 'Game',
        '动漫': 'Anime',
        '同人': 'Fanart',
        '收藏': 'Favorite',
        '画师': 'Artist',
        '系列': 'Series',
        '表情': 'Expression',
        '角色': 'Character',
        '服装': 'Costume',
        '场景': 'Scene',
        '日常': 'Daily',
        '创作': 'Creation',
        '生活': 'Life'
      };
      
      // 先尝试替换常见中文短语
      let result = text;
      for (const [chinese, english] of Object.entries(commonChineseMap)) {
        // 使用单词边界确保只替换完整的词汇
        result = result.replace(new RegExp(chinese, 'g'), english);
      }
      
      // 然后替换剩余的中文字符
      result = result.replace(/[\u4e00-\u9fa5]/g, () => '_');
      
      // 清理连续的下划线，使其更易读
      result = result.replace(/_{3,}/g, '___');
      
      return result;
    } catch (error) {
      Logger.error("文本转换失败", error);
      return text.replace(/[\u4e00-\u9fa5]/g, '_'); // 出错时简单替换为下划线
    }
  }

  /**
   * 直接发送图片（PDF生成失败时的备用方案）
   * @param {object} e - 消息事件对象
   * @param {Array} images - 图片信息数组
   * @param {number} maxImages - 最大发送图片数量
   */
  async sendImagesDirectly(e, images, maxImages = 5) {
    const count = Math.min(images.length, maxImages);
    
    if (count === 0) {
      await e.reply("没有可发送的图片");
      return;
    }
    
    await e.reply(`将发送前${count}张图片作为预览...`);
    
    for (let i = 0; i < count; i++) {
      try {
        // 发送原始图片
        await e.reply(segment.image(`file:///${images[i].path}`));
        Logger.info(`成功发送图片 ${i+1}/${count}`);
        
        // 每张图片间短暂等待，避免发送过快
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (imgError) {
        Logger.error(`发送图片${i+1}/${count}失败`, imgError);
        await e.reply(`发送第${i+1}张图片失败: ${imgError.message || "未知错误"}`);
      }
    }
    
    if (images.length > maxImages) {
      await e.reply(`仅显示前${maxImages}张图片，总共${images.length}张`);
    }
  }

  /**
   * 检查图片数据是否为PNG格式
   * @param {Buffer} buffer - 图片数据
   * @returns {boolean} - 是否为PNG格式
   */
  isPNGImage(buffer) {
    // PNG文件头: 89 50 4E 47 0D 0A 1A 0A
    if (buffer.length < 8) return false;
    return buffer[0] === 0x89 &&
           buffer[1] === 0x50 &&
           buffer[2] === 0x4E &&
           buffer[3] === 0x47 &&
           buffer[4] === 0x0D &&
           buffer[5] === 0x0A &&
           buffer[6] === 0x1A &&
           buffer[7] === 0x0A;
  }
  
  /**
   * 检查图片数据是否为JPEG格式
   * @param {Buffer} buffer - 图片数据
   * @returns {boolean} - 是否为JPEG格式
   */
  isJPEGImage(buffer) {
    // JPEG文件头: FF D8
    if (buffer.length < 2) return false;
    return buffer[0] === 0xFF && buffer[1] === 0xD8;
  }

  /**
   * 只生成包含图片的PDF文件
   * @param {string} filePath - PDF文件保存路径
   * @param {Array} images - 图片路径数组，包含 {path, index} 对象
   */
  async generateImageOnlyPDF(filePath, images) {
    try {
      // 创建新的PDF文档
      const pdfDoc = await PDFDocument.create();
      
      // 设置元数据
      pdfDoc.setTitle('Pixiv Images');
      pdfDoc.setAuthor('Pixiv-Plugin');
      pdfDoc.setSubject('Pixiv Artwork Images');
      
      // 添加每张图片
      let sharp;
      try {
        sharp = require('sharp');
        Logger.info("成功加载sharp库用于图片处理");
      } catch (err) {
        Logger.warn("无法加载sharp库，将使用替代方法");
      }
      
      // 如果没有图片，添加一个空白页面
      if (images.length === 0) {
        pdfDoc.addPage();
        Logger.warn("没有图片可以添加到PDF中");
      }
      
      for (const img of images) {
        try {
          // 读取图片并转换为PDF兼容格式
          let imgData;
          let imgBuffer;
          
          // 首先读取原始图片文件
          imgBuffer = fs.readFileSync(img.path);
          
          if (sharp) {
            // 使用sharp处理图片
            try {
              imgData = await sharp(imgBuffer)
                .resize({ width: 1000, height: 1400, fit: 'inside' })
                .toFormat('png')
                .toBuffer();
              Logger.info(`使用sharp成功处理图片 ${img.index}`);
            } catch (sharpError) {
              Logger.error(`使用sharp处理图片 ${img.index} 失败`, sharpError);
              imgData = imgBuffer;
            }
          } else {
            // 没有sharp库，直接使用原始数据
            imgData = imgBuffer;
          }
          
          // 嵌入图片到PDF
          let imgPage = pdfDoc.addPage();
          const imgWidth = imgPage.getWidth() - 50;  // 留更少的边距，图片占更多空间
          const imgHeight = imgPage.getHeight() - 50;
          
          // 尝试嵌入图片
          try {
            // 检测图片类型
            const isPNG = this.isPNGImage(imgData);
            const isJPEG = this.isJPEGImage(imgData);
            
            let pngImage;
            if (isPNG) {
              pngImage = await pdfDoc.embedPng(imgData);
              Logger.info(`成功嵌入PNG图片 ${img.index}`);
            } else if (isJPEG) {
              pngImage = await pdfDoc.embedJpg(imgData);
              Logger.info(`成功嵌入JPEG图片 ${img.index}`);
            } else {
              throw new Error('不支持的图片格式，只能嵌入PNG或JPEG格式');
            }
            
            const { width: pngWidth, height: pngHeight } = pngImage.size();
            
            // 计算适合页面的尺寸
            let scaledWidth = pngWidth;
            let scaledHeight = pngHeight;
            
            if (pngWidth > imgWidth) {
              scaledWidth = imgWidth;
              scaledHeight = (pngHeight * imgWidth) / pngWidth;
            }
            
            if (scaledHeight > imgHeight) {
              scaledHeight = imgHeight;
              scaledWidth = (pngWidth * imgHeight) / pngHeight;
            }
            
            // 在页面中央绘制图片，占据更多空间
            imgPage.drawImage(pngImage, {
              x: (imgPage.getWidth() - scaledWidth) / 2,
              y: (imgPage.getHeight() - scaledHeight) / 2,
              width: scaledWidth,
              height: scaledHeight,
            });
            
          } catch (embedError) {
            // 如果无法嵌入图片，记录错误但不添加错误文本
            Logger.error(`无法嵌入图片 ${img.index} 到PDF`, embedError);
            // 添加一个小注释表明图片加载失败
            imgPage.drawText(`Image ${img.index} failed to load`, {
              x: 50,
              y: imgPage.getHeight() / 2,
              size: 12,
              color: rgb(1, 0, 0),
            });
          }
        } catch (imgError) {
          // 记录错误但继续处理
          Logger.error(`处理图片 ${img.index} 时出错`, imgError);
        }
      }
      
      // 保存PDF文件
      const pdfBytes = await pdfDoc.save();
      fs.writeFileSync(filePath, pdfBytes);
      
      return filePath;
    } catch (error) {
      Logger.error("生成纯图片PDF文件失败", error);
      throw error;
    }
  }

  /**
   * 检查HTTP错误并给出具体建议
   * @param {number} status - HTTP状态码
   * @param {string} context - 错误上下文信息
   * @returns {string} - 针对特定错误的建议
   */
  getErrorAdvice(status, context) {
    // 处理常见的HTTP错误
    if (status === 404) {
      return `访问资源不存在(404错误)，可能原因：
1. 请检查您的Pixiv Cookie是否已正确配置和更新
2. 该作品可能已被删除或设为私有
3. 网络连接可能存在问题，请检查您是否能正常访问Pixiv网站
4. ${context}可能需要特定权限`;
    } else if (status === 403) {
      return `访问被拒绝(403错误)，可能原因：
1. 您的Pixiv Cookie可能已过期，请更新
2. 该作品可能有年龄限制，需要登录账号查看
3. ${context}可能需要特定权限`;
    } else if (status === 401) {
      return `未授权访问(401错误)，请检查您的Pixiv Cookie是否有效，可能需要重新登录Pixiv`;
    } else if (status >= 500) {
      return `Pixiv服务器错误(${status})，请稍后再试`;
    } else if (status === 0 || !status) {
      return `网络连接问题，请检查：
1. 您的网络是否能正常访问Pixiv
2. 是否需要使用代理访问
3. 您的Pixiv Cookie是否已正确配置`;
    }
    return `请求错误(${status})，请检查网络连接和Pixiv Cookie配置`;
  }

  /**
   * 获取作者详细信息
   * @param {string} userId - 作者用户ID
   * @returns {Promise<Object>} - 作者详细信息
   */
  async getUserInfo(userId) {
    try {
      // 如果已导入User函数，直接使用
      if (typeof Pixiv.User === 'function') {
        const userInfo = await Pixiv.User(userId);
        return {
          name: userInfo.name,
          account: userInfo.account,
          bio: userInfo.comment,
          webpage: userInfo.webpage,
          // 可以添加更多需要的字段
        };
      }
      
      // 如果没有User函数，尝试自己获取
      const url = `https://www.pixiv.net/ajax/user/${userId}?full=1`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Referer': 'https://www.pixiv.net/',
        }
      });
      
      if (!response.ok) {
        const advice = this.getErrorAdvice(response.status, "用户信息");
        throw new Error(`获取用户信息失败: ${response.status} ${response.statusText}\n${advice}`);
      }
      
      const data = await response.json();
      if (data.error) {
        throw new Error(`API错误: ${data.message}`);
      }
      
      return {
        name: data.body?.name,
        account: data.body?.account,
        bio: data.body?.comment,
        webpage: data.body?.webpage,
        // 可以添加更多需要的字段
      };
    } catch (error) {
      Logger.error(`获取用户信息出错: ${error.message}`, error);
      return null;
    }
  }

  /**
   * 获取作品类型描述
   * @param {Array} artworks - 作品图片数组
   * @returns {string} - 作品类型描述
   */
  getArtworkType(artworks) {
    if (!artworks || artworks.length === 0) return "未知";
    
    if (artworks.length === 1) {
      return "单图作品";
    } else if (artworks.length > 1) {
      return `多图作品(${artworks.length}张)`;
    }
    
    return "未知类型";
  }

  /**
   * 获取图片尺寸信息
   * @param {Array} artworks - 作品图片数组
   * @returns {string} - 图片尺寸信息
   */
  getImageDimensions(artworks) {
    if (!artworks || artworks.length === 0) return "未知";
    
    // 只获取第一张图片的尺寸
    const firstArtwork = artworks[0];
    if (firstArtwork && firstArtwork.original) {
      // 尝试获取图片尺寸
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
    
    // 如果无法获取尺寸信息
    return "未知尺寸";
  }

  /**
   * 获取作品统计信息
   * @param {string} pid - 作品ID
   * @returns {Promise<Object>} - 统计信息对象
   */
  async getArtworkStats(pid) {
    try {
      const url = `https://www.pixiv.net/ajax/illust/${pid}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Referer': 'https://www.pixiv.net/',
        }
      });
      
      if (!response.ok) {
        const advice = this.getErrorAdvice(response.status, "作品统计");
        throw new Error(`获取作品统计失败: ${response.status} ${response.statusText}\n${advice}`);
      }
      
      const data = await response.json();
      if (data.error) {
        throw new Error(`API错误: ${data.message}`);
      }
      
      // 获取统计数据
      const bookmarkCount = data.body?.bookmarkCount || 0;
      const likeCount = data.body?.likeCount || 0;
      const viewCount = data.body?.viewCount || 0;
      const commentCount = data.body?.commentCount || 0;
      
      return {
        bookmarkCount,
        likeCount,
        viewCount,
        commentCount,
        // 可以添加更多统计数据
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

  /**
   * 发送聊天记录格式的消息，支持详细信息和多条消息
   * @param {object} e - 消息事件对象
   * @param {string} title - 消息标题
   * @param {string} content - 消息内容
   * @param {boolean} useMultipleMessages - 是否拆分为多条消息
   */
  async sendChatRecord(e, title, content, useMultipleMessages = false) {
    // 如果启用多条消息模式并且内容较长
    if (useMultipleMessages && content.length > 3000) {
      // 将内容按段落分割
      const paragraphs = content.split('\n\n');
      const messages = [];
      let currentMessage = '';
      
      for (const paragraph of paragraphs) {
        // 如果当前消息加上这段会超过长度限制
        if (currentMessage.length + paragraph.length + 2 > 3000) {
          messages.push(currentMessage);
          currentMessage = paragraph;
        } else {
          if (currentMessage) {
            currentMessage += '\n\n';
          }
          currentMessage += paragraph;
        }
      }
      
      // 添加最后一条消息
      if (currentMessage) {
        messages.push(currentMessage);
      }
      
      // 发送多条消息
      for (let i = 0; i < messages.length; i++) {
        const messageTitle = messages.length > 1 ? `${title} (${i+1}/${messages.length})` : title;
        await this.sendSingleChatRecord(e, messageTitle, messages[i]);
        // 短暂等待避免发送过快
        if (i < messages.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
      
      return;
    }
    
    // 单条消息模式
    await this.sendSingleChatRecord(e, title, content);
  }

  /**
   * 发送单条聊天记录
   * @param {object} e - 消息事件对象
   * @param {string} title - 消息标题
   * @param {string} content - 消息内容
   */
  async sendSingleChatRecord(e, title, content) {
    // 创建转发消息
    let forwardMsg = [];
    
    // 将内容分割成多条消息(每条最大1000字符)
    const messages = [];
    if (content.length > 1000) {
      // 按行分割
      const lines = content.split('\n');
      let currentMsg = '';
      
      for (const line of lines) {
        if (currentMsg.length + line.length + 1 > 1000) {
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
    
    // 添加标题作为第一条消息
    forwardMsg.push({
      message: title,
      nickname: Bot.nickname || "Pixiv-Plugin",
      user_id: Bot.uin
    });
    
    // 添加多条内容消息
    for (let i = 0; i < messages.length; i++) {
      forwardMsg.push({
        message: messages[i],
        nickname: Bot.nickname || "Pixiv-Plugin",
        user_id: Bot.uin
      });
    }
    
    // 尝试所有可能的方法发送转发消息
    let success = false;
    
    // 方法1: 使用Bot.makeForwardMsg (TRSS-Yunzai新版本)
    if (!success) {
      try {
        if (typeof Bot.makeForwardMsg === 'function') {
          const opts = e.isGroup ? {} : { target: e.user_id };
          await e.reply(await Bot.makeForwardMsg(forwardMsg, opts));
          success = true;
          Logger.info(`使用Bot.makeForwardMsg成功发送包含${forwardMsg.length}条消息的合并转发`);
        }
      } catch (err) {
        Logger.error(`使用Bot.makeForwardMsg发送失败: ${err.message}`);
      }
    }
    
    // 方法2: 使用e.friend?.makeForwardMsg (用于私聊)
    if (!success && e.friend && typeof e.friend.makeForwardMsg === 'function') {
      try {
        await e.reply(await e.friend.makeForwardMsg(forwardMsg));
        success = true;
        Logger.info(`使用e.friend.makeForwardMsg成功发送包含${forwardMsg.length}条消息的合并转发`);
      } catch (err) {
        Logger.error(`使用e.friend.makeForwardMsg发送失败: ${err.message}`);
      }
    }
    
    // 方法3: 使用e.group?.makeForwardMsg (用于群聊)
    if (!success && e.group && typeof e.group.makeForwardMsg === 'function') {
      try {
        await e.reply(await e.group.makeForwardMsg(forwardMsg));
        success = true;
        Logger.info(`使用e.group.makeForwardMsg成功发送包含${forwardMsg.length}条消息的合并转发`);
      } catch (err) {
        Logger.error(`使用e.group.makeForwardMsg发送失败: ${err.message}`);
      }
    }
    
    // 方法4: 使用segment.forward
    if (!success && segment && typeof segment.forward === 'function') {
      try {
        await e.reply(segment.forward(forwardMsg));
        success = true;
        Logger.info(`使用segment.forward成功发送包含${forwardMsg.length}条消息的合并转发`);
      } catch (err) {
        Logger.error(`使用segment.forward发送失败: ${err.message}`);
      }
    }
    
    // 方法5: 适用于其他版本的转发消息
    if (!success) {
      try {
        // 检查全局是否有common.makeForwardMsg
        if (global.common && typeof global.common.makeForwardMsg === 'function') {
          await e.reply(await global.common.makeForwardMsg(e, forwardMsg));
          success = true;
          Logger.info(`使用global.common.makeForwardMsg成功发送包含${forwardMsg.length}条消息的合并转发`);
        }
      } catch (err) {
        Logger.error(`使用global.common.makeForwardMsg发送失败: ${err.message}`);
      }
    }
    
    // 所有方法都失败，回退到普通文本发送
    if (!success) {
      Logger.warn('所有转发消息方法都失败，回退到普通文本发送');
      await e.reply(`${title}:\n${content}`);
    }
  }

  /**
   * 发送PDF文件，使用多种方法尝试
   * @param {object} e - 消息事件对象
   * @param {string} filePath - PDF文件路径
   * @param {string} fileName - 文件名（不含扩展名）
   * @returns {boolean} 是否发送成功
   */
  async sendPDFFile(e, filePath, fileName) {
    // 确保文件存在
    if (!fs.existsSync(filePath)) {
      Logger.error(`发送PDF文件失败: 文件不存在 ${filePath}`);
      await e.reply(`发送PDF文件失败: 文件不存在`);
      return false;
    }
    
    try {
      // 确保文件名有.pdf后缀
      const fullFileName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
      
      // 方法1: 直接使用消息组件中的文件元素，而不是使用base64编码
      if (e.group && e.group.fs && typeof e.group.fs.upload === 'function') {
        try {
          Logger.info(`开始上传文件到群文件: ${filePath}`);
          const result = await e.group.fs.upload(filePath, fullFileName);
          if (result) {
            Logger.info(`使用群文件上传功能成功发送PDF文件`);
            await e.reply(`文件已上传到群文件，请查看: ${fullFileName}`);
            return true;
          }
        } catch (err) {
          Logger.error(`使用群文件上传功能发送失败: ${err.message}`);
        }
      }
      
      // 方法2: 使用segment.file直接发送文件
      if (segment && typeof segment.file === 'function') {
        try {
          Logger.info(`使用segment.file发送本地文件: ${filePath}`);
          await e.reply(segment.file(filePath, fullFileName));
          Logger.info(`使用segment.file成功发送PDF文件`);
          return true;
        } catch (err) {
          Logger.error(`使用segment.file发送失败: ${err.message}`);
        }
      }
      
      // 方法3: 使用文件路径作为参数
      try {
        Logger.info(`尝试直接发送文件路径: ${filePath}`);
        await e.reply(['正在发送PDF文件，请稍等...', { type: 'file', file: filePath, name: fullFileName }]);
        Logger.info(`直接发送文件路径成功`);
        return true;
      } catch (err) {
        Logger.error(`直接发送文件路径失败: ${err.message}`);
      }
      
      // 方法4: 尝试读取文件并作为buffer发送
      try {
        const fileStats = fs.statSync(filePath);
        const fileSize = fileStats.size;
        
        // 检查文件大小是否可接受 (小于20MB)
        if (fileSize > 20 * 1024 * 1024) {
          Logger.warn(`文件太大(${(fileSize / 1024 / 1024).toFixed(2)}MB)，无法作为消息发送`);
          await e.reply(`PDF文件太大(${(fileSize / 1024 / 1024).toFixed(2)}MB)，请考虑减少图片数量或降低图片质量。`);
          return false;
        }
        
        Logger.info(`读取文件内容并作为buffer发送: ${filePath} (${(fileSize / 1024).toFixed(2)}KB)`);
        const fileBuffer = fs.readFileSync(filePath);
        await e.reply(['PDF文件已就绪', { type: 'file', file: fileBuffer, name: fullFileName }]);
        Logger.info(`成功以buffer方式发送PDF文件`);
        return true;
      } catch (err) {
        Logger.error(`读取文件并发送失败: ${err.message}`);
      }
      
      // 所有方法都失败，告知用户
      await e.reply(`PDF文件已生成(${filePath})，但无法自动发送，请手动查看。`);
      return false;
    } catch (err) {
      Logger.error(`发送PDF文件时出错: ${err.message}`);
      await e.reply(`发送PDF文件失败: ${err.message}`);
      return false;
    }
  }

  /**
   * 检查Pixiv Cookie配置并生成配置指导
   * @returns {string} - 配置指导信息
   */
  checkPixivCookieConfig() {
    // 获取当前配置
    let config;
    try {
      config = Config.getDefOrConfig('config');
    } catch (e) {
      Logger.error("获取配置文件失败", e);
      return `⚠️ Pixiv Cookie未配置或配置文件读取失败\n\n请按以下步骤配置Cookie：
1. 登录 Pixiv 网站 (https://www.pixiv.net)
2. 使用浏览器开发者工具获取Cookie
3. 在config.yaml中添加以下配置：
   cookie: '从Pixiv网站复制的Cookie字符串'
4. 重启机器人后再试`;
    }
    
    // 检查Cookie是否存在
    if (!config || !config.cookie || config.cookie.trim() === '') {
      return `⚠️ Pixiv Cookie未配置\n\n请按以下步骤配置Cookie：
1. 登录 Pixiv 网站 (https://www.pixiv.net)
2. 使用浏览器开发者工具获取Cookie
   - 在Chrome中按F12打开开发者工具
   - 选择"网络(Network)"标签
   - 刷新页面，选择任意一个pixiv.net的请求
   - 在"标头(Headers)"中找到"Cookie"字段
   - 复制整个Cookie值
3. 在config.yaml中添加以下配置：
   cookie: '从Pixiv网站复制的Cookie字符串'
4. 重启机器人后再试`;
    }
    
    // 检查Cookie内容，判断是否有效
    if (config.cookie.length < 50 || 
        !config.cookie.includes('PHPSESSID') || 
        !config.cookie.includes('device_token')) {
      return `⚠️ Pixiv Cookie格式似乎不正确\n\n请检查您的Cookie是否包含必要的信息(如PHPSESSID、device_token等)。
1. 请确保您已登录Pixiv网站
2. 重新获取完整的Cookie内容
3. 更新config.yaml中的配置：
   cookie: '新的Cookie字符串'
4. 重启机器人后再试`;
    }
    
    // Cookie可能存在但已过期的情况无法在此检查，需要在请求响应中判断
    return `Pixiv Cookie已配置，但可能已过期或无效。请尝试更新Cookie。`;
  }

  /**
   * 处理常见的JS错误并提供详细提示
   * @param {Error} error - 捕获的错误
   * @param {string} context - 错误上下文
   * @returns {string} - 用户友好的错误消息
   */
  handleJSError(error, context) {
    const errorMsg = error.message || "未知错误";
    
    // 处理"Cannot read properties of undefined"类型错误
    if (errorMsg.includes("Cannot read properties of undefined") || 
        errorMsg.includes("Cannot read property") ||
        errorMsg.includes("is undefined")) {
      
      // 通常这类错误与Cookie配置或API响应有关
      const configAdvice = this.checkPixivCookieConfig();
      
      return `${context}出错: ${errorMsg}\n\n此错误通常是由于接口返回的数据异常导致的，最常见的原因是Cookie无效或过期。\n\n${configAdvice}`;
    }
    
    // 处理网络请求错误
    if (errorMsg.includes("fetch") || 
        errorMsg.includes("network") || 
        errorMsg.includes("请求") ||
        errorMsg.includes("axios")) {
      
      return `${context}出错: 网络请求失败\n\n可能原因：
1. 网络连接不稳定
2. Pixiv服务器暂时无法访问
3. 您的Cookie配置可能已过期或无效
4. 可能需要使用代理才能正常访问Pixiv

请检查网络连接和Cookie配置后重试。`;
    }
    
    // 其他类型错误，返回原始错误消息
    return `${context}出错: ${errorMsg}，请稍后再试。`;
  }

  /**
   * 并行下载图片
   * @param {Array} artworks - 作品图片数组
   * @param {string} pid - 作品ID
   * @param {string} cacheDir - 缓存目录路径
   * @param {object} options - 下载选项
   * @returns {Promise<Array>} - 下载完成的图片信息数组
   */
  async downloadImagesParallel(artworks, pid, cacheDir, options = {}) {
    if (!artworks || artworks.length === 0) return [];
    
    // 从配置中读取下载相关设置
    const config = Config.getConfig("parse");
    
    // 配置项 - 不再限制并行数量
    // 默认并行下载数等于图片数量，完全并行
    const maxConcurrent = artworks.length; // 直接使用图片数量，不限制
    const retryCount = options.retryCount || config.download_retry || 2; // 默认重试2次
    const delayBetweenImages = options.delay || config.download_delay || 0; // 默认不延迟
    const maxRetryDelay = options.maxRetryDelay || config.max_retry_delay || 2000; // 最大重试延迟
    
    // 使用全部并行数
    const actualConcurrent = maxConcurrent;
    
    Logger.info(`开始下载图片，共${artworks.length}张，并行数: ${actualConcurrent}, 重试次数: ${retryCount}, 延迟: ${delayBetweenImages}ms`);
    
    // 显示下载进度通知
    if (options.progressCallback) {
      options.progressCallback(`开始下载${artworks.length}张图片，并行数: ${actualConcurrent}`);
    }
    
    // 创建工作队列
    const queue = [];
    for (let i = 0; i < artworks.length; i++) {
      queue.push({
        artwork: artworks[i],
        index: i + 1
      });
    }
    
    const downloadedImages = [];
    const failedImages = [];
    let downloadingCount = 0;
    let completedCount = 0;
    
    // 执行并行下载
    const executeDownloads = async () => {
      while (queue.length > 0 && downloadingCount < actualConcurrent) {
        const task = queue.shift();
        downloadingCount++;
        
        // 执行下载
        this.downloadSingleImage(task.artwork, pid, cacheDir, task.index, retryCount, maxRetryDelay)
          .then(result => {
            if (result) {
              downloadedImages.push(result);
              Logger.info(`图片 ${task.index}/${artworks.length} 下载成功`);
            } else {
              failedImages.push(task.index);
              Logger.warn(`图片 ${task.index}/${artworks.length} 下载失败`);
            }
          })
          .catch(err => {
            failedImages.push(task.index);
            Logger.error(`图片 ${task.index}/${artworks.length} 下载出错`, err);
          })
          .finally(() => {
            downloadingCount--;
            completedCount++;
            
            // 更新进度
            if (options.progressCallback) {
              // 根据图片总数决定通知频率
              const notifyInterval = artworks.length > 20 ? 5 : (artworks.length > 10 ? 3 : 1);
              if (completedCount % notifyInterval === 0 || completedCount === artworks.length) {
                const percent = Math.floor((completedCount / artworks.length) * 100);
                options.progressCallback(`图片下载进度: ${completedCount}/${artworks.length} (${percent}%)`);
              }
            }
            
            // 继续执行队列
            executeDownloads();
          });
        
        // 每个下载立即进行，无需等待
        // await new Promise(resolve => setTimeout(resolve, Math.min(50, delayBetweenImages / 2)));
      }
    };
    
    // 启动下载进程
    const downloadPromises = [];
    for (let i = 0; i < actualConcurrent; i++) {
      downloadPromises.push(executeDownloads());
    }
    
    // 等待所有下载完成
    await Promise.all(downloadPromises);
    
    // 等待所有正在进行的下载完成
    while (downloadingCount > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // 下载完成后整理结果
    Logger.info(`图片下载完成，成功: ${downloadedImages.length}张，失败: ${failedImages.length}张`);
    
    // 按索引排序
    downloadedImages.sort((a, b) => a.index - b.index);
    
    // 显示最终进度
    if (options.progressCallback) {
      if (failedImages.length > 0) {
        options.progressCallback(`图片下载完成，成功: ${downloadedImages.length}张，失败: ${failedImages.length}张`);
      } else {
        options.progressCallback(`全部${downloadedImages.length}张图片下载成功`);
      }
    }
    
    return downloadedImages;
  }
  
  /**
   * 下载单张图片
   * @param {object} artwork - 图片信息
   * @param {string} pid - 作品ID
   * @param {string} cacheDir - 缓存目录
   * @param {number} index - 图片索引
   * @param {number} retryCount - 重试次数
   * @param {number} maxRetryDelay - 最大重试延迟(毫秒)
   * @returns {Promise<object|null>} - 下载结果
   */
  async downloadSingleImage(artwork, pid, cacheDir, index, retryCount = 2, maxRetryDelay = 2000) {
    const originalUrl = artwork.original;
    const fileName = path.basename(originalUrl);
    const localPath = path.join(cacheDir, `${pid}_${fileName}`);
    
    // 检查缓存
    if (fs.existsSync(localPath)) {
      Logger.info(`使用本地缓存: ${localPath}`);
      return {
        path: localPath,
        index: index
      };
    }
    
    // 设置请求头
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Referer': 'https://www.pixiv.net/',
    };
    
    // 重试机制
    let lastError = null;
    for (let attempt = 0; attempt <= retryCount; attempt++) {
      try {
        if (attempt > 0) {
          Logger.info(`第${attempt}次重试下载图片: ${originalUrl}`);
        }
        
        // 下载图片
        const response = await fetch(originalUrl, { headers });
        if (!response.ok) {
          const advice = this.getErrorAdvice(response.status, "图片");
          throw new Error(`下载失败: ${response.status} ${response.statusText}\n${advice}`);
        }
        
        // 使用流保存图片
        try {
          const fileStream = fs.createWriteStream(localPath);
          await pipeline(response.body, fileStream);
          Logger.info(`成功下载图片到: ${localPath}`);
          
          return {
            path: localPath,
            index: index
          };
        } catch (streamError) {
          Logger.error(`流下载失败，尝试替代方法`, streamError);
          
          // 替代方法
          const arrayBuffer = await response.arrayBuffer();
          fs.writeFileSync(localPath, Buffer.from(arrayBuffer));
          Logger.info(`使用替代方法成功下载图片到: ${localPath}`);
          
          return {
            path: localPath,
            index: index
          };
        }
      } catch (error) {
        lastError = error;
        Logger.error(`下载图片失败 (尝试 ${attempt+1}/${retryCount+1}): ${originalUrl}`, error);
        
        // 最后一次重试失败，返回null
        if (attempt === retryCount) {
          return null;
        }
        
        // 重试前等待，指数增长但不超过最大延迟
        const retryDelay = Math.min(500 * Math.pow(1.5, attempt), maxRetryDelay);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
    
    return null;
  }
}
