import { loginWithGithub } from "./utils/auth";

export default function Home() {
  return (
    <div style={{ padding: 20 }}>
      <h1>Home</h1>

      <button onClick={loginWithGithub}>Login with GitHub</button>
    </div>
  );
}
