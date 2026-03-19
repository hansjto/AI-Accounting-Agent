import { Storage } from '@google-cloud/storage';

const storage = new Storage();
const BUCKET = 'tripletex-solve-requests';

export async function logRequest(body: unknown): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `request-${timestamp}.json`;

  const content = JSON.stringify(body, null, 2);

  // Always log to stdout (visible in Cloud Run logs)
  console.log(`[INCOMING REQUEST] ${filename}`);
  console.log(content);

  // Save to GCS
  try {
    await storage.bucket(BUCKET).file(filename).save(content, {
      contentType: 'application/json',
    });
    console.log(`[SAVED TO GCS] gs://${BUCKET}/${filename}`);
  } catch (err) {
    console.error(`[GCS SAVE FAILED]`, err);
  }

  return filename;
}
