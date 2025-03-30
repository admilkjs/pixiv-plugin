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