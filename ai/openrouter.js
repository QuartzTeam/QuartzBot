const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

const MAX_RETRIES = 2;
const MAX_RETRY_WAIT_S = 20;

// Client for the OpenRouter chat-completions API. Messages use the
// OpenAI-style shape: { role, content, name? } — `name` carries the speaker's
// display name through the payload.
//
// `model` may be a comma-separated list; the first entry is the primary and
// the rest are fallbacks OpenRouter routes to when the primary is down or
// rate-limited. Free models share upstream capacity and 429 regularly, so
// 429/5xx responses are retried honoring Retry-After.
class OpenRouterClient {
    constructor(apiKey, model) {
        this.apiKey = apiKey;
        this.models = String(model).split(",").map(s => s.trim()).filter(Boolean);
    }

    async chat(messages) {
        for (let attempt = 0; ; attempt++) {
            try {
                return await this.#send(messages);
            } catch (err) {
                const retriable = err.status === 429 || (err.status >= 500 && err.status < 600);
                if (!retriable || attempt >= MAX_RETRIES) throw err;
                const waitS = Math.min(err.retryAfter ?? 5, MAX_RETRY_WAIT_S);
                console.warn(`openrouter ${err.status}, retrying in ${waitS}s (attempt ${attempt + 1}/${MAX_RETRIES})`);
                await new Promise(resolve => setTimeout(resolve, waitS * 1000));
            }
        }
    }

    async #send(messages) {
        const payload = { messages, temperature: 0.8 };
        if (this.models.length > 1) {
            payload.models = this.models;
        } else {
            payload.model = this.models[0];
        }

        const res = await fetch(ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.apiKey}`,
                // Optional attribution headers OpenRouter recommends.
                "HTTP-Referer": "https://github.com/PrismMods/PrismBot",
                "X-Title": "PrismAI",
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(120_000),
        });

        const body = await res.text();
        if (!res.ok) {
            const err = new Error(`openrouter status ${res.status}: ${body}`);
            err.status = res.status;
            err.retryAfter = parseRetryAfter(res, body);
            throw err;
        }

        const out = JSON.parse(body);
        if (out.error) {
            const err = new Error(`openrouter error: ${out.error.message}`);
            err.status = out.error.code;
            throw err;
        }
        if (!out.choices?.length) {
            throw new Error("openrouter returned no choices");
        }
        return out.choices[0].message.content;
    }
}

// Retry-After can arrive as a response header or inside the error metadata
// (OpenRouter forwards the upstream provider's retry_after_seconds).
function parseRetryAfter(res, body) {
    const header = Number(res.headers.get("retry-after"));
    if (Number.isFinite(header) && header > 0) return header;
    try {
        const seconds = Number(JSON.parse(body)?.error?.metadata?.retry_after_seconds);
        if (Number.isFinite(seconds) && seconds > 0) return seconds;
    } catch {
        // body wasn't JSON; fall through
    }
    return undefined;
}

module.exports = { OpenRouterClient };
