export default [
    // 基础功能
    { label: '基础功能', component: 'SOFT_GROUP_BEGIN' },
    {
        field: 'parse.artworks_parse',
        label: '漫画解析功能',
        bottomHelpMessage: '是否启用漫画作品解析功能',
        component: 'Switch',
    },
    {
        field: 'parse.novels_parse',
        label: '小说解析功能',
        bottomHelpMessage: '是否启用小说作品解析功能',
        component: 'Switch',
    },
    {
        field: 'parse.users_parse',
        label: '用户信息解析',
        bottomHelpMessage: '是否启用用户信息解析功能',
        component: 'Switch',
    },
    { component: 'SOFT_GROUP_END' },

    // 高级设置（所有新加配置都放这里）
    { label: '高级设置', component: 'SOFT_GROUP_BEGIN' },

    // 搜索
    {
        field: 'parse.search_related',
        label: '关联作品搜索',
        bottomHelpMessage: '搜索插画时是否同时搜索相关作品',
        component: 'Switch',
    },

    // PDF
    {
        field: 'parse.pdf_mode',
        label: 'PDF生成模式',
        component: 'Select',
        options: [
            { label: '仅图片(images_only)', value: 'images_only' },
            { label: '完整信息(full)', value: 'full' }
        ],
        bottomHelpMessage: 'PDF生成时包含内容类型'
    },

    // 下载
    {
        field: 'parse.download.retry_count',
        label: '下载重试次数',
        component: 'InputNumber',
        min: 0,
        max: 10,
    },
    {
        field: 'parse.download.retry_delay',
        label: '下载重试延迟(毫秒)',
        component: 'InputNumber',
        min: 0,
        max: 10000,
    },
    {
        field: 'parse.download.max_retry_delay',
        label: '最大重试延迟(毫秒)',
        component: 'InputNumber',
        min: 0,
        max: 10000,
    },
    {
        field: 'parse.download.concurrent',
        label: '并发下载数量',
        component: 'InputNumber',
        min: 1,
        max: 20,
    },

    // 消息
    {
        field: 'parse.message.max_length',
        label: '最大消息长度',
        component: 'InputNumber',
        min: 500,
        max: 10000,
    },
    {
        field: 'parse.message.max_line_length',
        label: '最大行长度',
        component: 'InputNumber',
        min: 100,
        max: 5000,
    },
    {
        field: 'parse.message.delay',
        label: '消息间延迟(毫秒)',
        component: 'InputNumber',
        min: 0,
        max: 5000,
    },

    // 内容限制
    {
        field: 'parse.limits.max_title_length',
        label: '标题最大长度',
        component: 'InputNumber',
        min: 10,
        max: 100,
    },
    {
        field: 'parse.limits.max_tags_count',
        label: '标签最大数量',
        component: 'InputNumber',
        min: 5,
        max: 30,
    },
    {
        field: 'parse.limits.max_related_works',
        label: '相关作品最大数量',
        component: 'InputNumber',
        min: 5,
        max: 30,
    },

    // 文件
    {
        field: 'parse.file.max_image_size',
        label: '最大图片大小(字节)',
        component: 'InputNumber',
        min: 1048576,
        max: 104857600,
    },
    {
        field: 'parse.file.cache_dir',
        label: '缓存目录',
        component: 'Input',
    },
    {
        field: 'parse.file.font_path',
        label: '字体文件路径',
        component: 'Input',
    },

    { component: 'SOFT_GROUP_END' },
]
