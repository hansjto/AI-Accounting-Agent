import Anthropic from '@anthropic-ai/sdk';
import { tripletexRequest } from './tripletexClient.js';
import { buildSystemPrompt } from './systemPrompt.js';
import type { TripletexCredentials } from '../types.js';

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'tripletex_get',
    description:
      'Perform a GET request against the Tripletex v2 REST API. ' +
      'Use this to list or retrieve resources. ' +
      'List responses: {from, count, values:[...]}. ' +
      'Use fields param to limit response size. ' +
      'Paginate with count and from params.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'API path, e.g. /employee, /customer, /invoice/1234',
        },
        params: {
          type: 'object',
          description: 'Query parameters, e.g. {"fields": "id,firstName", "count": "100"}',
          additionalProperties: true,
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'tripletex_post',
    description: 'Perform a POST request to create a new resource in Tripletex.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'API path, e.g. /employee, /order',
        },
        body: {
          type: 'object',
          description: 'JSON request body',
          additionalProperties: true,
        },
      },
      required: ['path', 'body'],
    },
  },
  {
    name: 'tripletex_put',
    description:
      'Perform a PUT request to update a resource or trigger an action endpoint ' +
      '(e.g. /invoice/{id}/:send, /order/{id}/:invoice, /ledger/voucher/{id}/:reverse).',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'API path, e.g. /employee/42, /invoice/5/:send',
        },
        body: {
          type: 'object',
          description: 'JSON request body (use empty object {} for action endpoints)',
          additionalProperties: true,
        },
        params: {
          type: 'object',
          description: 'Query parameters, e.g. {"sendType": "EMAIL"} for /:send',
          additionalProperties: true,
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'tripletex_delete',
    description: 'Perform a DELETE request to remove a resource from Tripletex.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'API path with ID, e.g. /employee/42',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'tripletex_post_list',
    description:
      'Perform a POST /*/list request to create multiple resources in one call. ' +
      'Always prefer this over multiple individual POSTs when creating more than one resource.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'API path ending in /list, e.g. /order/orderline/list',
        },
        body: {
          type: 'array',
          description: 'Array of objects to create',
          items: { type: 'object', additionalProperties: true },
        },
      },
      required: ['path', 'body'],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool executor
// ---------------------------------------------------------------------------

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  credentials: TripletexCredentials
): Promise<string> {
  const path = input.path as string;

  let result: unknown;

  switch (name) {
    case 'tripletex_get':
      result = await tripletexRequest('GET', credentials, path, input.params as Record<string, unknown> | undefined);
      break;
    case 'tripletex_post':
      result = await tripletexRequest('POST', credentials, path, undefined, input.body);
      break;
    case 'tripletex_put':
      result = await tripletexRequest('PUT', credentials, path, input.params as Record<string, unknown> | undefined, input.body ?? {});
      break;
    case 'tripletex_delete':
      result = await tripletexRequest('DELETE', credentials, path);
      break;
    case 'tripletex_post_list':
      result = await tripletexRequest('POST', credentials, path, undefined, input.body);
      break;
    default:
      result = { error: `Unknown tool: ${name}` };
  }

  return JSON.stringify(result);
}

// ---------------------------------------------------------------------------
// Main agent
// ---------------------------------------------------------------------------

export async function runAgent(
  prompt: string,
  credentials: TripletexCredentials,
  imageAttachments: Array<{ mimeType: string; data: string }> = []
): Promise<void> {
  const content: Anthropic.MessageParam['content'] = [];

  for (const img of imageAttachments) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: img.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
        data: img.data,
      },
    });
  }
  content.push({ type: 'text', text: prompt });

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content }];

  const systemPrompt = buildSystemPrompt(prompt);

  // Agentic loop
  while (true) {
    const response = await claude.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 8192,
      system: systemPrompt,
      tools: TOOLS,
      messages,
    });

    console.log(`[CLAUDE] stop_reason=${response.stop_reason} tool_calls=${response.content.filter(b => b.type === 'tool_use').length}`);

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
    );

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn' || toolUseBlocks.length === 0) break;

    // Execute all tool calls in parallel
    const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
      toolUseBlocks.map(async (block) => {
        console.log(`[TOOL] ${block.name} ${JSON.stringify(block.input)}`);
        const result = await executeTool(block.name, block.input as Record<string, unknown>, credentials);
        console.log(`[TOOL RESULT] ${block.name} → ${result.slice(0, 200)}`);
        return {
          type: 'tool_result' as const,
          tool_use_id: block.id,
          content: result,
        };
      })
    );

    // Abort immediately on auth failure — no point retrying with bad credentials
    const hasAuthFailure = toolResults.some((r) => {
      try {
        const parsed = JSON.parse(r.content as string) as { status_code?: number };
        return parsed.status_code === 401 || parsed.status_code === 403;
      } catch { return false; }
    });
    if (hasAuthFailure) {
      console.log('[AGENT] Auth failure detected — aborting loop');
      break;
    }

    messages.push({ role: 'user', content: toolResults });
  }
}
