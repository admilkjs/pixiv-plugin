export default [
    {
      label: 'JM配置',
      component: 'SOFT_GROUP_BEGIN'
    },
    {
      field: 'jm.maxSize',
      label: 'PDF最大大小',
      bottomHelpMessage: '单位：MB',
      component: 'InputNumber',
      componentProps: {
        min: 1,
        max: 500,
        placeholder: '请输入最大文件大小'
      }
    },
    {
      field: 'jm.proxy',
      label: '网络代理地址',
      bottomHelpMessage: 'http/s代理地址（例如：http://127.0.0.1:7890）',
      component: 'Input',
      componentProps: {
        placeholder: '请输入代理地址'
      }
    },
    {
      field: 'jm.sendAsLink',
      label: '失败转链接发送',
      bottomHelpMessage: '发送失败时转为http链接发送',
      component: 'Switch'
    },
    {
      field: 'jm.time',
      label: '链接有效期',
      bottomHelpMessage: '单位：分钟',
      component: 'InputNumber',
      componentProps: {
        min: 1,
        max: 1440,
        placeholder: '请输入链接有效期'
      }
    },
    {
      field: 'jm.host',
      label: '公网地址/域名',
      bottomHelpMessage: '用于生成文件链接的地址',
      component: 'Input',
      componentProps: {
        placeholder: '请输入公网地址或域名'
      }
    },
    {
      field: 'jm.delete',
      label: '发送后删除文件',
      bottomHelpMessage: '发送PDF后是否删除本地图片文件',
      component: 'Switch'
    }
  ]