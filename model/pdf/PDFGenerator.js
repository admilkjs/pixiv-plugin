import fs from "fs";
import path from "path";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import sharp from "sharp";
import { Config } from "#components";
import { Logger } from "#utils";
import FileUtils from "../utils/FileUtils.js";

/**
 * PDF生成器类
 */
class PDFGenerator {
  constructor() {
    this.hasFontSupport = false;
    this.config = Config.getConfig("parse");
  }

  /**
   * 生成完整PDF（包含信息和图片）
   */
  async generatePDF(filePath, title, info, images, relatedText) {
    try {
      const pdfDoc = await PDFDocument.create();
      pdfDoc.registerFontkit(fontkit);
      
      this.currentTitle = title;
      
      const font = await this.loadFont(pdfDoc);
      await this.setupMetadata(pdfDoc, title);
      
      await this.createCoverPage(pdfDoc, title, font);
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

  /**
   * 生成仅包含图片的PDF
   */
  async generateImageOnlyPDF(filePath, images) {
    try {
      Logger.info(`开始生成纯图片PDF，共${images.length}张图片`);
      const pdfDoc = await PDFDocument.create();
      
      for (const img of images) {
        try {
          const imgBuffer = await fs.promises.readFile(img.path);
          const metadata = await sharp(imgBuffer).metadata();
          const imgWidth = metadata.width;
          const imgHeight = metadata.height;
          
          const page = pdfDoc.addPage([imgWidth, imgHeight]);
          
          let image;
          if (FileUtils.isPNGImage(imgBuffer)) {
            image = await pdfDoc.embedPng(imgBuffer);
          } else if (FileUtils.isJPEGImage(imgBuffer)) {
            image = await pdfDoc.embedJpg(imgBuffer);
          } else {
            const pngBuffer = await sharp(imgBuffer).toFormat('png').toBuffer();
            image = await pdfDoc.embedPng(pngBuffer);
          }
          
          page.drawImage(image, {
            x: 0,
            y: 0,
            width: imgWidth,
            height: imgHeight,
          });
        } catch (error) {
          Logger.error(`处理图片 ${img.index} 时出错: ${error.message}`, error);
          continue;
        }
      }
      
      const pdfBytes = await pdfDoc.save();
      await fs.promises.writeFile(filePath, pdfBytes);
      
      return filePath;
    } catch (error) {
      Logger.error(`生成图片PDF文件失败: ${error.message}`, error);
      throw error;
    }
  }

  async loadFont(pdfDoc) {
    try {
      const fontPath = this.config?.file?.font_path || './plugins/pixiv-plugin/resources/fonts/SourceHanSansCN-Normal.otf';
      const fullFontPath = path.resolve(process.cwd(), fontPath);
      
      if (await FileUtils.fileExists(fullFontPath)) {
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
    const page = pdfDoc.addPage([595, 842]);
    const { width, height } = page.getSize();
    
    const titleFontSize = 20;
    const maxTitleWidth = width - 100;
    const titleText = this.convertToSafeText(`Pixiv Artwork: ${title}`);
    
    let lines = [];
    let currentLine = '';
    const words = titleText.split(' ');
    
    for (let word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = font.widthOfTextAtSize(testLine, titleFontSize);
      
      if (testWidth <= maxTitleWidth) {
        currentLine = testLine;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);
    
    let titleY = height - 80;
    for (let i = 0; i < lines.length; i++) {
      const lineWidth = font.widthOfTextAtSize(lines[i], titleFontSize);
      page.drawText(lines[i], {
        x: (width - lineWidth) / 2,
        y: titleY - (i * (titleFontSize + 5)),
        size: titleFontSize,
        font,
        color: rgb(0.1, 0.1, 0.3),
      });
    }
    
    const separatorY = titleY - (lines.length * (titleFontSize + 5)) - 20;
    
    page.drawLine({
      start: { x: 50, y: separatorY },
      end: { x: width - 50, y: separatorY },
      thickness: 1,
      color: rgb(0.7, 0.7, 0.7),
    });

    if (!this.hasFontSupport) {
      page.drawText("注意: 中文字体不可用，部分字符可能显示为'_'", {
        x: 50,
        y: separatorY - 20,
        size: 10,
        font,
        color: rgb(0.8, 0.2, 0.2),
      });
    }

    return page;
  }

  async addBasicInfo(pdfDoc, info, font) {
    const page = pdfDoc.getPages()[0];
    const { width, height } = page.getSize();
    const margin = 50;
    const lineHeight = 22;
    const maxLineWidth = width - margin * 2;
    
    const titleText = this.convertToSafeText(`Pixiv Artwork: ${this.currentTitle || ""}`);
    const titleFontSize = 20;
    const maxTitleWidth = width - 100;
    let titleLines = 1;
    let currentLine = '';
    const words = titleText.split(' ');
    
    for (let word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = font.widthOfTextAtSize(testLine, titleFontSize);
      
      if (testWidth <= maxTitleWidth) {
        currentLine = testLine;
      } else {
        titleLines++;
        currentLine = word;
      }
    }
    
    const titleY = height - 80;
    const separatorY = titleY - (titleLines * (titleFontSize + 5)) - 20;
    let y = separatorY - 50;
    
    if (!this.hasFontSupport) y -= 20;

    page.drawRectangle({
      x: margin - 10,
      y: 50,
      width: width - (margin - 10) * 2,
      height: y - 40,
      borderColor: rgb(0.8, 0.8, 0.8),
      borderWidth: 1,
      color: rgb(0.98, 0.98, 0.98),
    });

    if (typeof info !== 'string') {
      Logger.warn(`PDF生成时info参数不是字符串类型: ${typeof info}，尝试转换`);
      if (info === null || info === undefined) {
        info = "无法获取作品信息";
      } else {
        try {
          info = String(info);
        } catch (e) {
          Logger.error("转换info为字符串失败", e);
          info = "无法获取作品信息";
        }
      }
    }

    const infoLines = info.split('\n');
    let basicInfoLines = [];
    let tagInfoLines = [];
    let linkInfoLines = [];
    let isTagSection = false;
    let isLinkSection = false;

    for (const line of infoLines) {
      if (line.startsWith('标签:')) {
        isTagSection = true;
        isLinkSection = false;
      } else if (line.startsWith('链接:')) {
        isTagSection = false;
        isLinkSection = true;
      }
      
      if (isTagSection) {
        tagInfoLines.push(line);
      } else if (isLinkSection) {
        linkInfoLines.push(line);
      } else {
        basicInfoLines.push(line);
      }
    }

    const sectionTitleSize = 12;
    
    page.drawText(this.convertToSafeText('基本信息'), {
      x: margin,
      y: y,
      size: sectionTitleSize,
      font,
      color: rgb(0.2, 0.4, 0.6),
    });
    
    y -= lineHeight + 2;

    for (const line of basicInfoLines) {
      if (!line.trim()) {
        y -= lineHeight / 2;
        continue;
      }
      
      let text = this.convertToSafeText(line);
      const fontSize = 12;
      
      while (text.length > 0) {
        let fitLength = this.getFitLength(text, font, fontSize, maxLineWidth);
        let drawText = text.slice(0, fitLength);
        page.drawText(drawText, {
          x: margin + 10,
          y,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
        });
        text = text.slice(fitLength);
        y -= lineHeight;
      }
    }

    y -= lineHeight;

    if (tagInfoLines.length > 0) {
      page.drawText(this.convertToSafeText('标签信息'), {
        x: margin,
        y,
        size: sectionTitleSize,
        font,
        color: rgb(0.2, 0.4, 0.6),
      });
      
      y -= lineHeight + 2;

      for (const line of tagInfoLines) {
        let text = this.convertToSafeText(line);
        const fontSize = 12;
        
        while (text.length > 0) {
          let fitLength = this.getFitLength(text, font, fontSize, maxLineWidth);
          let drawText = text.slice(0, fitLength);
          page.drawText(drawText, {
            x: margin + 10,
            y,
            size: fontSize,
            font,
            color: rgb(0, 0, 0),
          });
          text = text.slice(fitLength);
          y -= lineHeight;
        }
      }
      
      y -= lineHeight;
    }

    if (linkInfoLines.length > 0) {
      page.drawText(this.convertToSafeText('链接'), {
        x: margin,
        y,
        size: sectionTitleSize,
        font,
        color: rgb(0.2, 0.4, 0.6),
      });
      
      y -= lineHeight + 2;

      for (const line of linkInfoLines) {
        let text = this.convertToSafeText(line);
        const fontSize = 12;
        
        while (text.length > 0) {
          let fitLength = this.getFitLength(text, font, fontSize, maxLineWidth);
          let drawText = text.slice(0, fitLength);
          page.drawText(drawText, {
            x: margin + 10,
            y,
            size: fontSize,
            font,
            color: rgb(0, 0, 0.8),
          });
          text = text.slice(fitLength);
          y -= lineHeight;
        }
      }
    }
    
    const footerY = 30;
    const footerText = this.convertToSafeText(`由 Pixiv-Plugin 生成于 ${new Date().toISOString().split('T')[0]}`);
    page.drawText(footerText, {
      x: (width - font.widthOfTextAtSize(footerText, 10)) / 2,
      y: footerY,
      size: 10,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

  async addImages(pdfDoc, images, font) {
    for (const img of images) {
      try {
        const imgData = await fs.promises.readFile(img.path);
        const metadata = await sharp(imgData).metadata();
        const imgWidth = metadata.width;
        const imgHeight = metadata.height;
        
        const imgPage = pdfDoc.addPage([imgWidth, imgHeight]);
        
        let image;
        if (FileUtils.isPNGImage(imgData)) {
          image = await pdfDoc.embedPng(imgData);
        } else if (FileUtils.isJPEGImage(imgData)) {
          image = await pdfDoc.embedJpg(imgData);
        } else {
          const pngBuffer = await sharp(imgData).toFormat('png').toBuffer();
          image = await pdfDoc.embedPng(pngBuffer);
        }
        
        imgPage.drawImage(image, {
          x: 0,
          y: 0,
          width: imgWidth,
          height: imgHeight,
        });
        
      } catch (error) {
        Logger.error(`处理图片 ${img.index} 时出错: ${error.message}`, error);
        await this.addErrorPage(pdfDoc, img.index, error.message, font);
      }
    }
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
    
    let page = pdfDoc.addPage([595, 842]);
    const { width, height } = page.getSize();
    const margin = 50;
    const lineHeight = 18;
    
    const titleY = height - 80;
    const titleFontSize = 20;
    const titleText = this.convertToSafeText("相关作品信息");
    const titleWidth = font.widthOfTextAtSize(titleText, titleFontSize);
    
    page.drawText(titleText, {
      x: (width - titleWidth) / 2,
      y: titleY,
      size: titleFontSize,
      font,
      color: rgb(0.1, 0.1, 0.3),
    });
    
    const separatorY = titleY - 30;
    page.drawLine({
      start: { x: margin, y: separatorY },
      end: { x: width - margin, y: separatorY },
      thickness: 1,
      color: rgb(0.7, 0.7, 0.7),
    });
    
    const countMatch = relatedText.match(/找到(\d+)个相关作品/);
    const relatedCount = countMatch ? countMatch[1] : "多";
    const countText = this.convertToSafeText(`找到 ${relatedCount} 个相关作品`);
    
    page.drawText(countText, {
      x: margin,
      y: separatorY - 25,
      size: 12,
      font,
      color: rgb(0.3, 0.3, 0.3),
    });
    
    page.drawRectangle({
      x: margin - 10,
      y: 50,
      width: width - (margin - 10) * 2,
      height: separatorY - 70,
      borderColor: rgb(0.8, 0.8, 0.8),
      borderWidth: 1,
      color: rgb(0.98, 0.98, 0.98),
    });
    
    const sections = relatedText.split(/相关作品 \d+\/\d+:/g).slice(1);
    let yPos = separatorY - 60;
    
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i].trim();
      const lines = section.split('\n').filter(line => line.trim());
      
      if (lines.length === 0) continue;
      
      if (i > 0) {
        page.drawLine({
          start: { x: margin + 10, y: yPos + 10 },
          end: { x: width - margin - 10, y: yPos + 10 },
          thickness: 0.5,
          color: rgb(0.8, 0.8, 0.8),
        });
        yPos -= 15;
      }
      
      const orderText = this.convertToSafeText(`相关作品 ${i+1}/${sections.length}`);
      page.drawText(orderText, {
        x: margin,
        y: yPos,
        size: 12,
        font,
        color: rgb(0.2, 0.4, 0.6),
      });
      yPos -= lineHeight + 5;
      
      for (let j = 0; j < lines.length; j++) {
        if (yPos < 70) {
          const newPage = pdfDoc.addPage([595, 842]);
          page = newPage;
          yPos = height - 70;
          
          page.drawRectangle({
            x: margin - 10,
            y: 50,
            width: width - (margin - 10) * 2,
            height: height - 120,
            borderColor: rgb(0.8, 0.8, 0.8),
            borderWidth: 1,
            color: rgb(0.98, 0.98, 0.98),
          });
          
          const continueTitleText = this.convertToSafeText("相关作品信息(续)");
          const continueTitleWidth = font.widthOfTextAtSize(continueTitleText, titleFontSize);
          page.drawText(continueTitleText, {
            x: (width - continueTitleWidth) / 2,
            y: height - 40,
            size: titleFontSize,
            font,
            color: rgb(0.1, 0.1, 0.3),
          });
        }
        
        const line = lines[j];
        let text = this.convertToSafeText(line);
        const fontSize = 12;
        
        let xPos = margin + 10;
        let textColor = rgb(0, 0, 0);
        
        if (line.startsWith('标题:')) {
          textColor = rgb(0.1, 0.1, 0.6);
        } else if (line.startsWith('作者:')) {
          textColor = rgb(0.4, 0.2, 0.6);
        } else if (line.startsWith('标签:')) {
          textColor = rgb(0.4, 0.4, 0.4);
        } else if (line.startsWith('链接:')) {
          textColor = rgb(0, 0, 0.8);
        } else if (line === "") {
          yPos -= lineHeight / 2;
          continue;
        }
        
        while (text.length > 0) {
          const maxLineWidth = width - (xPos + margin);
          let fitLength = this.getFitLength(text, font, fontSize, maxLineWidth);
          let drawText = text.slice(0, fitLength);
          
          page.drawText(drawText, {
            x: xPos,
            y: yPos,
            size: fontSize,
            font,
            color: textColor,
          });
          
          text = text.slice(fitLength);
          yPos -= lineHeight;
          
          if (text.length > 0) {
            xPos = margin + 25;
          }
        }
      }
      
      yPos -= lineHeight / 2;
    }
    
    const remainMatch = relatedText.match(/还有(\d+)个相关作品未显示/);
    if (remainMatch) {
      const remainCount = remainMatch[1];
      const remainText = this.convertToSafeText(`※ 还有 ${remainCount} 个相关作品未显示`);
      
      if (yPos < 70) {
        const newPage = pdfDoc.addPage([595, 842]);
        page = newPage;
        yPos = height - 70;
      }
      
      page.drawText(remainText, {
        x: margin,
        y: yPos,
        size: 11,
        font,
        color: rgb(0.5, 0.5, 0.5),
      });
    }
    
    const footerY = 30;
    const footerText = this.convertToSafeText(`由 Pixiv-Plugin 生成于 ${new Date().toISOString().split('T')[0]}`);
    page.drawText(footerText, {
      x: (width - font.widthOfTextAtSize(footerText, 10)) / 2,
      y: footerY,
      size: 10,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

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

export { PDFGenerator };
export default PDFGenerator;
