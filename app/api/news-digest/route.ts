import { NextResponse } from 'next/server'

const OPENAI_KEY = process.env.OPENAI_API_KEY!
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN!
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID!

const FEEDS: { category: string; emoji: string; urls: string[] }[] = [
  {
    category: 'AI/개발',
    emoji: '🤖',
    urls: [
      'https://news.naver.com/main/rss/rss.naver?mid=shm&sid1=105',
      'https://feeds.feedburner.com/TechCrunchAI',
    ],
  },
  {
    category: '주식',
    emoji: '📈',
    urls: [
      'https://news.naver.com/main/rss/rss.naver?mid=shm&sid1=101&sid2=258',
      'https://news.naver.com/main/rss/rss.naver?mid=shm&sid1=101&sid2=259',
    ],
  },
  {
    category: '부동산',
    emoji: '🏠',
    urls: [
      'https://news.naver.com/main/rss/rss.naver?mid=shm&sid1=101&sid2=260',
      'https://news.naver.com/main/rss/rss.naver?mid=shm&sid1=101&sid2=261',
    ],
  },
  {
    category: '정치',
    emoji: '🏛️',
    urls: [
      'https://news.naver.com/main/rss/rss.naver?mid=shm&sid1=100',
    ],
  },
  {
    category: '사회',
    emoji: '📰',
    urls: [
      'https://news.naver.com/main/rss/rss.naver?mid=shm&sid1=102',
    ],
  },
]

interface NewsItem {
  title: string
  desc: string
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

      const title = (titleMatch?.[1] || titleMatch?.[2] || '').trim()
      const desc = (descMatch?.[1] || descMatch?.[2] || '')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim()
        .slice(0, 200)

      if (title && !title.includes('RSS') && title.length > 5) {
        items.push({ title, desc })
      }
    }
    return items.slice(1)
  } catch {
    return []
  }
}

async function pickAndSummarize(category: string, items: NewsItem[]): Promise<{ title: string; desc: string }[]> {
  if (!items.length) return []

  const list = items.slice(0, 20).map((item, i) =>
    `${i + 1}. 제목: ${item.title}\n   내용: ${item.desc || '(본문 없음)'}`
  ).join('\n\n')

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 400,
      messages: [{
        role: 'system',
        content: '너는 친근한 뉴스레터 에디터야. 독자에게 친구처럼 뉴스를 설명해줘. 딱딱하지 않고 자연스러운 말투로.',
      }, {
        role: 'user',
        content: `다음 ${category} 뉴스 목록에서 가장 중요하고 핫한 2개를 골라줘.\n각각 제목(20자 이내)과 친구한테 설명하듯 한 줄 설명(40자 이내)을 써줘.\n\n${list}\n\nJSON 배열로만 답해: [{"title": "제목", "desc": "설명"}, {"title": "제목", "desc": "설명"}]`,
      }],
    }),
  })

  const data = await res.json()
  const text = (data.choices?.[0]?.message?.content ?? '').trim()
  try {
    const parsed = JSON.parse(text.includes('[') ? text.slice(text.indexOf('[')) : text)
    return Array.isArray(parsed) ? parsed.slice(0, 2) : []
  } catch {
    return []
  }
}

async function sendDigest() {
  const sections: string[] = []

  for (const feed of FEEDS) {
    const allItems: NewsItem[] = []
    for (const url of feed.urls) {
      const items = await fetchRSS(url)
      allItems.push(...items)
    }
    const summaries = await pickAndSummarize(feed.category, allItems)
    if (summaries.length) {
      const lines = summaries.map(s => `• ${s.title}\n  └ ${s.desc}`).join('\n\n')
      sections.push(`${feed.emoji} <b>${feed.category}</b>\n${lines}`)
    }
  }

  const now = new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
  const text = `📋 <b>${now} 뉴스 브리핑</b>\n\n${sections.join('\n\n')}`

  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'HTML' }),
  })
}

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  await sendDigest()
  return NextResponse.json({ ok: true })
}

export async function POST() {
  await sendDigest()
  return NextResponse.json({ ok: true })
}
