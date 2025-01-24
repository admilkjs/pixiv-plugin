import crypto from 'crypto'
import { Config } from '#components'

const config = Config.getDefOrConfig('config')

/**
 * 将文本翻译成中文-有道翻译
 * @param {string} query - 需要翻译的文本
 * @param {string} fromLang - 源语言，默认为 'auto'
 * @returns {Promise<string>} - 翻译后的中文文本
 */
export async function youdaoTranslateToChinese (query, fromLang = 'auto') {
  const appKey = config.youdao.appKey
  const appSecret = config.youdao.appSecret

  // 生成签名
  const salt = Date.now().toString()
  const curtime = Math.round(Date.now() / 1000)
  const toLang = 'zh-CHS'

  const truncate = (q) => {
    const len = q.length
    if (len <= 20) return q
    return q.substring(0, 10) + len + q.substring(len - 10, len)
  }

  const input = truncate(query)
  const signStr = appKey + input + salt + curtime + appSecret
  const sign = crypto.createHash('sha256').update(signStr).digest('hex')

  const params = new URLSearchParams({
    q: query,
    from: fromLang,
    to: toLang,
    appKey,
    salt,
    sign,
    signType: 'v3',
    curtime
  })

  try {
    const response = await fetch('https://openapi.youdao.com/api', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    })

    const result = await response.json()
    if (result.errorCode === '0') {
      return result.translation[0]
    } else {
      throw new Error(`翻译失败，错误码：${result.errorCode}`)
    }
  } catch (error) {
    logger.error('翻译请求失败：', error)
    throw error
  }
}
