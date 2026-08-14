# Overview of ZenInstaller for GitHub marketplace

ZenInstaller is a guided deployment assistant that helps teams stand up a Zenblox-ready GitHub repository and configure the required delivery workflow across Azure and AWS.

It combines repository provisioning, environment setup, and deployment orchestration into one workflow so platform and application teams can move from initial setup to deployable state with fewer manual GitHub operations.

## Capabilities

- GitHub authentication and account discovery for user and organization contexts.
- Repository bootstrap from a template repository, including support for private repositories and branch options.
- Automatic GitHub Environment creation for target stages (for example PROD and TEST).
- Context and pull request aware workflow that helps users select the right deployment environment.
- Environment secret and variable validation against expected deployment requirements.
- Secret and variable management support for GitHub Actions and environment-scoped configuration.
- Branch management support for deployment workflows, including branch creation.
- Workflow dispatch support to trigger GitHub Actions for deployment-related automation.
- End-to-end guided cards for Azure setup, AWS setup, deployment status, and deployment stage progression.
- Session-aware UX that can restore state from URL parameters to resume in-progress setup.

## Benefits

- Faster onboarding: Reduces time to first deployment by automating repetitive GitHub setup tasks.
- Fewer setup errors: Validates required secrets, variables, and environment readiness before deployment.
- Consistent delivery posture: Encourages standardized repository, environment, and workflow setup.
- Better cross-cloud coordination: Guides Azure and AWS prerequisites in a single experience.
- Lower operational friction: Teams can trigger and monitor deployment progression without manually stitching together multiple tools.

## Getting Started

Requirements:

- Plan: No separate ZenInstaller plan is required to access the web app; you still need active GitHub and cloud subscriptions for the resources you deploy.
- User Permissions: GitHub permissions to create repositories from templates, manage environments, and manage repository-level Actions secrets/variables. Organization policies must allow these actions where applicable.
- Availability: Publicly accessible via https://www.zeninstaller.com/.
- Onboarding Video: Optional. Add if your marketplace listing includes guided onboarding media.

Setup Process:

1. Sign in to ZenInstaller with your GitHub account and select the target account (user or organization).
2. Choose an existing repository or generate a new repository from the supported template, then configure environments.
3. Select PR/environment context, resolve required secrets and variables, and run the guided Azure/AWS deployment steps.
