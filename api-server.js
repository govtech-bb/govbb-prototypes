/**
 * GovBB AI Prototype Generator — API Server
 * Node.js HTTP server on port 3001.
 *
 * Endpoints:
 *   GET  /api/pdf-list       → JSON list of all PDF files
 *   POST /api/generate       → SSE stream: reads PDF + CLAUDE.md, calls Claude, saves prototype
 *   GET  /api/health         → {"ok": true}
 *
 * Usage:
 *   npm install
 *   ANTHROPIC_API_KEY=sk-... node api-server.js
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3001;
const PDF_ROOT = path.join(__dirname, 'pdf forms');
const PROTOTYPES_DIR = path.join(__dirname, 'prototypes');
const CLAUDE_MD = path.join(__dirname, 'CLAUDE.md');

// Pick a short reference prototype to show Claude what the output format looks like
const REFERENCE_PROTOTYPE = path.join(__dirname, 'prototypes', 'nisss-dp10.html');

const client = new Anthropic();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res, data, status = 200) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

/** Recursively list all .pdf files under a directory */
function listPdfs(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listPdfs(full));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
      results.push(full);
    }
  }
  return results;
}

/** Convert a PDF path to a relative label like "NISSS PDF forms / DP-10-Form.pdf" */
function pdfLabel(fullPath) {
  return path.relative(PDF_ROOT, fullPath);
}

/** Convert a form name to a safe kebab-case filename */
function toSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 80);
}

// ─── /api/pdf-list ────────────────────────────────────────────────────────────

function handlePdfList(res) {
  const pdfs = listPdfs(PDF_ROOT);
  const list = pdfs.map(p => ({
    label: pdfLabel(p),
    path: path.relative(__dirname, p).replace(/\\/g, '/'),
  }));
  json(res, list);
}

// ─── /api/generate ────────────────────────────────────────────────────────────

async function handleGenerate(req, res) {
  let body;
  try {
    body = await readBody(req);
  } catch {
    return json(res, { error: 'Invalid request body' }, 400);
  }

  const { pdfPath, formName, outputFile, editSlug, feedback } = body;
  if (!formName) return json(res, { error: 'formName is required' }, 400);

  // In edit mode pdfPath is empty — skip PDF validation
  let absPath = '';
  if (pdfPath) {
    absPath = path.resolve(__dirname, pdfPath);
    if (!absPath.startsWith(__dirname)) return json(res, { error: 'Invalid path' }, 400);
    if (!fs.existsSync(absPath)) return json(res, { error: 'PDF not found: ' + pdfPath }, 404);
  } else if (!editSlug) {
    return json(res, { error: 'pdfPath or editSlug is required' }, 400);
  }

  // Set up SSE
  cors(res);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  function send(event, data) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  try {
    // Build output filename
    const slug = outputFile
      ? outputFile.replace(/\.html$/, '')
      : (editSlug || toSlug(formName));
    const filename = slug + '.html';
    const outputPath = path.join(PROTOTYPES_DIR, filename);

    // 1. Read CLAUDE.md
    send('status', { message: 'Loading design system instructions…' });
    const claudeMd = fs.readFileSync(CLAUDE_MD, 'utf8');

    let messages;
    const systemPrompt = `You are a GovTech Barbados prototype builder. Your task is to produce a single, complete, self-contained HTML prototype file for a government form.

Follow the design system and coding rules in CLAUDE.md exactly. Do not deviate from the specified structure, component patterns, colour tokens, or technical requirements.

Output ONLY the raw HTML — no markdown fences, no explanation, no commentary before or after the HTML. The output must start with <!DOCTYPE html> and end with </html>.`;

    if (editSlug && feedback) {
      // ── EDIT MODE: read existing prototype, apply changes ──
      const existingPath = path.join(PROTOTYPES_DIR, editSlug + '.html');
      if (!fs.existsSync(existingPath)) {
        send('error', { message: `Prototype not found: prototypes/${editSlug}.html` });
        res.end(); return;
      }
      send('status', { message: 'Reading existing prototype…' });
      const existingHtml = fs.readFileSync(existingPath, 'utf8');

      const userPrompt = `Here are your design system instructions (CLAUDE.md):

<claude_md>
${claudeMd}
</claude_md>

Here is the existing prototype HTML for "${formName}" (prototypes/${filename}):

<existing_prototype>
${existingHtml}
</existing_prototype>

The user wants the following changes made to this prototype:

<requested_changes>
${feedback}
</requested_changes>

Apply those changes to the prototype. Return the complete updated HTML file. Do not summarise what you changed — output only the full HTML.`;

      messages = [{ role: 'user', content: userPrompt }];
      send('status', { message: 'Calling Claude API — applying changes…' });

    } else {
      // ── GENERATE MODE: read PDF, build from scratch ──
      send('status', { message: 'Reading PDF…' });
      const pdfBase64 = fs.readFileSync(absPath).toString('base64');

      // Reference prototype for structure guidance
      let refProto = '';
      if (fs.existsSync(REFERENCE_PROTOTYPE)) {
        const raw = fs.readFileSync(REFERENCE_PROTOTYPE, 'utf8');
        refProto = raw.length > 6000 ? raw.substring(0, 6000) + '\n...[truncated for brevity]' : raw;
      }

      const userPrompt = `Here are your instructions (CLAUDE.md):

<claude_md>
${claudeMd}
</claude_md>

${refProto ? `Here is an existing prototype to use as a structural reference (follow the same pattern):

<reference_prototype>
${refProto}
</reference_prototype>

` : ''}The form name is: "${formName}"
The output filename will be: prototypes/${filename}

Now read the PDF form below and generate a complete HTML prototype that digitises it.`;

      messages = [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
            },
            { type: 'text', text: userPrompt },
          ],
        },
      ];
      send('status', { message: 'Calling Claude API — generating prototype…' });
    }

    // 5. Stream from Claude
    let generated = '';

    const stream = client.messages.stream({
      model: 'claude-opus-4-6',
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      system: systemPrompt,
      messages,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          generated += event.delta.text;
          send('chunk', { text: event.delta.text });
        }
        // Skip thinking blocks in the stream output
      }
    }

    // 6. Clean up output — strip any accidental markdown fences
    let html = generated.trim();
    if (html.startsWith('```')) {
      html = html.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim();
    }

    // 7. Save to file
    send('status', { message: `Saving prototype to prototypes/${filename}…` });
    fs.writeFileSync(outputPath, html, 'utf8');

    send('done', {
      filename: filename,
      path: `prototypes/${filename}`,
      url: `/prototypes/${filename}`,
    });

  } catch (err) {
    console.error('Generation error:', err);
    send('error', { message: err.message || 'Generation failed' });
  }

  res.end();
}

// ─── Router ──────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (url.pathname === '/api/health' && req.method === 'GET') {
    return json(res, { ok: true });
  }

  if (url.pathname === '/api/pdf-list' && req.method === 'GET') {
    return handlePdfList(res);
  }

  if (url.pathname === '/api/generate' && req.method === 'POST') {
    return handleGenerate(req, res);
  }

  json(res, { error: 'Not found' }, 404);
});

server.listen(PORT, () => {
  console.log(`GovBB API server running on http://localhost:${PORT}`);
  console.log(`  GET  /api/health`);
  console.log(`  GET  /api/pdf-list`);
  console.log(`  POST /api/generate`);
  console.log('');
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('⚠  ANTHROPIC_API_KEY is not set. Generation will fail.');
  }
});
