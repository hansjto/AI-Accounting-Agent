import { runAgent, verifySandboxResult } from './claudeAgent.js';
import type { SolveRequestBody, TripletexCredentials } from '../types.js';

export interface SolveResult {
  status: 'completed';
  sandbox?: boolean;
  verified?: boolean;
  summary?: string;
  tool_calls?: number;
  errors?: Array<{ tool: string; status: number }>;
}

export const solveService = {
  async solve(body: SolveRequestBody): Promise<SolveResult> {
    const imageAttachments = (body.files ?? [])
      .filter((f) => f.mime_type.startsWith('image/'))
      .map((f) => ({ mimeType: f.mime_type, data: f.content }));

    // Sandbox mode: override credentials with playground env vars
    const credentials: TripletexCredentials = body.use_sandbox
      ? {
          base_url: process.env.TRIPLETEX_BASE_URL ?? body.tripletex_credentials.base_url,
          session_token: process.env.TRIPLETEX_SESSION_TOKEN ?? body.tripletex_credentials.session_token,
        }
      : body.tripletex_credentials;

    const result = await runAgent(body.prompt, credentials, imageAttachments);

    if (!body.use_sandbox) {
      return { status: 'completed' };
    }

    // Sandbox: verify and return enriched response
    const { verified, summary } = await verifySandboxResult(body.prompt, result);

    return {
      status: 'completed',
      sandbox: true,
      verified,
      summary,
      tool_calls: result.toolCallCount,
      errors: result.errors.length > 0 ? result.errors : undefined,
    };
  },
};
