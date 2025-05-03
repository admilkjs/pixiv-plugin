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

### Windows环境变量配置

如果你使用Windows系统，需要额外配置以下环境变量:

1. 打开系统环境变量设置
   - 右键"此电脑" -> 属性 -> 高级系统设置 -> 环境变量
   
2. 在"系统变量"中找到 Path 变量并编辑
   - 如果没有以下路径,请添加:
   ```
   C:\Windows\System32
   C:\Program Files\Python311 (根据你的Python版本修改)
   C:\Program Files\Python311\Scripts
   ```

3. 确认Python安装正确
   - 打开命令提示符(CMD)
   - 输入 `python --version` 确认能显示Python版本
   - 输入 `pip --version` 确认能显示pip版本

4. 重启终端和云崽后即可正常使用



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