export function generateRandomString(length = 64) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

  let result = "";

  const randomValues = crypto.getRandomValues(new Uint8Array(length));

  randomValues.forEach((v) => {
    result += chars[v % chars.length];
  });

  return result;
}

async function sha256(plain: string) {
  const encoder = new TextEncoder();

  const data = encoder.encode(plain);

  return crypto.subtle.digest("SHA-256", data);
}

function base64UrlEncode(buffer: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function generateCodeChallenge(verifier: string) {
  const hashed = await sha256(verifier);

  return base64UrlEncode(hashed);
}
