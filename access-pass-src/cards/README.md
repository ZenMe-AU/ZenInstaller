# Cards Component Nesting Tree

This tree shows which container renders which child component.

## Active flow (rendered by AccessPassApp)

```text
AccessPassApp (access-pass-src/AccessPassApp.tsx)
└─ Connector (access-pass-src/components/Connector.tsx)
	├─ AccessPassLoginContainer (access-pass-src/cards/AccessPassLoginContainer.tsx)
	│  └─ StepWrapper (access-pass-src/components/StepWrapper.tsx)
	│     └─ AccessPassLoginPanel (access-pass-src/cards/AccessPassLoginPanel.tsx)
	└─ AccessPassContainer (access-pass-src/cards/AccessPassContainer.tsx)
		└─ AppInsightsErrorBoundary
			└─ StepWrapper (access-pass-src/components/StepWrapper.tsx)
				└─ AccessPassWorkflowPanel (access-pass-src/cards/AccessPassWorkflowPanel.tsx)
```

## Present in cards folder but not mounted by AccessPassApp

```text
AzureAccessPassContainer (access-pass-src/cards/AzureAccessPassContainer.tsx)
└─ StepWrapper (access-pass-src/components/StepWrapper.tsx)
	└─ AzureAccessPassPanel (access-pass-src/cards/AzureAccessPassPanel.tsx)
```

## Notes

- AccessPassLoginContainer is responsible for Azure sign-in and tenant confirmation UI.
- AccessPassContainer is responsible for Access Pass creation workflow UI.
- The AzureAccessPassContainer path appears to be an alternate or legacy path unless wired into AccessPassApp.
