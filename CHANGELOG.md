# Changelog

## [1.7.0](https://github.com/admilkjs/pixiv-plugin/compare/v1.6.0...v1.7.0) (2025-03-30)


### Features

* **config:** 调整代理设置并为 JM 下载器添加代理配置 ([d8a9cfa](https://github.com/admilkjs/pixiv-plugin/commit/d8a9cfa80fa6fae4645dbb98c2f63f2499121846))
* **JM:** jm解析初始化 ([2bfded1](https://github.com/admilkjs/pixiv-plugin/commit/2bfded1b341fe96132d19ee12e45604512d27999))
* **jm:** 优化用户反馈信息 ([97345fd](https://github.com/admilkjs/pixiv-plugin/commit/97345fd032f94121fd3b91802271437401aee8b9))
* **jm:** 添加 http 链接发送功能并设置有效期 ([78511bb](https://github.com/admilkjs/pixiv-plugin/commit/78511bbb22f15ddc916a1cb8cad926163176a0fd))
* **jm:** 添加 PDF 发送失败时转为 HTTP 链接发送的功能 ([446176e](https://github.com/admilkjs/pixiv-plugin/commit/446176eab6e2bd300d83680c13b7dfc29387f27d))
* **jm:** 添加 PDF 生成密码提示 ([f42ae31](https://github.com/admilkjs/pixiv-plugin/commit/f42ae3124ab2cf0b114909c0c88ff3e74cd2fdb5))
* **JM:** 清理IMG ([11c282c](https://github.com/admilkjs/pixiv-plugin/commit/11c282ceb81e0d004e0ea21a201ee45d88157517))
* **model:** 添加漫画下载前的环境检查 ([7e99c48](https://github.com/admilkjs/pixiv-plugin/commit/7e99c48bb018bb88b609b372b8d9e265458e729d))
* **model:** 重构模型层并添加 JM 漫画下载功能 ([f067ad4](https://github.com/admilkjs/pixiv-plugin/commit/f067ad4dc5a47030fdfecb387774674104d000ed))
* **README:** 更新安装方式和功能说明 ([9a59afd](https://github.com/admilkjs/pixiv-plugin/commit/9a59afd560e0923023a05f0f7385d2e52ca95705))


### Bug Fixes

* **apps:** 优化无用 Img 清理逻辑 ([4cba9a6](https://github.com/admilkjs/pixiv-plugin/commit/4cba9a67c8e14405190fe1b0b22c97800b0d9b0f))
* **apps:** 修复 JM 漫画生成和安装相关问题 ([c890403](https://github.com/admilkjs/pixiv-plugin/commit/c890403205bbf5f1eded59638e0d950434851027))
* **JM:** 清理缓存 ([fbcb055](https://github.com/admilkjs/pixiv-plugin/commit/fbcb055b82bbcbc5983110f7047e715888bd96d2))
* **model:** 替换 PDF 加密库并修复相关功能 ([9a59afd](https://github.com/admilkjs/pixiv-plugin/commit/9a59afd560e0923023a05f0f7385d2e52ca95705))
* 导入 ([203c426](https://github.com/admilkjs/pixiv-plugin/commit/203c426f2e60b33ed3fd10fd9c10829d3c4de673))

## [1.6.0](https://github.com/admilkjs/pixiv-plugin/compare/v1.5.0...v1.6.0) (2025-02-28)


### Features

* **artwork_parse:** 添加相关作品搜索功能 ([35fa9a8](https://github.com/admilkjs/pixiv-plugin/commit/35fa9a8525598e8c1bf31f4410567aa8e1ad0adb))
* **artwork:** 添加作品信息解析功能，优化作品详情获取 ([7f9a4b7](https://github.com/admilkjs/pixiv-plugin/commit/7f9a4b7320e20ab8949a694ec003e437b67670e1))
* **dev:** 添加 Pixiv API 端点配置 ([9fe35ad](https://github.com/admilkjs/pixiv-plugin/commit/9fe35ad3203be152c8cb2d975c0c7a7c23c6587c))
* **model:** 添加 Pixiv 小说下载功能 ([f6b2158](https://github.com/admilkjs/pixiv-plugin/commit/f6b2158d9e286d506e828efa918c9485187911a9))
* **model:** 添加请求类以支持代理 ([37b7b71](https://github.com/admilkjs/pixiv-plugin/commit/37b7b71addba0437593d153530687bb3dc29e3ac))
* **model:** 重构模型代码并添加新功能 ([b150d57](https://github.com/admilkjs/pixiv-plugin/commit/b150d57f95df1564ee7e7c9e5d1faed12fc404eb))
* **novel:** 添加代理支持 ([256e659](https://github.com/admilkjs/pixiv-plugin/commit/256e659147b637b911cb7623a8a47766f2d61515))
* **novel:** 添加小说解析功能 ([9406bc9](https://github.com/admilkjs/pixiv-plugin/commit/9406bc95b48c92c1f8bec839b84094f779736046))
* **pixiv:** 添加 artworks 作品解析功能 ([b38fcab](https://github.com/admilkjs/pixiv-plugin/commit/b38fcabfe939fc9f11eb7b27dc73be040e2cbe08))
* **plugin:** 添加用户信息解析功能并优化代码 ([934f5c7](https://github.com/admilkjs/pixiv-plugin/commit/934f5c7a07e5f33672d5fbd8663bda683272410a))


### Bug Fixes

* \n ([0ff0843](https://github.com/admilkjs/pixiv-plugin/commit/0ff08431bf5de4bf25b45fa5aed302b39c4b251b))
* **artwork_parse:** 添加作品解析的链接 ([c691e6e](https://github.com/admilkjs/pixiv-plugin/commit/c691e6eb24ed5b5600c9c6018a222d2aa78259d8))
* **index:** 加载 ([052b407](https://github.com/admilkjs/pixiv-plugin/commit/052b40783b951110fb9e6226699a09cdf5cce248))
* map faltMap ([b732045](https://github.com/admilkjs/pixiv-plugin/commit/b7320451bf290a8c0118dc5aad111249cb2f3264))
* 解析 ([4d7a186](https://github.com/admilkjs/pixiv-plugin/commit/4d7a1868cec4ddb260d89a29f7d72b6c909e4bb1))

## [1.5.0](https://github.com/admilkjs/pixiv-plugin/compare/v1.4.0...v1.5.0) (2025-01-24)


### Features

* **model:** 添加 Pixiv 小说下载功能 ([f6b2158](https://github.com/admilkjs/pixiv-plugin/commit/f6b2158d9e286d506e828efa918c9485187911a9))
* **model:** 添加请求类以支持代理 ([37b7b71](https://github.com/admilkjs/pixiv-plugin/commit/37b7b71addba0437593d153530687bb3dc29e3ac))
* **novel:** 添加代理支持 ([256e659](https://github.com/admilkjs/pixiv-plugin/commit/256e659147b637b911cb7623a8a47766f2d61515))
* **novel:** 添加小说解析功能 ([9406bc9](https://github.com/admilkjs/pixiv-plugin/commit/9406bc95b48c92c1f8bec839b84094f779736046))


### Bug Fixes

* **index:** 加载 ([052b407](https://github.com/admilkjs/pixiv-plugin/commit/052b40783b951110fb9e6226699a09cdf5cce248))
