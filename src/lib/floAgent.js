/**
 * Flo Agentic AI Engine
 * Uses GPT-4o function calling to take real actions inside FloStudio.
 * The agent can create posts, fill calendars, manage the pipeline, and more.
 */

import { supabase } from '../supabase'

const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4a3B2bm9raHFicGJxZWZlZ3hhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMDI1NDgsImV4cCI6MjA5MTc3ODU0OH0.OVdLzh2Bvuf4l6F6ITSpj4pWqoc3EoTxs6OCvrMf4JU'
const AI_URL = 'https://xxkpvnokhqbpbqefegxa.supabase.co/functions/v1/ai-proxy'

// ─── Tool Definitions (sent to GPT-4o) ───────────────────────────────────────
export const FLO_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'create_posts',
      description: 'Create one or more social media posts and save them to the pipeline. Use this when the user asks to create, write, generate, or schedule posts.',
      parameters: {
        type: 'object',
        properties: {
          posts: {
            type: 'array',
            description: 'Array of posts to create',
            items: {
              type: 'object',
              properties: {
                platform: { type: 'string', enum: ['instagram', 'twitter', 'linkedin', 'facebook', 'tiktok'], description: 'Social media platform' },
                content: { type: 'string', description: 'The post text content' },
                scheduled_at: { type: 'string', description: 'ISO 8601 datetime for when to post (optional)' },
                status: { type: 'string', enum: ['pending', 'approved'], description: 'Post status, default pending' },
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
      description: 'Generate and schedule posts to fill the content calendar for a given period. Use when user asks to fill their calendar, plan content for a week/month, or create a posting schedule.',
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
      description: 'Retrieve posts from the pipeline. Use when user asks to see their posts, check what is scheduled, or review pending content.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['pending', 'approved', 'published', 'all'], description: 'Filter by status' },
          platform: { type: 'string', description: 'Filter by platform (optional)' },
          limit: { type: 'number', description: 'Max number of posts to return (default 10)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'approve_posts',
      description: 'Approve one or more pending posts. Use when user asks to approve posts.',
      parameters: {
        type: 'object',
        properties: {
          post_ids: { type: 'array', items: { type: 'string' }, description: 'Array of post IDs to approve. Use "all" as a single item to approve all pending posts.' },
        },
        required: ['post_ids'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_posts',
      description: 'Delete posts from the pipeline.',
      parameters: {
        type: 'object',
        properties: {
          post_ids: { type: 'array', items: { type: 'string' }, description: 'Array of post IDs to delete' },
          status: { type: 'string', enum: ['pending', 'approved', 'published', 'all'], description: 'Delete all posts with this status (alternative to post_ids)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'rewrite_posts',
      description: 'Rewrite existing posts to improve them. Use when user asks to improve, rewrite, or optimize their posts.',
      parameters: {
        type: 'object',
        properties: {
          post_ids: { type: 'array', items: { type: 'string' }, description: 'IDs of posts to rewrite' },
          instruction: { type: 'string', description: 'How to rewrite them (e.g., "make more engaging", "add emojis", "make shorter")' },
        },
        required: ['post_ids', 'instruction'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_analytics',
      description: 'Get analytics and stats about the user\'s content pipeline.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
]

// ─── Tool Executors ───────────────────────────────────────────────────────────

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
    case 'delete_posts':
      return await toolDeletePosts(args, onProgress)
    case 'rewrite_posts':
      return await toolRewritePosts(args, onProgress)
    case 'get_analytics':
      return await toolGetAnalytics()
    default:
      return { error: `Unknown tool: ${toolName}` }
  }
}

async function toolCreatePosts({ posts }, onProgress) {
  onProgress?.(`Creating ${posts.length} post${posts.length > 1 ? 's' : ''}...`)
  const rows = posts.map(p => ({
    platform: p.platform,
    content: p.content,
    scheduled_at: p.scheduled_at || null,
    status: p.status || 'pending',
    created_at: new Date().toISOString(),
  }))
  const { data, error } = await supabase.from('posts').insert(rows).select()
  if (error) return { success: false, error: error.message }
  return { success: true, created: data.length, posts: data.map(p => ({ id: p.id, platform: p.platform, preview: p.content.substring(0, 80) })) }
}

async function toolFillCalendar({ brand_description, platforms, days, posts_per_day = 1, tone = 'professional', topics = [] }, onProgress) {
  onProgress?.(`Planning ${days}-day content calendar for ${platforms.join(', ')}...`)
  const totalPosts = days * posts_per_day * platforms.length
  const startDate = new Date()

  // Generate all post content in one AI call
  const prompt = `You are a social media content expert. Generate ${totalPosts} social media posts for the following:

Brand: ${brand_description}
Platforms: ${platforms.join(', ')}
Tone: ${tone}
Topics to cover: ${topics.length > 0 ? topics.join(', ') : 'general brand content, tips, engagement, value'}
Days: ${days}
Posts per day per platform: ${posts_per_day}

Create a diverse mix of content types: educational tips, questions, behind-the-scenes, promotions, inspirational quotes, user engagement.

Return ONLY a JSON array with this exact structure (no markdown, no explanation):
[
  {"platform":"instagram","content":"post text here","day":1},
  {"platform":"twitter","content":"post text here","day":1},
  ...
]

Make each post platform-appropriate (Instagram: visual/hashtags, Twitter: concise/punchy, LinkedIn: professional/insightful, Facebook: conversational, TikTok: trendy/casual).`

  onProgress?.(`AI is writing ${totalPosts} posts...`)

  const res = await fetch(AI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON}`, apikey: ANON },
    body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: prompt }], max_tokens: 4000 }),
  })
  const aiData = await res.json()
  const raw = aiData?.content || aiData?.choices?.[0]?.message?.content || '[]'

  let generatedPosts = []
  try {
    const match = raw.match(/\[[\s\S]*\]/)
    generatedPosts = match ? JSON.parse(match[0]) : []
  } catch {
    return { success: false, error: 'Failed to parse AI response' }
  }

  onProgress?.(`Saving ${generatedPosts.length} posts to your calendar...`)

  // Map to DB rows with scheduled dates
  const rows = generatedPosts.map((p, i) => {
    const date = new Date(startDate)
    date.setDate(date.getDate() + (p.day - 1 || Math.floor(i / (platforms.length * posts_per_day))))
    // Spread posts through the day (9am, 12pm, 6pm)
    const hours = [9, 12, 18]
    date.setHours(hours[i % hours.length], 0, 0, 0)
    return {
      platform: p.platform,
      content: p.content,
      scheduled_at: date.toISOString(),
      status: 'pending',
      created_at: new Date().toISOString(),
    }
  })

  const { data, error } = await supabase.from('posts').insert(rows).select()
  if (error) return { success: false, error: error.message }

  return {
    success: true,
    created: data.length,
    summary: `Created ${data.length} posts across ${platforms.join(', ')} for the next ${days} days`,
  }
}

async function toolGetPosts({ status = 'all', platform, limit = 10 }) {
  let q = supabase.from('posts').select('*').order('scheduled_at', { ascending: true }).limit(limit)
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
  if (post_ids.includes('all')) {
    onProgress?.('Approving all pending posts...')
    const { data: pending } = await supabase.from('posts').select('id').eq('status', 'pending')
    if (!pending?.length) return { success: true, approved: 0, message: 'No pending posts to approve' }
    const ids = pending.map(p => p.id)
    await supabase.from('posts').update({ status: 'approved' }).in('id', ids)
    return { success: true, approved: ids.length, message: `Approved ${ids.length} posts` }
  }
  onProgress?.(`Approving ${post_ids.length} posts...`)
  await supabase.from('posts').update({ status: 'approved' }).in('id', post_ids)
  return { success: true, approved: post_ids.length }
}

async function toolDeletePosts({ post_ids, status }, onProgress) {
  if (status) {
    onProgress?.(`Deleting all ${status} posts...`)
    let q = supabase.from('posts').delete()
    if (status !== 'all') q = q.eq('status', status)
    const { error } = await q
    if (error) return { success: false, error: error.message }
    return { success: true, message: `Deleted all ${status} posts` }
  }
  onProgress?.(`Deleting ${post_ids.length} posts...`)
  await supabase.from('posts').delete().in('id', post_ids)
  return { success: true, deleted: post_ids.length }
}

async function toolRewritePosts({ post_ids, instruction }, onProgress) {
  onProgress?.(`Fetching ${post_ids.length} posts to rewrite...`)
  const { data: posts } = await supabase.from('posts').select('*').in('id', post_ids)
  if (!posts?.length) return { success: false, error: 'Posts not found' }

  onProgress?.(`AI is rewriting ${posts.length} posts...`)
  const rewrites = []
  for (const post of posts) {
    const res = await fetch(AI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON}`, apikey: ANON },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: `You are a social media expert. Rewrite the post as instructed. Return ONLY the rewritten post text, nothing else.` },
          { role: 'user', content: `Platform: ${post.platform}\nInstruction: ${instruction}\nOriginal: ${post.content}` },
        ],
        max_tokens: 500,
      }),
    })
    const d = await res.json()
    const newContent = d?.content || d?.choices?.[0]?.message?.content || post.content
    await supabase.from('posts').update({ content: newContent.trim() }).eq('id', post.id)
    rewrites.push({ id: post.id, platform: post.platform, preview: newContent.substring(0, 80) })
  }

  return { success: true, rewritten: rewrites.length, posts: rewrites }
}

async function toolGetAnalytics() {
  const { data: all } = await supabase.from('posts').select('platform, status, created_at')
  if (!all) return { success: false, error: 'Could not fetch data' }

  const byStatus = all.reduce((acc, p) => { acc[p.status] = (acc[p.status] || 0) + 1; return acc }, {})
  const byPlatform = all.reduce((acc, p) => { acc[p.platform] = (acc[p.platform] || 0) + 1; return acc }, {})

  return {
    success: true,
    total_posts: all.length,
    by_status: byStatus,
    by_platform: byPlatform,
    top_platform: Object.entries(byPlatform).sort((a, b) => b[1] - a[1])[0]?.[0] || 'none',
  }
}

// ─── Main Agent Runner ────────────────────────────────────────────────────────

/**
 * Run the Flo agent with a user message.
 * @param {Array} conversationHistory - Previous messages
 * @param {string} userMessage - The new user message
 * @param {Function} onProgress - Callback for progress updates (string)
 * @param {Function} onAction - Callback when an action is taken ({tool, result})
 * @returns {Promise<{reply: string, actions: Array}>}
 */
export async function runFloAgent(conversationHistory, userMessage, onProgress, onAction) {
  const messages = [
    {
      role: 'system',
      content: `You are Flo, an expert AI social media agent for FloStudio. You have real tools to take actions inside the app.

IMPORTANT: When users ask you to DO something (create posts, fill calendar, approve posts, etc.), USE YOUR TOOLS to actually do it. Don't just describe what you would do.

Examples:
- "Create 3 Instagram posts about my bakery" → use create_posts tool
- "Fill my calendar for next week" → use fill_calendar tool  
- "Show me my pending posts" → use get_pipeline_posts tool
- "Approve all my posts" → use approve_posts tool
- "Rewrite my posts to be more engaging" → use rewrite_posts then get_pipeline_posts

After using tools, summarize what you did in a friendly, concise way. Use emojis sparingly.
Current date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
    },
    ...conversationHistory,
    { role: 'user', content: userMessage },
  ]

  // First AI call — may return tool calls
  const res = await fetch(AI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON}`, apikey: ANON },
    body: JSON.stringify({ model: 'gpt-4o', messages, tools: FLO_TOOLS, tool_choice: 'auto', max_tokens: 1000 }),
  })
  const data = await res.json()
  const assistantMsg = data?.choices?.[0]?.message || data

  const actions = []

  // Handle tool calls
  if (assistantMsg?.tool_calls?.length > 0) {
    const toolCallResults = []

    for (const toolCall of assistantMsg.tool_calls) {
      const toolName = toolCall.function?.name
      let args = {}
      try { args = JSON.parse(toolCall.function?.arguments || '{}') } catch {}

      onProgress?.(`Using tool: ${toolName.replace(/_/g, ' ')}...`)

      const result = await executeTool(toolName, args, onProgress)
      actions.push({ tool: toolName, args, result })
      onAction?.({ tool: toolName, args, result })

      toolCallResults.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      })
    }

    // Second AI call — summarize what was done
    const followUpMessages = [
      ...messages,
      { role: 'assistant', content: assistantMsg.content || null, tool_calls: assistantMsg.tool_calls },
      ...toolCallResults,
    ]

    const followUpRes = await fetch(AI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON}`, apikey: ANON },
      body: JSON.stringify({ model: 'gpt-4o', messages: followUpMessages, max_tokens: 600 }),
    })
    const followUpData = await followUpRes.json()
    const reply = followUpData?.choices?.[0]?.message?.content || followUpData?.content || 'Done! Check your pipeline.'

    return { reply, actions }
  }

  // No tool calls — just a conversational reply
  const reply = assistantMsg?.content || data?.content || "I'm here to help! What would you like me to do?"
  return { reply, actions: [] }
}
