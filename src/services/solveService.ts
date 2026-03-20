import { runAgent, verifySandboxResult } from './claudeAgent.js';
import { logResult } from './requestLogger.js';
import type { SolveRequestBody } from '../types.js';

export interface SolveResult {
  status: 'completed';
  verified?: boolean;
  summary?: string;
  tool_calls?: number;
  errors?: Array<{ tool: string; status: number }>;
}

export const solveService = {
  async solve(body: SolveRequestBody): Promise<SolveResult> {
    const startTime = Date.now();

    const imageAttachments = (body.files ?? [])
      .filter((f) => f.mime_type.startsWith('image/'))
      .map((f) => ({ mimeType: f.mime_type, data: f.content_base64 }));

    const pdfAttachments = (body.files ?? [])
      .filter((f) => f.mime_type === 'application/pdf')
      .map((f) => ({ filename: f.filename, data: f.content_base64 }));

    const result = await runAgent(
      body.prompt,
      body.tripletex_credentials,
      imageAttachments,
      pdfAttachments,
    );

    const elapsedMs = Date.now() - startTime;

    if (!body.use_sandbox) {
      // Log result in background (don't block response)
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      logResult(`request-${timestamp}.json`, body.prompt, result, undefined, elapsedMs)
        .catch((err) => console.error('[RESULT LOG ERROR]', err));
      return { status: 'completed' };
    }

    const verification = await verifySandboxResult(body.prompt, result);

    // Log result in background (don't block response)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    logResult(`request-${timestamp}.json`, body.prompt, result, verification, elapsedMs)
      .catch((err) => console.error('[RESULT LOG ERROR]', err));

    return {
      status: 'completed',
      verified: verification.verified,
      summary: verification.summary,
      tool_calls: result.toolCallCount,
      errors: result.errors.length > 0 ? result.errors : undefined,
    };
  },
};
