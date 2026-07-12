/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { ApplicationInsights } from "@microsoft/applicationinsights-web";
import { ReactPlugin } from "@microsoft/applicationinsights-react-js";
import { ClickAnalyticsPlugin } from "@microsoft/applicationinsights-clickanalytics-js";

export const reactPlugin = new ReactPlugin();
const clickPluginInstance = new ClickAnalyticsPlugin();
const clickPluginConfig = {
  autoCapture: true,
};
const CONNECTION_STRING = import.meta.env.VITE_APPINSIGHTS_CONNECTION_STRING_CORP || import.meta.env.VITE_APPINSIGHTS_CONNECTION_STRING || "";

export const appInsights = new ApplicationInsights({
  config: {
    connectionString: CONNECTION_STRING,
    enableAutoRouteTracking: true,
    samplingPercentage: 100,
    extensions: [reactPlugin, clickPluginInstance],
    extensionConfig: {
      [clickPluginInstance.identifier]: clickPluginConfig,
    },
  },
});
appInsights.loadAppInsights();
