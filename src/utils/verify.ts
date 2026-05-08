const API = "https://api.github.com";

export async function getGithubUser(token: string) {
  const res = await fetch(`${API}/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error("Unauthorized");
  }

  return res.json();
}

export async function verifyAuth() {
  const token = sessionStorage.getItem("access_token");

  if (!token) {
    throw new Error("Unauthorized");
  }

  return getGithubUser(token);
}
