import { app } from "@azure/functions";
import { getTableClient } from "../utils/tableStorage.js";
import { getAllowedOrigin } from "../utils/cors.js";
import jwt from "jsonwebtoken";
import { corsWrapper } from "../utils/cors.js";
import { MissingParam } from "../error/index.js";

app.http("getAccessToken", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: corsWrapper(async (request, context) => {
    const body = await request.json();
    const { code, code_verifier } = body;

    if (!code || !code_verifier) {
      throw MissingParam();
    }

    // exchange code for access token
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: process.env.OAUTH_CLIENT_ID,
        code,
        code_verifier: code_verifier,
      }),
    });

    const data = await tokenRes.json();
    return {
      jsonBody: data,
    };
  }),
});
