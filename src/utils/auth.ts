import { generateRandomString, generateCodeChallenge } from "./pkce";

const CLIENT_ID = "Ov23lizON4etUmAaTHRY";
// const CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID;

const REDIRECT_URI = `${window.location.origin}/callback`;

export async function loginWithGithub() {
  const verifier = generateRandomString();

  sessionStorage.setItem("pkce_verifier", verifier);

  const challenge = await generateCodeChallenge(verifier);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: "read:user user:email",
    response_type: "code",
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  window.location.href = `https://github.com/login/oauth/authorize?${params}`;
}
