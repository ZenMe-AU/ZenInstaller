/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { ApplicationInsights } from "@microsoft/applicationinsights-web";
import { ReactPlugin } from "@microsoft/applicationinsights-react-js";
import { ClickAnalyticsPlugin } from "@microsoft/applicationinsights-clickanalytics-js";
// import { getConfig } from "../config/loadConfig";
// TODO: inject runtime configuration instead of hardcoding
// const appInsightsConnectionString = getConfig("APPINSIGHTS_CONNECTION_STRING") || "";

const reactPlugin = new ReactPlugin();

// *** Add the Click Analytics plug-in. ***
const clickPluginInstance = new ClickAnalyticsPlugin();
const clickPluginConfig = {
  // autoCapture: true,
  autoCapture: false,
};
const appInsights = new ApplicationInsights({
  config: {
    connectionString: "InstrumentationKey=42e2815d-f1e9-4805-ac5a-332472e5c83f;IngestionEndpoint=https://australiaeast-1.in.applicationinsights.azure.com/;LiveEndpoint=https://australiaeast.livediagnostics.monitor.azure.com/;ApplicationId=64e04c6e-9645-41f2-87ae-eb7e28105f76",
    // enableAutoRouteTracking: true,
    // disableFetchTracking: false,
    // enableRequestHeaderTracking: true,
    // enableResponseHeaderTracking: true,
    // enableAjaxErrorStatusText: true,
    enableAutoRouteTracking: false,
    disableFetchTracking: true,
    enableRequestHeaderTracking: false,
    enableResponseHeaderTracking: false,
    enableAjaxErrorStatusText: false,
    // enableCorsCorrelation: true,
    // *** If you're adding the Click Analytics plug-in, delete the next line. ***
    // extensions: [reactPlugin],
    // *** Add the Click Analytics plug-in. ***
    extensions: [reactPlugin, clickPluginInstance],
    extensionConfig: {
      [reactPlugin.identifier]: {},
      // *** Add the Click Analytics plug-in. ***
      [clickPluginInstance.identifier]: clickPluginConfig,
    },
  },
});

appInsights.addTelemetryInitializer((envelope) => {
  if (envelope.tags) {
    envelope.tags["ai.cloud.role"] = "FrontendApp";
    envelope.tags["ai.cloud.roleInstance"] = "UI1";
  }

  // envelope.data.baseData.target = "FunctionApp:LocalChat";
  console.log(envelope);
});

appInsights.loadAppInsights();

export { appInsights };
