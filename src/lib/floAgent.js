/**
 * Flo Agentic AI Engine
 * Fully open-ended conversational AI assistant with GPT-4o function calling.
 * Instantly executes workspace actions (creating posts, filling calendar, approving content) on command.
 */

import { supabase } from '../supabase'

const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4a3B2bm9raHFicGJxZWZlZ3hhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMDI1NDgsImV4cCI6MjA5MTc3ODU0OH0.OVdLzh2Bvuf4l6F6ITSpj4pWqoc3EoTxs6OCvrMf4JU'
const AI_URL = 'https://xxkpvnokhqbpbqefegxa.supabase.co/functions/v1/ai-proxy'

export const FLO_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'create_posts',
      description: 'Create social media posts and save them immediately to the campaign pipeline. Use this whenever the user asks to create, write, generate, or schedule posts.',
      parameters: {
        type: 'object',
        properties: {
          posts: {
            type: 'array',
            description: 'Array of posts to create',
            items: {
              type: 'object',
              properties: {
                platform: { type: 'string', enum: ['instagram', 'twitter', 'linkedin', 'facebook', 'tiktok'] },
                content: { type: 'string', description: 'The post text content' },
                scheduled_at: { type: 'string', description: 'ISO 8601 datetime for when to post' },
                status: { type: 'string', enum: ['pending', 'approved'] },
              },
              required: ['platform', 'content'],
            },
          },
        },
        required: ['posts'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fill_calendar',
      description: 'Generate and schedule posts to fill the content calendar. Use when user asks to fill their calendar, plan content for a week/month, or create a posting schedule.',
      parameters: {
        type: 'object',
        properties: {
          brand_description: { type: 'string', description: 'Description of the brand/business' },
          platforms: { type: 'array', items: { type: 'string' }, description: 'Platforms to create content for' },
          days: { type: 'number', description: 'Number of days to fill (e.g., 7 for a week, 30 for a month)' },
          posts_per_day: { type: 'number', description: 'Number of posts per day (default 1)' },
          tone: { type: 'string', description: 'Content tone: professional, casual, humorous, inspirational, educational' },
          topics: { type: 'array', items: { type: 'string' }, description: 'Topics or themes to cover' },
        },
        required: ['brand_description', 'platforms', 'days'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_pipeline_posts',
      description: 'Retrieve posts from the pipeline. Use when user asks to see their posts, check scheduled content, or review pending queue.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['pending', 'approved', 'published', 'all'] },
          platform: { type: 'string' },
          limit: { type: 'number' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'approve_posts',
      description: 'Approve pending posts. Use when user asks to approve posts.',
      parameters: {
        type: 'object',
        properties: {
          post_ids: { type: 'array', items: { type: 'string' }, description: 'Array of post IDs or ["all"] to approve all pending posts.' },
        },
        required: ['post_ids'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_analytics',
      description: 'Get analytics and stats about the user\'s content pipeline and post counts.',
      parameters: { type: 'object', properties: {} },
    },
  },
]

async function executeTool(toolName, args, onProgress) {
  switch (toolName) {
    case 'create_posts':
      return await toolCreatePosts(args, onProgress)
    case 'fill_calendar':
      return await toolFillCalendar(args, onProgress)
    case 'get_pipeline_posts':
      return await toolGetPosts(args)
    case 'approve_posts':
      return await toolApprovePosts(args, onProgress)
    case 'get_analytics':
      return await toolGetAnalytics()
    default:
      return { error: `Unknown tool: ${toolName}` }
  }
}

async function toolCreatePosts({ posts }, onProgress) {
  onProgress?.(`Saving ${posts.length} post${posts.length > 1 ? 's' : ''} to pipeline...`)
  const { data: { user } } = await supabase.auth.getUser()
  const rows = posts.map(p => ({
    user_id: user?.id || null,
    platform: p.platform || 'instagram',
    content: p.content,
    scheduled_at: p.scheduled_at || new Date().toISOString(),
    status: p.status || 'pending',
    created_at: new Date().toISOString(),
  }))
  const { data, error } = await supabase.from('campaign_posts').insert(rows).select()
  if (error) return { success: false, error: error.message }
  return { success: true, created: data.length, posts: data.map(p => ({ id: p.id, platform: p.platform, preview: p.content.substring(0, 80) })) }
}

async function toolFillCalendar({ brand_description, platforms = ['instagram', 'twitter'], days = 7, posts_per_day = 1, tone = 'professional', topics = [] }, onProgress) {
  onProgress?.(`Planning ${days}-day content calendar for ${platforms.join(', ')}...`)
  const totalPosts = days * posts_per_day * platforms.length
  const startDate = new Date()

  const prompt = `You are a social media content expert. Generate exactly ${totalPosts} social media posts for the following:
Brand: ${brand_description}
Platforms: ${platforms.join(', ')}
Tone: ${tone}
Topics: ${topics.length > 0 ? topics.join(', ') : 'tips, engagement, brand value'}
Days: ${days}
Posts per day per platform: ${posts_per_day}

Return ONLY a valid JSON array with this exact structure (no markdown fences, no explanation):
[
  {"platform":"instagram","content":"post text here","day":1},
  {"platform":"twitter","content":"post text here","day":1}
]`

  onProgress?.(`AI is writing ${totalPosts} posts...`)

  const res = await fetch(AI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON}`, apikey: ANON },
    body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: prompt }], max_tokens: 4000 }),
  })
  if (!res.ok) {
    const errText = await res.text()
    return { success: false, error: `AI Proxy error (${res.status}): ${errText}` }
  }
  const aiData = await res.json()
  const raw = aiData?.content || aiData?.choices?.[0]?.message?.content || '[]'

  let generatedPosts = []
  try {
    const cleanRaw = raw.replace(/```json/g, '').replace(/```/g, '').trim()
    const match = cleanRaw.match(/\[[\s\S]*\]/)
    generatedPosts = match ? JSON.parse(match[0]) : JSON.parse(cleanRaw)
  } catch {
    generatedPosts = Array.from({ length: Math.min(totalPosts, 6) }, (_, i) => ({
      platform: platforms[i % platforms.length],
      content: `Check out our latest update for ${brand_description}! #Growth #FloStudio`,
      day: Math.floor(i / platforms.length) + 1
    }))
  }

  onProgress?.(`Saving ${generatedPosts.length} posts to calendar...`)

  const rows = generatedPosts.map((p, i) => {
    const date = new Date(startDate)
    date.setDate(date.getDate() + (Number(p.day) - 1 || Math.floor(i / (platforms.length * posts_per_day))))
    const hours = [9, 13, 17]
    date.setHours(hours[i % hours.length], 0, 0, 0)
    return {
      platform: p.platform || platforms[0],
      content: p.content,
      scheduled_at: date.toISOString(),
      status: 'pending',
      created_at: new Date().toISOString(),
    }
  })

  const { data: { user } } = await supabase.auth.getUser()
  const rowsWithUser = rows.map(r => ({ ...r, user_id: user?.id || null }))
  const { data, error } = await supabase.from('campaign_posts').insert(rowsWithUser).select()
  if (error) return { success: false, error: error.message }

  return {
    success: true,
    created: data.length,
    summary: `Successfully created and scheduled ${data.length} posts across ${platforms.join(', ')} for the next ${days} days!`,
  }
}

async function toolGetPosts({ status = 'all', platform, limit = 10 }) {
  let q = supabase.from('campaign_posts').select('*').order('scheduled_at', { ascending: true }).limit(limit)
  if (status !== 'all') q = q.eq('status', status)
  if (platform) q = q.eq('platform', platform)
  const { data, error } = await q
  if (error) return { success: false, error: error.message }
  return {
    success: true,
    count: data.length,
    posts: data.map(p => ({
      id: p.id,
      platform: p.platform,
      status: p.status,
      scheduled_at: p.scheduled_at,
      preview: p.content.substring(0, 100),
    })),
  }
}

async function toolApprovePosts({ post_ids }, onProgress) {
  if (post_ids?.includes('all') || !post_ids?.length) {
    onProgress?.('Approving all pending posts...')
    const { data: pending } = await supabase.from('campaign_posts').select('id').eq('status', 'pending')
    if (!pending?.length) return { success: true, approved: 0, message: 'No pending posts to approve' }
    const ids = pending.map(p => p.id)
    await supabase.from('campaign_posts').update({ status: 'approved' }).in('id', ids)
    return { success: true, approved: ids.length, message: `Approved ${ids.length} pending posts!` }
  }
  onProgress?.(`Approving ${post_ids.length} posts...`)
  await supabase.from('campaign_posts').update({ status: 'approved' }).in('id', post_ids)
  return { success: true, approved: post_ids.length, message: `Approved ${post_ids.length} posts!` }
}

async function toolGetAnalytics() {
  const { data: all } = await supabase.from('campaign_posts').select('platform, status, created_at')
  if (!all) return { success: false, error: 'Could not fetch pipeline stats' }

  const byStatus = all.reduce((acc, p) => { acc[p.status] = (acc[p.status] || 0) + 1; return acc }, {})
  const byPlatform = all.reduce((acc, p) => { acc[p.platform] = (acc[p.platform] || 0) + 1; return acc }, {})

  return {
    success: true,
    total_posts: all.length,
    by_status: byStatus,
    by_platform: byPlatform,
  }
}

/**
 * Run the Flo agent with full open-ended conversation and forced tool execution on commands.
 */
export async function runFloAgent(conversationHistory, userMessage, onProgress, onAction) {
  const messages = [
    {
      role: 'system',
      content: `You are Flo, an expert AI marketing assistant and copilot for FloStudio. You can answer any questions about social media, growth hacking, copywriting, marketing strategy, SEO, and paid ads. 
      You ALSO have direct tools to execute actions inside the user's FloStudio workspace (creating posts, filling the calendar, approving content, viewing pipeline stats).
      
      CRITICAL RULE: Whenever the user asks you to create, write, generate, schedule, or fill posts/calendar, you MUST call the 'create_posts' or 'fill_calendar' tool immediately in your very first response. DO NOT output drafts or ask the user to confirm with 'create'. Execute the tool right away and save the posts to the database!
      
      Current date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
    },
    ...conversationHistory,
    { role: 'user', content: userMessage },
  ]

  const isCommand = /create|fill|schedule|write|generate|posts|calendar|approve/i.test(userMessage)

  const res = await fetch(AI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON}`, apikey: ANON },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages,
      tools: FLO_TOOLS,
      tool_choice: isCommand ? 'required' : 'auto',
      max_tokens: 1500,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    return { reply: `AI service error (${res.status}): ${errText}`, actions: [] }
  }

  const data = await res.json()
  const assistantMsg = data?.choices?.length ? data.choices[0].message : data

  const actions = []

  if (assistantMsg?.tool_calls?.length > 0) {
    const toolCallResults = []

    for (const toolCall of assistantMsg.tool_calls) {
      const toolName = toolCall.function?.name
      let args = {}
      try { args = JSON.parse(toolCall.function?.arguments || '{}') } catch {}

      if (toolName === 'fill_calendar' && !args.brand_description) {
        args.brand_description = userMessage
        args.platforms = args.platforms || ['instagram', 'linkedin']
        args.days = args.days || 7
      }
      if (toolName === 'create_posts' && (!args.posts || !args.posts.length)) {
        args.posts = [{ platform: 'instagram', content: userMessage, status: 'pending' }]
      }

      onProgress?.(`Executing ${toolName.replace(/_/g, ' ')}...`)

      const result = await executeTool(toolName, args, onProgress)
      actions.push({ tool: toolName, args, result })
      onAction?.({ tool: toolName, args, result })

      toolCallResults.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      })
    }

    const followUpMessages = [
      ...messages,
      { role: 'assistant', content: assistantMsg.content || null, tool_calls: assistantMsg.tool_calls },
      ...toolCallResults,
    ]

    const followUpRes = await fetch(AI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON}`, apikey: ANON },
      body: JSON.stringify({ model: 'gpt-4o', messages: followUpMessages, max_tokens: 800 }),
    })
    const followUpData = await followUpRes.json()
    const reply = followUpData?.choices?.[0]?.message?.content || followUpData?.content || 'Done! I have created and saved your posts to the pipeline.'

    return { reply, actions }
  }

  const reply = assistantMsg?.content || data?.content || 'I am here to help! Ask me anything about marketing or tell me what to automate.'
  return { reply, actions: [] }
}
