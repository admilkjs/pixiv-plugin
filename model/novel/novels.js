import { Request } from '#utils'

export async function novelsDetail (pid) {
  let url = `https://www.pixiv.net/ajax/novel/${pid}?lang=zh`
  try {
    const response = await Request.request({ url })
    if (response.error) throw new Error(response)
    return { title: response.body.title, content: response.body.content }
  } catch (error) {
    logger.error('Error fetching data:', error.message)
  }
}

export async function seriesDetail (pid) {
  let url = `https://www.pixiv.net/ajax/novel/series_content/${pid}?lang=zh`
  try {
    const response = await Request.request({ url })
    if (response.error) throw new Error(response)
    if (!Array.isArray(response.body.thumbnails.novel))
      response.body.thumbnails.novel = [response.body.thumbnails.novel]
    return response.body.thumbnails.novel.map(item => ({
      id: item.id,
      title: item.title,
      seriesTitle: item.seriesTitle
    }))
  } catch (error) {
    logger.error('Error fetching data:', error.message)
  }
}