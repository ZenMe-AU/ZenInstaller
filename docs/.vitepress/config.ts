import { defineConfig } from "vitepress";

export default defineConfig({
  title: "ZenInstaller Docs",
  description: "ZenInstaller documentation and guides",
  base: "/docs/",
  themeConfig: {
    sidebar: [
      {
        items: [
          {
            text: "Creating org Microsoft account",
            link: "/Creating_org_Microsoft_account",
          },
        ],
      },
    ],
    socialLinks: [],
    outline: {
      level: [2, 3],
    },
  },
});
