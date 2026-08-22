import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const BUCKET = "customer-portal-feedback";
const TURNSTILE_ACTION = "customer_portal_feedback";
const BROWSER_TOKEN_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;
const MAX_REQUEST_BYTES = 16 * 1024;
const encoder = new TextEncoder();

type BeginPayload = {
  action: "begin";
  requestId?: string;
  turnstileToken?: string;
  browserToken?: string;
  category?: string;
  message?: string;
  customerName?: string;
  contactNumber?: string;
  contentTypes?: string[];
};

type FinalizePayload = {
  action: "finalize";
  feedbackId?: string;
  uploadToken?: string;
  imagePaths?: string[];
};

type BrowserTokenPayload = {
  id: string;
  issuedAt: number;
};

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
  origin: string | null,
  allowedOrigins: Set<string>,
) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });

  if (origin && allowedOrigins.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Headers", "content-type, x-client-info, apikey");
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Access-Control-Max-Age", "600");
    headers.set("Vary", "Origin");
  }

  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
}

function requiredEnvironment(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`missing required environment: ${name}`);
  return value;
}

function parseCsvSet(value: string): Set<string> {
  return new Set(value.split(",").map((item) => item.trim()).filter(Boolean));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function textToBase64Url(value: string): string {
  return bytesToBase64Url(encoder.encode(value));
}

function base64UrlToText(value: string): string {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

async function hmacBytes(secret: string, value: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

async function hmacHex(secret: string, value: string): Promise<string> {
  const bytes = await hmacBytes(secret, value);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function signBrowserToken(
  payload: BrowserTokenPayload,
  secret: string,
): Promise<string> {
  const encodedPayload = textToBase64Url(JSON.stringify(payload));
  const signature = bytesToBase64Url(await hmacBytes(secret, `v1.${encodedPayload}`));
  return `v1.${encodedPayload}.${signature}`;
}

async function verifyBrowserToken(
  token: string,
  secret: string,
): Promise<BrowserTokenPayload | null> {
  try {
    const [version, encodedPayload, suppliedSignature, extra] = token.split(".");
    if (version !== "v1" || !encodedPayload || !suppliedSignature || extra) return null;
    const expectedSignature = bytesToBase64Url(
      await hmacBytes(secret, `v1.${encodedPayload}`),
    );
    if (!constantTimeEqual(suppliedSignature, expectedSignature)) return null;

    const parsed = JSON.parse(base64UrlToText(encodedPayload)) as BrowserTokenPayload;
    if (!/^[0-9a-f-]{36}$/u.test(parsed.id) || !Number.isSafeInteger(parsed.issuedAt)) return null;
    const age = Date.now() - parsed.issuedAt;
    if (age < -5 * 60 * 1000 || age > BROWSER_TOKEN_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function normalizedClientIp(req: Request): string {
  const candidate = (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",").at(-1) ??
    "unknown"
  ).trim().toLowerCase();

  if (candidate.length === 0 || candidate.length > 128 || !/^[0-9a-f:.]+$/u.test(candidate)) {
    return "unknown";
  }
  return candidate;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

async function verifyTurnstile(
  token: string,
  clientIp: string,
  requestId: string,
  secret: string,
  allowedHostnames: Set<string>,
): Promise<boolean> {
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      secret,
      response: token,
      remoteip: clientIp === "unknown" ? "" : clientIp,
      idempotency_key: requestId,
    }),
  });

  if (!response.ok) return false;
  const result = await response.json() as {
    success?: boolean;
    hostname?: string;
    action?: string;
  };

  return result.success === true &&
    result.action === TURNSTILE_ACTION &&
    typeof result.hostname === "string" &&
    allowedHostnames.has(result.hostname.toLowerCase());
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  let allowedOrigins = new Set<string>();

  try {
    allowedOrigins = parseCsvSet(requiredEnvironment("CUSTOMER_PORTAL_ALLOWED_ORIGINS"));
  } catch {
    return jsonResponse(503, { error: "feedback ticket service is not configured" }, origin, allowedOrigins);
  }

  if (req.method === "OPTIONS") {
    if (origin && !allowedOrigins.has(origin)) {
      return jsonResponse(403, { error: "origin is not allowed" }, origin, allowedOrigins);
    }
    return jsonResponse(204, {}, origin, allowedOrigins);
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method not allowed" }, origin, allowedOrigins);
  }

  // Origin is defense in depth only. Turnstile and server-side limits remain
  // mandatory even when this check passes, and direct non-browser clients can
  // omit Origin entirely.
  if (origin && !allowedOrigins.has(origin)) {
    return jsonResponse(403, { error: "origin is not allowed" }, origin, allowedOrigins);
  }

  const declaredLength = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return jsonResponse(413, { error: "request is too large" }, origin, allowedOrigins);
  }

  let payload: BeginPayload | FinalizePayload;
  try {
    const rawBody = await req.text();
    if (encoder.encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
      return jsonResponse(413, { error: "request is too large" }, origin, allowedOrigins);
    }
    payload = JSON.parse(rawBody) as BeginPayload | FinalizePayload;
  } catch {
    return jsonResponse(400, { error: "invalid json" }, origin, allowedOrigins);
  }

  let supabaseUrl: string;
  let serviceRoleKey: string;
  try {
    supabaseUrl = requiredEnvironment("SUPABASE_URL");
    serviceRoleKey = requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY");
  } catch {
    return jsonResponse(503, { error: "feedback ticket service is not configured" }, origin, allowedOrigins);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (payload.action === "finalize") {
    const imagePaths = Array.isArray(payload.imagePaths) ? payload.imagePaths : [];
    if (
      !isUuid(payload.feedbackId) ||
      typeof payload.uploadToken !== "string" ||
      payload.uploadToken.length < 32 ||
      payload.uploadToken.length > 200 ||
      imagePaths.length > 5 ||
      imagePaths.some((path) => typeof path !== "string" || path.length > 300)
    ) {
      return jsonResponse(400, { error: "invalid finalize request" }, origin, allowedOrigins);
    }

    const { data, error } = await supabase.rpc("finalize_customer_portal_feedback_v2", {
      p_feedback_id: payload.feedbackId,
      p_upload_token: payload.uploadToken,
      p_image_paths: imagePaths,
    });

    if (error || data !== true) {
      return jsonResponse(400, { error: "feedback could not be finalized" }, origin, allowedOrigins);
    }
    return jsonResponse(200, { ok: true }, origin, allowedOrigins);
  }

  if (payload.action !== "begin") {
    return jsonResponse(400, { error: "unsupported action" }, origin, allowedOrigins);
  }

  const requestId = isUuid(payload.requestId) ? payload.requestId : crypto.randomUUID();
  const contentTypes = Array.isArray(payload.contentTypes) ? payload.contentTypes : [];
  if (
    typeof payload.turnstileToken !== "string" ||
    payload.turnstileToken.length < 10 ||
    payload.turnstileToken.length > 4096 ||
    typeof payload.category !== "string" ||
    typeof payload.message !== "string" ||
    contentTypes.length > 5 ||
    contentTypes.some((type) => !["image/jpeg", "image/png", "image/webp"].includes(type))
  ) {
    return jsonResponse(400, { error: "invalid feedback ticket request" }, origin, allowedOrigins);
  }

  let turnstileSecret: string;
  let browserTokenSecret: string;
  let rateLimitPepper: string;
  let allowedHostnames: Set<string>;
  try {
    turnstileSecret = requiredEnvironment("CLOUDFLARE_TURNSTILE_SECRET");
    browserTokenSecret = requiredEnvironment("CUSTOMER_PORTAL_BROWSER_TOKEN_SECRET");
    rateLimitPepper = requiredEnvironment("CUSTOMER_PORTAL_RATE_LIMIT_PEPPER");
    allowedHostnames = parseCsvSet(requiredEnvironment("CUSTOMER_PORTAL_TURNSTILE_HOSTNAMES"));
  } catch {
    return jsonResponse(503, { error: "feedback ticket service is not configured" }, origin, allowedOrigins);
  }

  const clientIp = normalizedClientIp(req);
  const turnstileOk = await verifyTurnstile(
    payload.turnstileToken,
    clientIp,
    requestId,
    turnstileSecret,
    allowedHostnames,
  ).catch(() => false);

  if (!turnstileOk) {
    return jsonResponse(403, { error: "turnstile verification failed" }, origin, allowedOrigins);
  }

  let browserIdentity: BrowserTokenPayload | null = null;
  if (typeof payload.browserToken === "string" && payload.browserToken.length <= 1024) {
    browserIdentity = await verifyBrowserToken(payload.browserToken, browserTokenSecret);
    if (!browserIdentity) {
      return jsonResponse(400, { error: "invalid browser correlation token" }, origin, allowedOrigins);
    }
  }

  browserIdentity ??= { id: crypto.randomUUID(), issuedAt: Date.now() };
  const browserToken = await signBrowserToken(browserIdentity, browserTokenSecret);
  const browserHash = await hmacHex(rateLimitPepper, `browser:${browserIdentity.id}`);
  const ipHash = await hmacHex(rateLimitPepper, `ip:${clientIp}`);

  const { data: rpcRows, error: rpcError } = await supabase.rpc(
    "begin_customer_portal_feedback_v2",
    {
      p_request_id: requestId,
      p_browser_hash: browserHash,
      p_ip_hash: ipHash,
      p_turnstile_verified: true,
      p_category: payload.category,
      p_message: payload.message,
      p_customer_name: typeof payload.customerName === "string" ? payload.customerName : "",
      p_contact_number: typeof payload.contactNumber === "string" ? payload.contactNumber : "",
      p_content_types: contentTypes,
    },
  );

  const ticket = Array.isArray(rpcRows) ? rpcRows[0] : null;
  if (rpcError || !ticket) {
    console.error(JSON.stringify({ requestId, stage: "begin_rpc", failed: true }));
    return jsonResponse(500, { error: "feedback ticket could not be created" }, origin, allowedOrigins);
  }

  if (ticket.allowed !== true) {
    return jsonResponse(429, { error: "rate limit exceeded", browserToken }, origin, allowedOrigins);
  }

  const uploads: Array<Record<string, string>> = [];
  for (const path of ticket.object_paths ?? []) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data?.signedUrl || !data?.token) {
      console.error(JSON.stringify({ requestId, stage: "signed_upload", failed: true }));
      return jsonResponse(500, { error: "signed upload urls could not be created" }, origin, allowedOrigins);
    }
    uploads.push({ path, signedUrl: data.signedUrl, token: data.token });
  }

  console.log(JSON.stringify({
    requestId,
    action: "begin",
    uploadSlotCount: uploads.length,
    wouldBlockRules: ticket.would_block_rules ?? [],
  }));

  return jsonResponse(200, {
    feedbackId: ticket.feedback_id,
    uploadToken: ticket.upload_token,
    browserToken,
    uploads,
  }, origin, allowedOrigins);
});
