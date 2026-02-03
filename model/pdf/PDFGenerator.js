import fs from "fs";
import path from "path";
import muhammara from "muhammara";
import sharp from "sharp";
import { Config } from "#components";
import { Logger } from "#utils";
import FileUtils from "../utils/FileUtils.js";

const { Recipe } = muhammara;

/**
 * PDF生成器类 - 使用 MuhammaraJS
 */
class PDFGenerator {
  constructor() {
    this.config = Config.getConfig("parse");
  }

  /**
   * 生成加密的纯图片PDF
   * @param {string} filePath - 输出文件路径
   * @param {Array} images - 图片数组 [{path, index}, ...]
   * @param {string} password - 加密密码
   * @returns {Promise<string>} 生成的PDF路径
   */
  async generateEncryptedImagePDF(filePath, images, password) {
    try {
      Logger.info(`开始生成加密图片PDF，共${images.length}张图片`);
      
      const pdfDoc = new Recipe('new', filePath, {
        version: 1.6,
        author: 'Pixiv-Plugin',
        title: 'Pixiv Artwork',
        subject: 'Pixiv Artwork Images'
      });
      
      for (const img of images) {
        try {
          // 获取图片尺寸
          const metadata = await sharp(img.path).metadata();
          const imgWidth = metadata.width;
          const imgHeight = metadata.height;
          
          // 确保图片格式兼容 (muhammara 原生支持 JPG/PNG/TIFF)
          let imagePath = img.path;
          const imgBuffer = await fs.promises.readFile(img.path);
          
          // 如果是 WebP 或其他不支持的格式，转换为 PNG
          if (!FileUtils.isJPEGImage(imgBuffer) && !FileUtils.isPNGImage(imgBuffer)) {
            const pngPath = img.path.replace(/\.[^.]+$/, '.png');
            await sharp(imgBuffer).toFormat('png').toFile(pngPath);
            imagePath = pngPath;
          }
          
          // 创建页面并添加图片
          // Recipe 使用 Left-Top 坐标系统，(0,0) 在左上角
          pdfDoc.createPage(imgWidth, imgHeight)
            .image(imagePath, 0, 0, { width: imgWidth, height: imgHeight })
            .endPage();
            
          // 清理临时转换的文件
          if (imagePath !== img.path && await FileUtils.fileExists(imagePath)) {
            await fs.promises.unlink(imagePath);
          }
        } catch (error) {
          Logger.error(`处理图片 ${img.index} 时出错: ${error.message}`, error);
          // 添加一个空白错误页面
          pdfDoc.createPage(595, 842)
            .text(`Error: Failed to process image ${img.index}`, 50, 50, {
              fontSize: 12,
              color: '#ff0000'
            })
            .endPage();
        }
      }
      
      // 添加加密
      pdfDoc.encrypt({
        userPassword: password,
        ownerPassword: password,
        userProtectionFlag: 4  // 允许打印
      });
      
      pdfDoc.endPDF();
      
      Logger.info(`加密PDF生成成功: ${filePath}`);
      return filePath;
    } catch (error) {
      Logger.error(`生成加密图片PDF失败: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * 生成仅包含图片的PDF（不加密）
   * @param {string} filePath - 输出文件路径
   * @param {Array} images - 图片数组
   * @returns {Promise<string>}
   */
  async generateImageOnlyPDF(filePath, images) {
    try {
      Logger.info(`开始生成纯图片PDF，共${images.length}张图片`);
      
      const pdfDoc = new Recipe('new', filePath, {
        version: 1.6,
        author: 'Pixiv-Plugin',
        title: 'Pixiv Artwork',
        subject: 'Pixiv Artwork Images'
      });
      
      for (const img of images) {
        try {
          const metadata = await sharp(img.path).metadata();
          const imgWidth = metadata.width;
          const imgHeight = metadata.height;
          
          let imagePath = img.path;
          const imgBuffer = await fs.promises.readFile(img.path);
          
          if (!FileUtils.isJPEGImage(imgBuffer) && !FileUtils.isPNGImage(imgBuffer)) {
            const pngPath = img.path.replace(/\.[^.]+$/, '.png');
            await sharp(imgBuffer).toFormat('png').toFile(pngPath);
            imagePath = pngPath;
          }
          
          pdfDoc.createPage(imgWidth, imgHeight)
            .image(imagePath, 0, 0, { width: imgWidth, height: imgHeight })
            .endPage();
            
          if (imagePath !== img.path && await FileUtils.fileExists(imagePath)) {
            await fs.promises.unlink(imagePath);
          }
        } catch (error) {
          Logger.error(`处理图片 ${img.index} 时出错: ${error.message}`, error);
          pdfDoc.createPage(595, 842)
            .text(`Error: Failed to process image ${img.index}`, 50, 50, {
              fontSize: 12,
              color: '#ff0000'
            })
            .endPage();
        }
      }
      
      pdfDoc.endPDF();
      
      Logger.info(`PDF生成成功: ${filePath}`);
      return filePath;
    } catch (error) {
      Logger.error(`生成图片PDF文件失败: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * 生成完整PDF（包含封面信息和图片）并加密
   * @param {string} filePath - 输出文件路径
   * @param {string} title - 作品标题
   * @param {string} info - 作品信息文本
   * @param {Array} images - 图片数组
   * @param {string} relatedText - 相关作品信息
   * @param {string} password - 加密密码 (可选)
   * @returns {Promise<string>}
   */
  async generatePDF(filePath, title, info, images, relatedText, password = null) {
    try {
      Logger.info(`开始生成完整PDF，共${images.length}张图片`);
      
      const fontPath = this.config?.file?.font_path || './plugins/pixiv-plugin/resources/fonts/SourceHanSansCN-Normal.otf';
      const fullFontPath = path.resolve(process.cwd(), fontPath);
      const hasFontSupport = await FileUtils.fileExists(fullFontPath);
      
      const pdfDoc = new Recipe('new', filePath, {
        version: 1.6,
        author: 'Pixiv-Plugin',
        title: `Pixiv Artwork: ${title}`,
        subject: 'Pixiv Artwork Information'
      });
      
      // 封面页
      await this.createCoverPage(pdfDoc, title, info, relatedText, fullFontPath, hasFontSupport);
      
      // 图片页
      await this.addImagePages(pdfDoc, images);
      
      // 相关作品页 (如果有)
      if (relatedText) {
        await this.createRelatedWorksPage(pdfDoc, relatedText, fullFontPath, hasFontSupport);
      }
      
      // 加密 (如果提供了密码)
      if (password) {
        pdfDoc.encrypt({
          userPassword: password,
          ownerPassword: password,
          userProtectionFlag: 4
        });
      }
      
      pdfDoc.endPDF();
      
      Logger.info(`完整PDF生成成功: ${filePath}`);
      return filePath;
    } catch (error) {
      Logger.error("生成完整PDF文件失败", error);
      throw error;
    }
  }

  /**
   * 创建封面页
   */
  async createCoverPage(pdfDoc, title, info, relatedText, fontPath, hasFontSupport) {
    const width = 595;
    const height = 842;
    const margin = 50;
    
    pdfDoc.createPage(width, height);
    
    const fontOptions = hasFontSupport ? { font: fontPath } : {};
    
    // 标题
    const titleText = this.convertToSafeText(`Pixiv Artwork: ${title}`, hasFontSupport);
    pdfDoc.text(titleText, 'center', 60, {
      ...fontOptions,
      fontSize: 18,
      color: '#1a1a4d',
      align: 'center center'
    });
    
    // 分隔线
    pdfDoc.line([[margin, 100], [width - margin, 100]], {
      color: '#b3b3b3',
      width: 1
    });
    
    // 基本信息
    if (info) {
      const safeInfo = this.convertToSafeText(info, hasFontSupport);
      const infoLines = safeInfo.split('\n');
      let yPos = 130;
      
      for (const line of infoLines) {
        if (!line.trim()) {
          yPos += 10;
          continue;
        }
        
        pdfDoc.text(line, margin, yPos, {
          ...fontOptions,
          fontSize: 11,
          color: '#000000'
        });
        yPos += 18;
        
        if (yPos > height - 100) break;
      }
    }
    
    // 页脚
    const footerText = `Generated by Pixiv-Plugin on ${new Date().toISOString().split('T')[0]}`;
    pdfDoc.text(footerText, 'center', height - 30, {
      ...fontOptions,
      fontSize: 9,
      color: '#808080',
      align: 'center center'
    });
    
    pdfDoc.endPage();
  }

  /**
   * 添加图片页面
   */
  async addImagePages(pdfDoc, images) {
    for (const img of images) {
      try {
        const metadata = await sharp(img.path).metadata();
        const imgWidth = metadata.width;
        const imgHeight = metadata.height;
        
        let imagePath = img.path;
        const imgBuffer = await fs.promises.readFile(img.path);
        
        if (!FileUtils.isJPEGImage(imgBuffer) && !FileUtils.isPNGImage(imgBuffer)) {
          const pngPath = img.path.replace(/\.[^.]+$/, '.png');
          await sharp(imgBuffer).toFormat('png').toFile(pngPath);
          imagePath = pngPath;
        }
        
        pdfDoc.createPage(imgWidth, imgHeight)
          .image(imagePath, 0, 0, { width: imgWidth, height: imgHeight })
          .endPage();
          
        if (imagePath !== img.path && await FileUtils.fileExists(imagePath)) {
          await fs.promises.unlink(imagePath);
        }
      } catch (error) {
        Logger.error(`处理图片 ${img.index} 时出错: ${error.message}`, error);
        pdfDoc.createPage(595, 842)
          .text(`Error processing image ${img.index}: ${error.message}`, 50, 50, {
            fontSize: 12,
            color: '#ff0000'
          })
          .endPage();
      }
    }
  }

  /**
   * 创建相关作品页
   */
  async createRelatedWorksPage(pdfDoc, relatedText, fontPath, hasFontSupport) {
    const width = 595;
    const height = 842;
    const margin = 50;
    
    pdfDoc.createPage(width, height);
    
    const fontOptions = hasFontSupport ? { font: fontPath } : {};
    
    const titleText = this.convertToSafeText('Related Works', hasFontSupport);
    pdfDoc.text(titleText, 'center', 60, {
      ...fontOptions,
      fontSize: 18,
      color: '#1a1a4d',
      align: 'center center'
    });
    
    pdfDoc.line([[margin, 100], [width - margin, 100]], {
      color: '#b3b3b3',
      width: 1
    });
    
    const safeRelatedText = this.convertToSafeText(relatedText, hasFontSupport);
    const lines = safeRelatedText.split('\n');
    let yPos = 130;
    
    for (const line of lines) {
      if (!line.trim()) {
        yPos += 8;
        continue;
      }
      
      pdfDoc.text(line.substring(0, 80), margin, yPos, {
        ...fontOptions,
        fontSize: 10,
        color: '#000000'
      });
      yPos += 16;
      
      if (yPos > height - 50) {
        pdfDoc.endPage();
        pdfDoc.createPage(width, height);
        yPos = 50;
      }
    }
    
    pdfDoc.endPage();
  }

  /**
   * 转换文本为安全文本（处理不支持的字符）
   */
  convertToSafeText(text, hasFontSupport = true) {
    if (hasFontSupport) return text;
    
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
      '作品ID': 'Artwork ID',
      '类型': 'Type',
      '图片尺寸': 'Image Size',
      '浏览数': 'Views',
      '点赞数': 'Likes',
      '收藏数': 'Bookmarks',
      '评论数': 'Comments',
      '作者ID': 'Author ID',
      '作者账号': 'Author Account',
      '作者简介': 'Author Bio',
      '作者主页': 'Author Homepage',
      '单图作品': 'Single Image',
      '多图作品': 'Multiple Images'
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

export { PDFGenerator };
export default PDFGenerator;
