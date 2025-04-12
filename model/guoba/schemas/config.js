export default [
    {
        label: '代理与Pixiv配置',
        component: 'SOFT_GROUP_BEGIN',
    },
    {
        field: 'config.proxy',
        label: '代理地址',
        bottomHelpMessage: '支持http/socks5协议（示例：http://127.0.0.1:7890）JM代理需在JM.yaml配置',
        component: 'Input',
        componentProps: {
            placeholder: '请输入代理地址',
        },
    },
    {
        field: 'config.refreshToken',
        label: 'Pixiv RefreshToken',
        bottomHelpMessage: '用于Pixiv认证的refresh token',
        component: 'InputPassword',
        componentProps: {
            placeholder: '请输入refreshToken',
            visibilityToggle: false,
        },
    },
    {
        field: 'config.cookie',
        label: 'Pixiv Cookie',
        bottomHelpMessage: '直接填写cookie内容',
        component: 'InputTextArea',
        componentProps: {
            placeholder: '请输入Pixiv Cookie',
            autoSize: { minRows: 2, maxRows: 4 },
        },
    },
    {
        label: '翻译服务配置',
        component: 'SOFT_GROUP_BEGIN',
    },
    {
        field: 'config.translateAPI',
        label: '翻译服务商',
        bottomHelpMessage: '选择使用的翻译API服务',
        component: 'Select',
        componentProps: {
            options: [
                { label: '有道翻译', value: 'youdao' },
                { label: '百度翻译', value: 'baidu' },
                { label: '谷歌翻译', value: 'google' },
            ],
        },
    },
    {
        field: 'config.youdao.appKey',
        label: '有道AppKey',
        bottomHelpMessage: '有道智云API应用凭证',
        component: 'InputPassword',
        componentProps: {
            placeholder: '请输入应用密钥ID',
            visibilityToggle: false,
        },
    },
    {
        field: 'config.youdao.appSecret',
        label: '有道AppSecret',
        bottomHelpMessage: '有道智云API密钥',
        component: 'InputPassword',
        componentProps: {
            placeholder: '请输入应用密钥',
            visibilityToggle: false,
        },
    },
]
