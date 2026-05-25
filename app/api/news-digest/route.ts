import { NextResponse } from 'next/server'
import { sendDigest } from '../digest/sendDigest'

export const maxDuration = 60

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  await sendDigest()
  return NextResponse.json({ ok: true })
}

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url)
  const chatId = searchParams.get('chat_id') ?? undefined
  await sendDigest(chatId)
  return NextResponse.json({ ok: true })
}
