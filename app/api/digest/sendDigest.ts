const OPENAI_KEY = process.env.OPENAI_API_KEY!
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN!
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID!

const FEEDS: { category: string; emoji: string; urls: string[] }[] = [
  {
    category: 'AI/개발',
    emoji: '🤖',
    urls: [
      'https://news.google.com/rss/search?q=인공지능+AI+개발&hl=ko&gl=KR&ceid=KR:ko',
    ],
  },
  {
    category: '주식',
    emoji: '📈',
    urls: [
      'https://www.yna.co.kr/rss/economy.xml',
    ],
  },
  {
    category: '부동산',
    emoji: '🏠',
    urls: [
      'https://www.yna.co.kr/rss/industry.xml',
    ],
  },
  {
    category: '정치',
    emoji: '🏛️',
    urls: [
      'https://www.yna.co.kr/rss/politics.xml',
    ],
  },
  {
    category: '사회',
    emoji: '📰',
    urls: [
      'https://www.yna.co.kr/rss/society.xml',
    ],
  },
]

const WEATHER_CODE: Record<number, { emoji: string; label: string }> = {
  0: { emoji: '☀️', label: '맑음' },
  1: { emoji: '🌤️', label: '대체로 맑음' },
  2: { emoji: '⛅', label: '구름 조금' },
  3: { emoji: '☁️', label: '흐림' },
  45: { emoji: '🌫️', label: '안개' },
  48: { emoji: '🌫️', label: '안개' },
  51: { emoji: '🌦️', label: '이슬비' },
  53: { emoji: '🌦️', label: '이슬비' },
  55: { emoji: '🌧️', label: '이슬비 (강함)' },
  61: { emoji: '🌧️', label: '비' },
  63: { emoji: '🌧️', label: '비 (보통)' },
  65: { emoji: '🌧️', label: '비 (강함)' },
  71: { emoji: '🌨️', label: '눈' },
  73: { emoji: '🌨️', label: '눈 (보통)' },
  75: { emoji: '❄️', label: '눈 (강함)' },
  80: { emoji: '🌦️', label: '소나기' },
  81: { emoji: '🌧️', label: '소나기 (보통)' },
  82: { emoji: '⛈️', label: '소나기 (강함)' },
  95: { emoji: '⛈️', label: '뇌우' },
  96: { emoji: '⛈️', label: '뇌우+우박' },
  99: { emoji: '⛈️', label: '뇌우+우박' },
}

interface NewsItem {
  title: string
  desc: string
}

async function fetchWeather(): Promise<string> {
  try {
    const res = await fetch(
      'https://api.open-meteo.com/v1/forecast?latitude=37.5596&longitude=126.9369&current=temperature_2m,precipitation,weathercode&timezone=Asia/Seoul',
      { cache: 'no-store', signal: AbortSignal.timeout(5000) }
    )
    const data = await res.json()
    const temp = Math.round(data.current.temperature_2m)
    const code = data.current.weathercode
    const precip = data.current.precipitation
    const weather = WEATHER_CODE[code] ?? { emoji: '🌡️', label: '확인 불가' }
    const rainMsg = precip > 0 ? ` · 강수 ${precip}mm` : ''
    return `${weather.emoji} <b>오늘 신촌 날씨</b>: ${temp}°C, ${weather.label}${rainMsg}`
  } catch {
    return '🌡️ 날씨 정보를 불러오지 못했어요'
  }
}

async function fetchRSS(url: string): Promise<NewsItem[]> {
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000),
    })
    const xml = await res.text()
    const items: NewsItem[] = []
    const itemRegex = /<item>([\s\S]*?)<\/item>/g
    let itemMatch
    while ((itemMatch = itemRegex.exec(xml)) !== null && items.length < 20) {
      const block = itemMatch[1]
      const titleMatch = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/)
      const descMatch = block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>|<description>([\s\S]*?)<\/description>/)
      const rawTitle = (titleMatch?.[1] || titleMatch?.[2] || '').trim()
      // 구글 뉴스는 "제목 - 언론사" 형식이라 언론사 부분 제거
      const title = rawTitle.replace(/\s*-\s*[^-]+$/, '').trim()
      const desc = (descMatch?.[1] || descMatch?.[2] || '')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .trim().slice(0, 200)
      if (title && !title.includes('RSS') && title.length > 5) items.push({ title, desc })
    }
    return items.slice(1)
  } catch {
    return []
  }
}

async function summarizeAllCategories(
  feeds: { category: string; items: NewsItem[] }[]
): Promise<Record<string, { title: string; desc: string }[]>> {
  const sections = feeds
    .filter(f => f.items.length > 0)
    .map(f => {
      const list = f.items.slice(0, 10).map((item, i) =>
        `${i + 1}. 제목: ${item.title}\n   내용: ${item.desc || '(내용 없음)'}`
      ).join('\n')
      return `[${f.category}]\n${list}`
    }).join('\n\n')

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 1200,
      messages: [
        { role: 'system', content: '너는 친근한 뉴스레터 에디터야. 독자에게 친구처럼 뉴스를 설명해줘. 딱딱하지 않고 자연스러운 말투로.' },
        {
          role: 'user', content:
            `다음 각 카테고리의 뉴스에서 가장 중요하고 핫한 2개씩 골라줘.\n` +
            `각각 제목(20자 이내)과 친구한테 설명하듯 한 줄 설명(40자 이내)을 써줘.\n\n` +
            `${sections}\n\n` +
            `아래 JSON 형식으로만 답해:\n` +
            `{"AI/개발":[{"title":"제목","desc":"설명"},...],"주식":[...],"부동산":[...],"정치":[...],"사회":[...]}`
        },
      ],
    }),
  })
  const data = await res.json()
  const text = (data.choices?.[0]?.message?.content ?? '').trim()
  try {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    const parsed = JSON.parse(text.slice(start, end + 1))
    return parsed
  } catch {
    return {}
  }
}

export async function sendDigest(targetChatId?: string) {
  const chatId = targetChatId ?? TELEGRAM_CHAT_ID

  // RSS 전체 병렬 수집 + 날씨 동시 요청
  const [weather, ...allItems] = await Promise.all([
    fetchWeather(),
    ...FEEDS.map(async (feed) => {
      const items: NewsItem[] = []
      for (const url of feed.urls) {
        items.push(...await fetchRSS(url))
      }
      return { category: feed.category, emoji: feed.emoji, items }
    }),
  ])

  // GPT 한 번만 호출
  const summaryMap = await summarizeAllCategories(allItems as { category: string; items: NewsItem[] }[])

  const sections = (allItems as { category: string; emoji: string; items: NewsItem[] }[])
    .map(feed => {
      const summaries = summaryMap[feed.category]
      if (!summaries?.length) return null
      const lines = summaries.map(s => `• ${s.title}\n  └ ${s.desc}`).join('\n\n')
      return `${feed.emoji} <b>${feed.category}</b>\n${lines}`
    })
    .filter((s): s is string => s !== null)

  const now = new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
  const newsText = `📋 <b>${now} 뉴스 브리핑</b>\n\n${sections.join('\n\n')}`

  const send = (text: string) => fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  })

  await send(weather as string)
  await send(newsText)
}
