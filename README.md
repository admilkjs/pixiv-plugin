# pixiv-plugin

YunzaiBot-Pixiv 插件

# 插件交流群

[792873018](http://qm.qq.com/cgi-bin/qm/qr?_wv=1027&k=ekuBxRh4wSSP315nn3gcBjWUI0bP3qQ4&authKey=c6orpTMGTM2JmAzGJvRslzhFH803%2Bcbp0%2B28Bpwr5E7oDtFZVO9isRjbugzbh%2FgR&noverify=0&group_code=792873018)

## 安装方式

在 Yunzai 根目录执行以下指令

```
git clone --depth=1 https://github.com/admilkjs/pixiv-plugin.git ./plugins/pixiv-plugin
```

如果网络不好可使用代理加速

```
git clone --depth=1 https://ghfast.top/https://github.com/admilkjs/pixiv-plugin.git ./plugins/pixiv-plugin
```

安装依赖

```
pnpm install --filter=pixiv-plugin
```

## 功能

### pixiv

    - 解析pixiv小说内容
    - 解析pixiv小说系列
    - 解析pixiv插画内容
    - 解析pixiv漫画
    - 解析pixiv系列插画

### JM
    - JM本子(#JM+ID)
    - JM随机本子(#jm随机)
    - 其余功能发送`#jm帮助`查看

### 配置

#### pixiv

打开`config/config/config.yaml`
填写你的 pixiv cookie [获取教程](https://github-wiki-see.page/m/ZayrexDev/ACGPicDownload/wiki/%E8%8E%B7%E5%8F%96Cookie)
如果是国内机器请填写你的代理地址
socket5 或者 http 代理

#### JM

打开`config/config/jm.yaml`
_按照注释填写内容无特殊需求不需要更改_
然后`安装Python`
执行

```bash
pip install pymupdf jmcomic img2pdf -U --break-system-packages
```
如果报错就去掉`--break-system-packages`

如果`Ubuntu`只有python3
那么执行
```bash
ln -s /usr/bin/python3 /usr/bin/python
```

## PDF生成中文问题解决方案

当使用pdf-lib生成包含中文字符的PDF时，可能会遇到以下错误：

```
WinAnsi cannot encode "作" (0x4f5c)
```

这是因为PDF-lib默认使用的标准字体不支持中文字符。解决方案是：

1. 使用fontkit和自定义中文字体：
   - 安装`@pdf-lib/fontkit`
   - 下载中文字体如Source Han Sans
   - 在创建PDF时注册fontkit并嵌入中文字体

2. 智能中文替换：
   - 如果无法加载中文字体，使用英文单词替换常见中文词汇
   - 例如："相关作品" → "Related Works"，"标题" → "Title" 等
   - 对于无法映射的中文字符，替换为下划线而非乱码
   - 自动标记PDF中的字体状态，让用户了解当前显示模式

3. 分级降级处理：
   - 第一级：尝试使用中文字体生成完整PDF
   - 第二级：如果中文字体不可用，使用英文替换生成可读的PDF
   - 第三级：如果PDF生成完全失败，退回到直接发送文本和图片

## 图片处理和格式问题

PDF-lib对图片格式有严格要求，可能会出现以下错误：

```
The input is not a PNG file!
```

解决方案：

1. 使用sharp库进行图片处理（推荐）：
   - 安装`sharp`库 (`npm install sharp --save`)
   - 自动将各种格式的图片转换为PDF兼容的PNG格式
   - 自动调整图片大小以适应PDF页面

2. 备用方案：图片格式检测
   - 自动检测图片是PNG还是JPEG格式
   - 根据不同格式使用正确的嵌入方法
   - 支持直接嵌入PNG和JPEG格式的图片

## 安装步骤

1. 安装依赖：
   ```
   npm install @pdf-lib/fontkit sharp --save
   ```

2. 创建fonts目录并下载中文字体：
   ```
   mkdir -p resources/fonts
   # 下载Source Han Sans字体到resources/fonts目录
   ```

3. 如果中文字体不可用，代码会自动使用标准字体并将中文字符转换为安全文本。

## PDF生成模式

在`config/config/parse.yaml`中，可以设置PDF生成模式：

```yaml
# PDF生成模式
# full - 将所有内容包含在PDF中（包括文字和图片）
# images_only - 只在PDF中包含图片，文字信息通过聊天记录发送
pdf_mode: images_only
```

- `full`模式：所有内容都包含在PDF中（文字和图片）
- `images_only`模式：只在PDF中包含图片，文字信息通过聊天消息发送
  - 适合中文显示有问题的环境
  - 更加灵活，文字可以直接复制

## 错误处理

当出现PDF生成错误时，代码会：
1. 记录详细错误日志
2. 向用户发送具体错误信息
3. 退回到直接发送文本和图片的方式
4. 清理所有临时文件