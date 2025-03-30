export default [
    {
        label: '解析功能开关',
        component: 'SOFT_GROUP_BEGIN',
    },
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
    {
        label: '搜索设置',
        component: 'SOFT_GROUP_BEGIN',
    },
    {
        field: 'parse.search_related',
        label: '关联作品搜索',
        bottomHelpMessage: '搜索插画时是否同时搜索相关作品',
        component: 'Switch',
    },
]
