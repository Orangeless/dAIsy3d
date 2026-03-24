import OpenAI from 'openai'

const VISION_MODEL = process.env.VISION_MODEL || 'openai/gpt-4o-mini'

export async function describeScreen(imageDataUrl: string, apiKey?: string): Promise<string> {
  const key = apiKey || process.env.OPENROUTER_API_KEY
  if (!key) return ''

  try {
    const ai = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: key,
      defaultHeaders: {
        'HTTP-Referer': 'https://klaira.app',
        'X-Title': 'Klaira Desktop Companion'
      }
    })

    const completion = await ai.chat.completions.create({
      model: VISION_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: imageDataUrl } },
            {
              type: 'text',
              text: 'Describe what is visible on this screen. Focus on: the application open, main content (code, documents, web pages, error messages, any visible text), and what the user appears to be working on. Be specific and concise. If there is code, describe the language and what it does. If there is an error, quote it exactly.'
            }
          ]
        }
      ],
      max_tokens: 400,
      temperature: 0.1
    })

    const description = completion.choices[0]?.message?.content?.trim() ?? ''
    if (description) console.log('[screenVision]', description.slice(0, 120) + '...')
    return description
  } catch (err: any) {
    console.warn('[screenVision] Failed:', err?.message ?? err)
    return ''
  }
}
