import { NextResponse } from 'next/server'
import { sendDigest } from '../digest/sendDigest'

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  await sendDigest()
  return NextResponse.json({ ok: true })
}

export async function POST(req: Request) {
  let chatId: string | undefined
  try {
    const { searchParams } = new URL(req.url, 'https://oseongnews.vercel.app')
    chatId = searchParams.get('chat_id') ?? undefined
  } catch {}
  await sendDigest(chatId)
  return NextResponse.json({ ok: true })
}
