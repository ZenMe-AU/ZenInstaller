import { useEffect } from "react";

export default function Callback() {
  useEffect(() => {
    async function run() {
      const code = new URLSearchParams(window.location.search).get("code");
      console.log("code", code);
      const verifier = sessionStorage.getItem("pkce_verifier");

      const res = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: import.meta.env.VITE_GITHUB_CLIENT_ID,
          code,
          code_verifier: verifier,
          redirect_uri: `${window.location.origin}`,
        }),
      });
      console.log("res", res);
      const data = await res.json();

      sessionStorage.setItem("access_token", data.access_token);

      window.location.href = "/";
    }

    run();
  }, []);

  return <div>Logging in...</div>;
}
