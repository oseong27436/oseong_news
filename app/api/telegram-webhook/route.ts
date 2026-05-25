import { NextResponse } from 'next/server'

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN!

async function telegramReply(chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  })
}

export async function POST(req: Request) {
  const body = await req.json()

  if (body.message?.text) {
    const text: string = body.message.text
    const chatId: number = body.message.chat.id

    if (text.startsWith('/뉴스')) {
      await telegramReply(chatId, '📋 뉴스 브리핑 생성 중...')
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://oseong-news.vercel.app'
      await fetch(`${baseUrl}/api/news-digest`, { method: 'POST' })
    } else if (text.startsWith('/start') || text.startsWith('/help')) {
      await telegramReply(chatId, '안녕하세요! 뉴스 브리핑 봇이에요 📋\n\n<b>/뉴스</b> — 지금 바로 뉴스 브리핑 받기')
    }
  }

  return NextResponse.json({ ok: true })
}
