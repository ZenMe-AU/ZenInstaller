import { Box, Typography } from "@mui/material";
import type { Account, CardChrome, GhEnv } from "../types";
import type { UseAwsConnectionCard } from "../hooks/useAwsConnectionCard";
import type { UseGithubVariables } from "../hooks/useGithubVariables";
import Card from "../components/Card";
import AwsDeployDetail from "./AwsDeployDetail";

type Props = {
  card: CardChrome;
  awsConnection: UseAwsConnectionCard;
  account: Account | null;
  repoName: string;
  repoFullName: string | null;
  selectedEnv: GhEnv | null;
  variables: UseGithubVariables;
};

function Intro() {
  return (
    <Typography sx={{ fontSize: "0.78rem", color: "#475569", lineHeight: 1.7 }}>
      Create an AWS IAM role GitHub Actions can assume through OIDC, then save the role ARN to this GitHub environment
      so the deployment stages can use the same AWS target.
    </Typography>
  );
}

export default function AwsConnectionCard({
  card,
  awsConnection,
  account,
  repoName,
  repoFullName,
  selectedEnv,
  variables,
}: Props) {
  const githubUrl =
    repoFullName && selectedEnv ? `https://github.com/${repoFullName}/settings/environments/${selectedEnv.id}/edit` : undefined;

  return (
    <Card title="AWS connection" lockedIntro={<Intro />} {...card}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Intro />
        <AwsDeployDetail
          {...awsConnection}
          account={account}
          repoName={repoName}
          selectedEnv={selectedEnv}
          disabled={card.locked}
          onComplete={() => undefined}
          variables={variables}
          githubUrl={githubUrl}
        />
      </Box>
    </Card>
  );
}
