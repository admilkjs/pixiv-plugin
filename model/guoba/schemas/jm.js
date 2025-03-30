export default [
    {
        label: 'JM配置',
        component: 'SOFT_GROUP_BEGIN',
    },
    {
        field: 'jm.maxSize',
        label: 'PDF最大大小',
        bottomHelpMessage: '单位：MB',
        component: 'InputNumber',
        componentProps: {
            min: 1,
            max: 500,
            placeholder: '请输入最大文件大小',
        },
    },
    // {
    //     field: 'jm.proxy',
    //     label: '网络代理地址',
    //     bottomHelpMessage: 'http/s代理地址（例如：http://127.0.0.1:7890）',
    //     component: 'Input',
    //     componentProps: {
    //         placeholder: '请输入代理地址',
    //     },
    // },
    {
        field: 'jm.sendAsLink',
        label: '失败转链接发送',
        bottomHelpMessage: '发送失败时转为http链接发送',
        component: 'Switch',
    },
    {
        field: 'jm.time',
        label: '链接有效期',
        bottomHelpMessage: '单位：分钟',
        component: 'InputNumber',
        componentProps: {
            min: 1,
            max: 1440,
            placeholder: '请输入链接有效期',
        },
    },
    {
        field: 'jm.host',
        label: '公网地址/域名',
        bottomHelpMessage: '用于生成文件链接的地址',
        component: 'Input',
        componentProps: {
            placeholder: '请输入公网地址或域名',
        },
    },
    {
        field: 'jm.port',
        label: '端口',
        bottomHelpMessage: '为Miao-Yunzai才生效,可以保持默认值不变',
        component: 'InputNumber',
        componentProps: {
            min: 1,
            max: 65535,
            placeholder: '请输入端口',
        },
    },
    {
        field: 'jm.delete',
        label: '发送后删除文件',
        bottomHelpMessage: '发送PDF后是否删除本地图片文件',
        component: 'Switch',
    },
    {
        field: 'jm.download.image.decode',
        label: '是否解码为原图',
        bottomHelpMessage: '是否解码为原图',
        component: 'Switch',
    },
    {
        field: 'jm.download.threading.image',
        label: '同时下载图片数量',
        bottomHelpMessage: '同时下载图片数量,最大50',
        component: 'InputNumber',
        componentProps: {
            min: 1,
            max: 50,
            placeholder: '请输入同时下载的图片数量',
        },
    },
    {
        field: 'jm.download.threading.photo',
        label: '同时下载章节数',
        bottomHelpMessage: '同时下载的章节数,建议填写为cpu线程数一半或更小',
        component: 'InputNumber',
        componentProps: {
            min: 1,
            max: 100,
            placeholder: '请输入同时下载的章节数',
        },
    },
]
