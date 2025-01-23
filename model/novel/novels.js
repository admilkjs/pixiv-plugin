import Request from '#utils'

export async function novelsDetail (pid) {
  let url = `https://www.pixiv.net/ajax/novel/${pid}?lang=zh`
  try {
    const response = await Request.request({ url })
    logger.debug('GET:', response)
    return response
  } catch (error) {
    logger.error('Error fetching data:', error.message)
  }
}
